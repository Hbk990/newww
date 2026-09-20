<?php
namespace App\Controllers;

use App\Core\{Auth,Request,Response,Session,View};
use App\Repositories\{AuditLogRepository,ImportBatchRepository,ProductRepository};
use App\Services\{ImageUploadService,PlanAccessService,ProductImportService,SpreadsheetImportService,TenantContext};

final class ImportController
{
    public function index(Request$request):void{$store=(new TenantContext)->store();$access=(new PlanAccessService)->context((int)$store['id']);View::render('merchant/import',['title'=>'Import','store'=>$store,'preview'=>null,'bulkReport'=>Session::get('_bulk_image_report'),'canImport'=>(bool)($access['features']['catalog_import']??false),'canBulkImages'=>(bool)($access['features']['bulk_image_import']??false)],'merchant');Session::forget('_bulk_image_report');}
    public function template(Request$request):void{(new TenantContext)->store();header('Content-Type: text/csv; charset=UTF-8');header('Content-Disposition: attachment; filename="ministore-product-import.csv"');echo "SKU,Name,Category,Price,Compare Price,Description,Availability\r\n";echo "ABC123,Example product,Example category,10.00,12.00,Product description,AVAILABLE\r\n";exit;}
    public function preview(Request$request):void
    {
        $store=(new TenantContext)->store();try{(new PlanAccessService)->requireFeature((int)$store['id'],'catalog_import','Catalog import is available on Pro and Business plans.');$parsed=(new SpreadsheetImportService)->parse($request->file('sheet')??[]);}catch(\DomainException$e){Session::flash('error',$e->getMessage());Response::redirect('/merchant/import',303);}$token=null;if($parsed['rows']&&!$parsed['report']['errors'])$token=(new ImportBatchRepository)->create((int)$store['id'],(int)Auth::id(),(string)($request->file('sheet')['name']??'import'),$parsed['rows'],$parsed['report']);View::render('merchant/import',['title'=>'Import preview','store'=>$store,'preview'=>$parsed+['token'=>$token],'bulkReport'=>null,'canImport'=>true,'canBulkImages'=>(new PlanAccessService)->feature((int)$store['id'],'bulk_image_import')],'merchant');
    }
    public function commit(Request$request):void
    {
        $store=(new TenantContext)->store();$token=(string)$request->input('batch_token');try{(new PlanAccessService)->requireFeature((int)$store['id'],'catalog_import','Catalog import is available on Pro and Business plans.');$result=(new ImportBatchRepository)->commit((int)$store['id'],(int)Auth::id(),$token,fn(\PDO$pdo,array$rows)=>(new ProductImportService)->commit($pdo,(int)$store['id'],$rows));}catch(\DomainException$e){Session::flash('error',$e->getMessage());Response::redirect('/merchant/import',303);}(new AuditLogRepository)->record((int)Auth::id(),'products.imported','store',(int)$store['id'],$result);Session::flash('success',"Import complete: {$result['created']} created, {$result['updated']} updated, {$result['categories']} categories created. New products remain drafts for review.");Response::redirect('/products',303);
    }
    public function images(Request$request):void
    {
        $store=(new TenantContext)->store();try{(new PlanAccessService)->requireFeature((int)$store['id'],'bulk_image_import','Bulk image matching is available on Pro and Business plans.');}catch(\DomainException$e){Session::flash('error',$e->getMessage());Response::redirect('/merchant/import',303);}$files=$this->normalize($request->file('images')??[]);if(!$files){Session::flash('error','Choose one or more product images.');Response::redirect('/merchant/import',303);}if(count($files)>100){Session::flash('error','Bulk image matching is limited to 100 files per upload.');Response::redirect('/merchant/import',303);}$groups=[];foreach($files as$file){$sku=trim(pathinfo((string)$file['name'],PATHINFO_FILENAME));$groups[mb_strtolower($sku)][]=$file;}$products=(new ProductRepository)->bySkus((int)$store['id'],array_keys($groups));$report=['matched'=>[],'unmatched'=>[],'duplicates'=>[],'errors'=>[]];$uploader=new ImageUploadService;
        foreach($groups as$key=>$group){$filename=(string)($group[0]['name']??'image');if($key===''||!isset($products[$key])){$report['unmatched'][]=$filename;continue;}if(count($group)>1){$report['duplicates'][]=$products[$key]['sku'];continue;}try{$uploader->uploadMany((int)$store['id'],(int)$products[$key]['id'],$group[0]);$report['matched'][]=$products[$key]['sku'].' → '.$products[$key]['name'];}catch(\DomainException$e){$report['errors'][]=$filename.': '.$e->getMessage();}catch(\Throwable$e){\App\Support\Logger::error('Bulk image import failed',$e);$report['errors'][]=$filename.': the server could not process this image.';}}
        Session::put('_bulk_image_report',$report);(new AuditLogRepository)->record((int)Auth::id(),'product_images.bulk_matched','store',(int)$store['id'],array_map('count',$report));Response::redirect('/merchant/import',303);
    }
    private function normalize(array$files):array{if(!isset($files['name']))return[];if(!is_array($files['name']))return(int)($files['error']??UPLOAD_ERR_NO_FILE)===UPLOAD_ERR_NO_FILE?[]:[$files];$out=[];foreach($files['name']as$i=>$name)if((int)($files['error'][$i]??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_NO_FILE)$out[]=['name'=>$name,'type'=>$files['type'][$i]??'','tmp_name'=>$files['tmp_name'][$i]??'','error'=>$files['error'][$i]??UPLOAD_ERR_NO_FILE,'size'=>$files['size'][$i]??0];return$out;}
}
