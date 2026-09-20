<?php
namespace App\Services;

final class SpreadsheetImportService
{
    private const REQUIRED_HEADERS=['sku','name','category','price','compare_price','description','availability'];
    /**
     * A row with option_1_name filled is a variant row for the product group sharing its SKU.
     * Only the first row seen for a given SKU needs the required columns above — later variant
     * rows in the same group only need SKU plus these columns.
     */
    private const OPTION_HEADERS=['option_1_name','option_1_value','option_2_name','option_2_value','option_3_name','option_3_value'];
    private const VARIANT_HEADERS=['variant_sku','variant_price_adjustment','variant_stock'];
    private const MAX_VARIANT_ROWS_PER_PRODUCT=30;

    public function parse(array$file):array
    {
        if((int)($file['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_OK)throw new \DomainException('Choose a CSV or XLSX file.');if((int)$file['size']<=0||(int)$file['size']>2*1024*1024)throw new \DomainException('Import files must be smaller than 2 MB.');if(!is_uploaded_file($file['tmp_name'])&&PHP_SAPI!=='cli')throw new \DomainException('Invalid import upload.');
        $ext=mb_strtolower(pathinfo((string)$file['name'],PATHINFO_EXTENSION));$mime=(new \finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);if($ext==='csv'&&in_array($mime,['text/plain','text/csv','application/csv','application/vnd.ms-excel'],true))$matrix=$this->csv($file['tmp_name']);elseif($ext==='xlsx'&&in_array($mime,['application/zip','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],true))$matrix=$this->xlsx($file['tmp_name']);else throw new \DomainException('Only genuine CSV and XLSX files are accepted.');
        if(count($matrix)<2)throw new \DomainException('The file needs a header row and at least one product row.');$headers=array_map([$this,'header'],array_shift($matrix));if(count($headers)!==count(array_unique($headers)))throw new \DomainException('Spreadsheet headers must be unique.');$missing=array_diff(self::REQUIRED_HEADERS,$headers);if($missing)throw new \DomainException('Missing columns: '.implode(', ',$missing).'.');$indexes=array_flip($headers);$optionalHeaders=array_merge(self::OPTION_HEADERS,self::VARIANT_HEADERS);
        $rows=[];$errors=[];$warnings=[];$seenSku=[];$comboCounts=[];$seenCombos=[];
        foreach($matrix as$i=>$line){
            $number=$i+2;if(count(array_filter($line,static fn($v)=>trim((string)$v)!==''))===0)continue;
            $row=[];foreach(self::REQUIRED_HEADERS as$header)$row[$header]=trim((string)($line[$indexes[$header]]??''));
            foreach($optionalHeaders as$header){$idx=$indexes[$header]??null;$row[$header]=$idx===null?'':trim((string)($line[$idx]??''));}
            $row['availability']=strtoupper($row['availability']?:'AVAILABLE');
            $rowErrors=[];
            $skuKey=mb_strtolower($row['sku']);
            $isPrimary=$skuKey!==''&&!isset($seenSku[$skuKey]);
            if($skuKey!=='')$seenSku[$skuKey]??=$number;
            if($row['sku']===''||mb_strlen($row['sku'])>100)$rowErrors[]='SKU is required and must be at most 100 characters.';
            if($isPrimary){
                if(mb_strlen($row['name'])<2||mb_strlen($row['name'])>160)$rowErrors[]='Name must be 2–160 characters.';
                if(!$this->money($row['price']))$rowErrors[]='Price is invalid.';
                if($row['compare_price']!==''&&(!$this->money($row['compare_price'])||$this->minor($row['compare_price'])<=$this->minor($row['price'])))$rowErrors[]='Compare price must be greater than price.';
                if(mb_strlen($row['category'])>100)$rowErrors[]='Category is too long.';
                if(mb_strlen($row['description'])>10000)$rowErrors[]='Description is too long.';
                if(!in_array($row['availability'],['AVAILABLE','UNAVAILABLE'],true))$rowErrors[]='Availability must be AVAILABLE or UNAVAILABLE.';
            }
            $combo=$this->parseCombo($row,$rowErrors);
            if($combo){
                if(($comboCounts[$skuKey]=($comboCounts[$skuKey]??0)+1)>self::MAX_VARIANT_ROWS_PER_PRODUCT)$rowErrors[]='A single product is limited to '.self::MAX_VARIANT_ROWS_PER_PRODUCT.' variant rows.';
                $label=implode(' / ',array_map(static fn($pair)=>$pair[0].': '.$pair[1],$combo));
                if(isset($seenCombos[$skuKey][$label]))$rowErrors[]='This variant combination duplicates row '.$seenCombos[$skuKey][$label].'.';
                $seenCombos[$skuKey][$label]=$number;
                if($row['variant_sku']!==''&&mb_strlen($row['variant_sku'])>100)$rowErrors[]='Variant SKU must be at most 100 characters.';
                if($row['variant_price_adjustment']!==''&&!$this->signedMoney($row['variant_price_adjustment']))$rowErrors[]='Variant price adjustment is invalid.';
                if($row['variant_stock']!==''&&(!ctype_digit($row['variant_stock'])||(int)$row['variant_stock']>4294967295))$rowErrors[]='Variant stock must be a whole non-negative number.';
            } elseif(!$isPrimary&&$skuKey!==''&&isset($seenCombos[$skuKey])){
                $rowErrors[]='This SKU already defines variants elsewhere in the file — add an option to this row or give it its own SKU.';
            } elseif(!$isPrimary){
                $rowErrors[]='SKU duplicates row '.$seenSku[$skuKey].'. Add option columns to make this a variant row, or use a different SKU.';
            }
            if($rowErrors){$errors[]=['row'=>$number,'messages'=>$rowErrors];continue;}
            if($isPrimary&&$row['category']!=='')$warnings[]=['row'=>$number,'message'=>'Category will be reused by name or created if missing.'];
            $row['row']=$number;$row['is_primary']=$isPrimary;$row['combo']=$combo;$rows[]=$row;
        }
        $products=count(array_unique(array_column($rows,'sku')));$variantRows=count(array_filter($rows,static fn($r)=>$r['combo']!==null));
        return['rows'=>$rows,'report'=>['valid'=>count($rows),'errors'=>$errors,'warnings'=>$warnings,'total'=>count($matrix),'products'=>$products,'variant_rows'=>$variantRows]];
    }

    /** @return array<int,array{0:string,1:string}>|null null when the row defines no variant (a plain product/primary row); an ordered list of [option name, value] pairs otherwise. */
    private function parseCombo(array$row,array&$errors):?array
    {
        $pairs=[];$sawBlank=false;
        foreach([1,2,3]as$n){
            $name=$row["option_{$n}_name"];$value=$row["option_{$n}_value"];
            if($name===''&&$value===''){$sawBlank=true;continue;}
            if($name===''||$value===''){$errors[]="Option {$n} name and value must both be filled or both blank.";continue;}
            if($sawBlank){$errors[]="Fill options in order — option {$n} is set but an earlier option is blank.";continue;}
            if(mb_strlen($name)>80)$errors[]="Option {$n} name must be at most 80 characters.";
            if(mb_strlen($value)>100)$errors[]="Option {$n} value must be at most 100 characters.";
            foreach($pairs as$existing)if(mb_strtolower($existing[0])===mb_strtolower($name))$errors[]='Option names must be unique within a row.';
            $pairs[]=[$name,$value];
        }
        return$pairs?:null;
    }

    private function csv(string$path):array{$h=fopen($path,'rb');if(!$h)throw new \DomainException('Could not read CSV file.');$rows=[];while(($row=fgetcsv($h,0,','))!==false){if(count($rows)>500){fclose($h);throw new \DomainException('Imports are limited to 500 rows.');}$rows[]=$row;}fclose($h);if(isset($rows[0][0]))$rows[0][0]=preg_replace('/^\xEF\xBB\xBF/','',(string)$rows[0][0]);return$rows;}
    private function xlsx(string$path):array
    {
        if(!class_exists(\ZipArchive::class)||!function_exists('simplexml_load_string'))throw new \DomainException('XLSX support requires the PHP Zip and SimpleXML extensions. Use CSV on this server.');$zip=new \ZipArchive;if($zip->open($path)!==true)throw new \DomainException('Could not open XLSX file.');$uncompressed=0;for($i=0;$i<$zip->numFiles;$i++){$stat=$zip->statIndex($i);$uncompressed+=(int)($stat['size']??0);if($uncompressed>20*1024*1024){$zip->close();throw new \DomainException('The XLSX expands beyond the safe 20 MB limit.');}}
        $shared=[];$sharedXml=$zip->getFromName('xl/sharedStrings.xml');if(is_string($sharedXml)){libxml_use_internal_errors(true);$xml=simplexml_load_string($sharedXml,'SimpleXMLElement',LIBXML_NONET);if($xml)foreach($xml->si as$si){$text=(string)$si->t;foreach($si->r as$run)$text.=(string)$run->t;$shared[]=trim($text);}}
        $sheet=$zip->getFromName('xl/worksheets/sheet1.xml');$zip->close();if(!is_string($sheet))throw new \DomainException('The first worksheet could not be read.');libxml_use_internal_errors(true);$xml=simplexml_load_string($sheet,'SimpleXMLElement',LIBXML_NONET);if(!$xml)throw new \DomainException('The XLSX worksheet is invalid.');$rows=[];foreach($xml->sheetData->row as$row){$values=[];foreach($row->c as$cell){$ref=(string)$cell['r'];preg_match('/^[A-Z]+/',$ref,$match);$index=$this->columnIndex($match[0]??'A');$type=(string)$cell['t'];$value=$type==='inlineStr'?(string)$cell->is->t:(string)$cell->v;if($type==='s')$value=$shared[(int)$value]??'';$values[$index]=$value;}if($values){$width=max(array_keys($values))+1;$rows[]=array_replace(array_fill(0,$width,''),$values);if(count($rows)>501)throw new \DomainException('Imports are limited to 500 rows.');}}return$rows;
    }
    private function columnIndex(string$letters):int{$number=0;foreach(str_split($letters)as$char)$number=$number*26+(ord($char)-64);return max(0,$number-1);}
    private function header(string$value):string{$value=mb_strtolower(trim(preg_replace('/^\xEF\xBB\xBF/','',$value)));return trim(preg_replace('/[^a-z0-9]+/','_',$value)??'','_');}
    private function money(string$value):bool{return(bool)preg_match('/^\d{1,10}(?:\.\d{1,2})?$/',$value);}
    private function signedMoney(string$value):bool{return(bool)preg_match('/^-?\d{1,8}(?:\.\d{1,2})?$/',$value);}
    private function minor(string$value):int{[$whole,$decimal]=array_pad(explode('.',$value,2),2,'');return(int)$whole*100+(int)str_pad(substr($decimal,0,2),2,'0');}
}
