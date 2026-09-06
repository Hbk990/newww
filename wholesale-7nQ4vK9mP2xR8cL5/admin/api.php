<?php
declare(strict_types=1);
require_once __DIR__ . '/../inc/bootstrap.php';
require_admin();

if($_SERVER['REQUEST_METHOD']==='GET'&&($_GET['download']??'')==='data-backup'){
    $payload=['created_at'=>gmdate('c'),'catalog'=>catalog(),'settings'=>settings(),'activity'=>load_json(ACTIVITY_FILE,[])];
    header('Content-Type: application/json; charset=utf-8');header('Content-Disposition: attachment; filename="DR-PHONE-data-backup-'.gmdate('Y-m-d').'.json"');header('Cache-Control: no-store');echo json_encode($payload,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);exit;
}
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $siteSettings=settings(); $siteSettings['recovery_codes_remaining']=count($siteSettings['two_factor_recovery_hashes']??[]); unset($siteSettings['admin_password_hash'],$siteSettings['customer_password_hash'],$siteSettings['two_factor_secret'],$siteSettings['two_factor_recovery_hashes']);
    $currentCatalog=catalog();
    json_response(['ok'=>true,'catalog'=>$currentCatalog,'settings'=>$siteSettings,'csrf'=>csrf_token(),'backups'=>catalog_backups(),'activity'=>load_json(ACTIVITY_FILE,[]),'image_audit'=>image_audit($currentCatalog),'opencv_audit'=>load_json(OPENCV_AUDIT_FILE,[])]);
}
verify_csrf();
$action=(string)($_POST['action']??'');

try {
    $data=catalog();
    if($action==='begin_two_factor'){
        $current=settings();if(!password_verify((string)($_POST['current_password']??''),(string)($current['admin_password_hash']??'')))throw new RuntimeException('Current admin password is incorrect.');
        $_SESSION['pending_two_factor_secret']=generate_totp_secret();$issuer=rawurlencode('DR PHONE');$account=rawurlencode((string)($current['admin_username']??'admin'));
        json_response(['ok'=>true,'message'=>'Add the setup key to your authenticator, then enter its 6-digit code.','setup_key'=>$_SESSION['pending_two_factor_secret'],'otpauth_uri'=>'otpauth://totp/'.$issuer.':'.$account.'?secret='.$_SESSION['pending_two_factor_secret'].'&issuer='.$issuer]);
    }
    if($action==='confirm_two_factor'){
        $current=settings();if(!password_verify((string)($_POST['current_password']??''),(string)($current['admin_password_hash']??'')))throw new RuntimeException('Current admin password is incorrect.');
        $secret=(string)($_SESSION['pending_two_factor_secret']??'');if($secret===''||!verify_totp($secret,(string)($_POST['otp']??'')))throw new RuntimeException('The authenticator code is incorrect or expired.');
        $recovery=generate_recovery_codes();$current['two_factor_enabled']=true;$current['two_factor_secret']=$secret;$current['two_factor_recovery_hashes']=$recovery['hashes'];backup_settings();save_json(SETTINGS_FILE,$current);unset($_SESSION['pending_two_factor_secret']);log_activity('Two-factor authentication enabled');
        $safe=$current;$safe['recovery_codes_remaining']=count($recovery['hashes']);unset($safe['admin_password_hash'],$safe['customer_password_hash'],$safe['two_factor_secret'],$safe['two_factor_recovery_hashes']);json_response(['ok'=>true,'message'=>'Two-factor authentication enabled. Save the recovery codes now.','settings'=>$safe,'recovery_codes'=>$recovery['plain']]);
    }
    if($action==='disable_two_factor'){
        $current=settings();if(!password_verify((string)($_POST['current_password']??''),(string)($current['admin_password_hash']??'')))throw new RuntimeException('Current admin password is incorrect.');
        $current['two_factor_enabled']=false;$current['two_factor_secret']='';$current['two_factor_recovery_hashes']=[];backup_settings();save_json(SETTINGS_FILE,$current);unset($_SESSION['pending_two_factor_secret']);log_activity('Two-factor authentication disabled');
        $safe=$current;$safe['recovery_codes_remaining']=0;unset($safe['admin_password_hash'],$safe['customer_password_hash'],$safe['two_factor_secret'],$safe['two_factor_recovery_hashes']);json_response(['ok'=>true,'message'=>'Two-factor authentication disabled.','settings'=>$safe]);
    }
    if ($action==='add_category'||$action==='update_category') {
        $name=clean_text($_POST['name']??'',100);$group=clean_text($_POST['group']??'Other',100)?:'Other'; if($name==='') throw new RuntimeException('Category name is required.');
        if($action==='update_category'){$original=clean_text($_POST['original_slug']??'',100);$found=false;foreach($data as &$category){if($category['slug']!==$original)continue;$oldName=$category['name'];$category['name']=$name;$category['group']=$group;$found=true;break;}unset($category);if(!$found)throw new RuntimeException('Category not found.');save_catalog($data);log_activity('Category updated',$oldName.' → '.$name);json_response(['ok'=>true,'message'=>'Category updated.','catalog'=>$data]);}
        $base=slugify($name); $slug=$base; $used=array_column($data,'slug'); $i=2; while(in_array($slug,$used,true))$slug=$base.'-'.$i++;
        $data[]=['name'=>$name,'slug'=>$slug,'group'=>$group,'products'=>[]]; save_catalog($data); log_activity('Category added',$name); json_response(['ok'=>true,'message'=>'Category added.','catalog'=>$data]);
    }
    if($action==='delete_category'){
        $slug=clean_text($_POST['slug']??'',100);$index=null;foreach($data as $ci=>$category)if($category['slug']===$slug){$index=$ci;break;}if($index===null)throw new RuntimeException('Category not found.');if(!empty($data[$index]['products']))throw new RuntimeException('Move or remove this category’s products before deleting it.');$name=$data[$index]['name'];array_splice($data,$index,1);save_catalog($data);log_activity('Category deleted',$name);json_response(['ok'=>true,'message'=>'Category deleted.','catalog'=>$data]);
    }
    if($action==='reorder_category'){
        $slug=clean_text($_POST['slug']??'',100);$direction=(string)($_POST['direction']??'');$index=null;foreach($data as $ci=>$category)if($category['slug']===$slug){$index=$ci;break;}if($index===null)throw new RuntimeException('Category not found.');$step=$direction==='up'?-1:($direction==='down'?1:0);$target=$index+$step;$group=(string)($data[$index]['group']??'Other');while($target>=0&&$target<count($data)&&(string)($data[$target]['group']??'Other')!==$group)$target+=$step;if($step===0||$target<0||$target>=count($data))throw new RuntimeException('Category is already at the end of its group.');[$data[$index],$data[$target]]=[$data[$target],$data[$index]];save_catalog($data);log_activity('Category reordered',(string)$data[$target]['name']);json_response(['ok'=>true,'message'=>'Category order updated.','catalog'=>$data]);
    }

    if ($action==='save_product') {
        $id=(int)($_POST['id']??0); $categorySlug=clean_text($_POST['category']??'',100); $name=clean_text($_POST['name']??'',250);
        if($name===''||$categorySlug==='') throw new RuntimeException('Category and product name are required.');
        $targetIndex=null; foreach($data as $index=>$category)if($category['slug']===$categorySlug){$targetIndex=$index;break;}
        if($targetIndex===null) throw new RuntimeException('Selected category was not found.');
        $image=save_uploaded_image('image'); $gallery=save_uploaded_images('images'); $existing=null; $existingCategory=null;
        if($id>0){foreach($data as $ci=>&$category){foreach($category['products'] as $pi=>$product){if((int)$product['id']===$id){$existing=$product;$existingCategory=$ci;unset($category['products'][$pi]);$category['products']=array_values($category['products']);break 2;}}}unset($category);if(!$existing)throw new RuntimeException('Product not found.');}
        else{$max=0;foreach($data as $category)foreach($category['products'] as $product)$max=max($max,(int)$product['id']);$id=$max+1;}
        $oldImageToDelete=null;
        if(!$image)$image=$existing['image']??null;
        elseif(!empty($existing['image'])&&str_starts_with($existing['image'],'uploads/products/'))$oldImageToDelete=ROOT_DIR.'/'.$existing['image'];
        $existingImages=(array)($existing['images']??[]);if($image&&$existing&&!empty($existing['image']))$existingImages=array_values(array_filter($existingImages,fn($item)=>(string)$item!==(string)$existing['image']));
        $images=array_values(array_unique(array_filter(array_merge($image?[$image]:[], $existingImages, $gallery))));
        $sku=strtoupper(clean_text($_POST['sku']??'',64));if($sku==='')$sku='DR-'.str_pad((string)$id,6,'0',STR_PAD_LEFT);if(!preg_match('/^[A-Z0-9._-]{2,64}$/',$sku))throw new RuntimeException('SKU may contain only letters, numbers, dots, dashes and underscores.');foreach($data as $category)foreach($category['products'] as $product)if(strcasecmp((string)($product['sku']??''),$sku)===0)throw new RuntimeException('This SKU is already used by another product.');
        $rawPrice=trim((string)($_POST['price']??'')); $price=$rawPrice===''?null:max(0,(float)$rawPrice);
        $options=clean_options($_POST['options']??''); $colors=clean_lines($_POST['colors']??'',50,100); $flavors=clean_lines($_POST['flavors']??'',100,180);
        $variantStock=clean_variant_stock($_POST['variant_stock']??''); $variantQuantity=clean_variant_quantity($_POST['variant_quantity']??'');
        if(!$colors)$colors=['Standard'];
        $stock=(string)($_POST['stock']??'in-stock'); if(!in_array($stock,['in-stock','low-stock','out-of-stock'],true))$stock='in-stock';
        $stockQuantity=max(0,(int)($_POST['stock_quantity']??0)); $visibility=in_array($_POST['visibility']??'published',['published','draft','hidden'],true)?(string)$_POST['visibility']:'published';
        $restockedAt=$existing['restocked_at']??null; if($existing&&($existing['stock']??'')==='out-of-stock'&&$stock!=='out-of-stock')$restockedAt=gmdate('c');
        $stockUpdatedAt=$existing['stock_updated_at']??null;if(!$existing||($existing['stock']??null)!==$stock||($existing['stock_quantity']??null)!==$stockQuantity||($existing['variant_stock']??[])!==$variantStock||($existing['variant_quantity']??[])!==$variantQuantity)$stockUpdatedAt=gmdate('c');
        $data[$targetIndex]['products'][]=['id'=>$id,'sku'=>$sku,'name'=>$name,'brand'=>clean_text($_POST['brand']??'',100),'price'=>$options?null:$price,'options'=>$options,'tiers'=>clean_tiers($_POST['tiers']??''),'colors'=>$colors,'flavors'=>$flavors,'stock'=>$stock,'stock_quantity'=>$stockQuantity,'stock_updated_at'=>$stockUpdatedAt,'visibility'=>$visibility,'variant_stock'=>$variantStock,'variant_quantity'=>$variantQuantity,'color'=>implode(' ',$colors),'type'=>clean_text($_POST['type']??'',300),'image'=>$image,'images'=>$images,'added_at'=>$existing['added_at']??gmdate('c'),'restocked_at'=>$restockedAt];
        save_catalog($data); if($oldImageToDelete)delete_unreferenced_product_images($data,['uploads/products/'.basename($oldImageToDelete)]); log_activity($existing?'Product updated':'Product added',$name); json_response(['ok'=>true,'message'=>$existing?'Product updated.':'Product added.','catalog'=>$data]);
    }

    if ($action==='save_settings') {
        $current=settings(); $currentPassword=(string)($_POST['current_password']??'');
        if(empty($current['admin_password_hash'])||!password_verify($currentPassword,(string)$current['admin_password_hash']))throw new RuntimeException('Current admin password is incorrect.');
        $username=clean_text($_POST['admin_username']??'',64);
        if(!preg_match('/^[A-Za-z0-9._-]{3,64}$/',$username))throw new RuntimeException('Username must be 3–64 letters, numbers, dots, dashes or underscores.');
        $newPassword=(string)($_POST['new_password']??''); $confirm=(string)($_POST['confirm_password']??'');
        if($newPassword!==''&&strlen($newPassword)<12)throw new RuntimeException('New password must contain at least 12 characters.');
        if($newPassword!==$confirm)throw new RuntimeException('New passwords do not match.');
        $customerHash=(string)($current['customer_password_hash']??CUSTOMER_PASSWORD_HASH);
        if($newPassword!==''&&password_verify($newPassword,$customerHash))throw new RuntimeException('Admin and customer passwords must be different.');
        $newCustomerPasscode=(string)($_POST['new_customer_passcode']??''); $confirmCustomerPasscode=(string)($_POST['confirm_customer_passcode']??'');
        if($newCustomerPasscode!==''&&strlen($newCustomerPasscode)<8)throw new RuntimeException('Customer passcode must contain at least 8 characters.');
        if($newCustomerPasscode!==$confirmCustomerPasscode)throw new RuntimeException('Customer passcodes do not match.');
        $effectiveAdminHash=$newPassword!==''?password_hash($newPassword,PASSWORD_DEFAULT):(string)$current['admin_password_hash'];
        if($newCustomerPasscode!==''&&password_verify($newCustomerPasscode,$effectiveAdminHash))throw new RuntimeException('Admin and customer passwords must be different.');
        $current['admin_username']=$username;
        if($newPassword!=='')$current['admin_password_hash']=$effectiveAdminHash;
        if($newCustomerPasscode!=='')$current['customer_password_hash']=password_hash($newCustomerPasscode,PASSWORD_DEFAULT);
        $current['phone']=clean_text($_POST['phone']??'',50); $current['location']=clean_text($_POST['location']??'',150); $current['map_url']=filter_var(trim((string)($_POST['map_url']??'')),FILTER_VALIDATE_URL)?:'';
        $currency=strtoupper(trim((string)($_POST['currency']??''))); $current['currency']=preg_match('/^[A-Z]{3}$/',$currency)?$currency:'USD'; $current['minimum_order']=max(0,(float)($_POST['minimum_order']??0)); $current['payment_terms']=clean_text($_POST['payment_terms']??'',300); $current['delivery_terms']=clean_text($_POST['delivery_terms']??'',300);
        if($current['phone']===''||$current['location']===''||$current['map_url']==='')throw new RuntimeException('Phone, location and a valid map link are required.');
        backup_settings(); save_json(SETTINGS_FILE,$current); $safe=$current; $safe['recovery_codes_remaining']=count($safe['two_factor_recovery_hashes']??[]); unset($safe['admin_password_hash'],$safe['customer_password_hash'],$safe['two_factor_secret'],$safe['two_factor_recovery_hashes']);
        log_activity('Store settings updated'); json_response(['ok'=>true,'message'=>'Account, contact and store settings updated.','settings'=>$safe]);
    }

    if ($action==='delete_product') {
        $id=(int)($_POST['id']??0); $deleted=null;
        foreach($data as &$category){foreach($category['products'] as $pi=>$product){if((int)$product['id']===$id){$deleted=$product;unset($category['products'][$pi]);$category['products']=array_values($category['products']);break 2;}}}unset($category);
        if(!$deleted)throw new RuntimeException('Product not found.'); save_catalog($data);
        delete_unreferenced_product_images($data,array_merge([(string)($deleted['image']??'')],(array)($deleted['images']??[])));
        log_activity('Product removed',(string)($deleted['name']??$id)); json_response(['ok'=>true,'message'=>'Product removed.','catalog'=>$data]);
    }
    if($action==='bulk_update'){
        $ids=array_values(array_unique(array_map('intval',explode(',',(string)($_POST['ids']??''))))); if(!$ids)throw new RuntimeException('Select at least one product.');
        $stockUpdate=(string)($_POST['stock']??''); $visibility=(string)($_POST['visibility']??''); $categorySlug=clean_text($_POST['category']??'',100); $categoryTarget=null;
        if($categorySlug!==''){foreach($data as $ci=>$category)if($category['slug']===$categorySlug){$categoryTarget=$ci;break;}if($categoryTarget===null)throw new RuntimeException('Target category not found.');}
        $moved=[]; foreach($data as &$category){foreach($category['products'] as $pi=>&$product){if(!in_array((int)$product['id'],$ids,true))continue;if(in_array($stockUpdate,['in-stock','low-stock','out-of-stock'],true)){$product['stock']=$stockUpdate;$product['stock_updated_at']=gmdate('c');}if(in_array($visibility,['published','draft','hidden'],true))$product['visibility']=$visibility;if($categoryTarget!==null&&$category['slug']!==$categorySlug){$moved[]=$product;unset($category['products'][$pi]);}}$category['products']=array_values($category['products']);}unset($category,$product);if($moved)$data[$categoryTarget]['products']=array_merge($data[$categoryTarget]['products'],$moved);
        save_catalog($data); log_activity('Bulk product update',count($ids).' products'); json_response(['ok'=>true,'message'=>count($ids).' products updated.','catalog'=>$data]);
    }
    if($action==='verify_inventory'){
        $ids=array_values(array_unique(array_map('intval',explode(',',(string)($_POST['ids']??'')))));if(!$ids)throw new RuntimeException('Select at least one product.');$verified=0;$now=gmdate('c');foreach($data as &$category)foreach($category['products'] as &$product)if(in_array((int)$product['id'],$ids,true)){$product['stock_updated_at']=$now;$verified++;}unset($category,$product);if(!$verified)throw new RuntimeException('No matching products were found.');save_catalog($data);log_activity('Inventory reviewed',$verified.' products');json_response(['ok'=>true,'message'=>$verified.' stock records marked as reviewed.','catalog'=>$data]);
    }
    if($action==='restore_backup'){$data=restore_catalog_backup(clean_text($_POST['backup']??'',150));json_response(['ok'=>true,'message'=>'Catalog backup restored.','catalog'=>$data,'backups'=>catalog_backups()]);}
    if($action==='import_product_images'){
        $files=$_FILES['product_images']??null;
        if(!$files||!is_array($files['name']??null))throw new RuntimeException('Choose one or more product pictures.');
        $fileCount=count($files['name']);
        if($fileCount<1)throw new RuntimeException('Choose one or more product pictures.');
        if($fileCount>100)throw new RuntimeException('Upload no more than 100 pictures at a time.');
        $skuIndex=[];
        foreach($data as $ci=>$category)foreach(($category['products']??[]) as $pi=>$product){$sku=strtoupper(trim((string)($product['sku']??'')));if($sku!=='')$skuIndex[$sku]=[$ci,$pi];}
        $matched=0;$primary=0;$gallery=0;$unmatched=[];$errors=[];$stored=[];$replaced=[];
        for($i=0;$i<$fileCount;$i++){
            $original=basename((string)($files['name'][$i]??''));
            if($original==='')continue;
            $base=trim((string)pathinfo($original,PATHINFO_FILENAME));$lookup=strtoupper($base);$galleryNumber=null;
            if(!isset($skuIndex[$lookup])&&preg_match('/^(.+?)[_-](\d{1,2})$/',$lookup,$parts)&&((int)$parts[2])>=2&&isset($skuIndex[$parts[1]])){$lookup=$parts[1];$galleryNumber=(int)$parts[2];}
            if(!isset($skuIndex[$lookup])){$unmatched[]=$original;continue;}
            [$ci,$pi]=$skuIndex[$lookup];
            $file=['name'=>$original,'type'=>$files['type'][$i]??'','tmp_name'=>$files['tmp_name'][$i]??'','error'=>$files['error'][$i]??UPLOAD_ERR_NO_FILE,'size'=>$files['size'][$i]??0];
            try{
                if($galleryNumber!==null){
                    $current=array_values(array_unique(array_filter((array)($data[$ci]['products'][$pi]['images']??[]))));
                    if(count($current)>=6)throw new RuntimeException('This product already has the maximum of 6 gallery pictures.');
                    $path=store_uploaded_image($file);$stored[]=$path;$current[]=$path;$data[$ci]['products'][$pi]['images']=array_values(array_unique($current));$gallery++;
                }else{
                    $oldPrimary=(string)($data[$ci]['products'][$pi]['image']??'');if($oldPrimary!=='')$replaced[]=$oldPrimary;
                    $current=array_values(array_filter((array)($data[$ci]['products'][$pi]['images']??[]),fn($item)=>(string)$item!==$oldPrimary));
                    $path=store_uploaded_image($file);$stored[]=$path;$data[$ci]['products'][$pi]['image']=$path;$data[$ci]['products'][$pi]['images']=array_slice(array_values(array_unique(array_merge([$path],$current))),0,6);$primary++;
                }
                $matched++;
            }catch(Throwable $uploadError){$errors[]=$original.': '.$uploadError->getMessage();}
        }
        if(!$matched){$detail=$unmatched?' No filename matched a product SKU.':'';throw new RuntimeException('No pictures were imported.'.$detail.($errors?' '.$errors[0]:''));}
        try{save_catalog($data);}catch(Throwable $saveError){foreach($stored as $path)if(str_starts_with($path,'uploads/products/'))@unlink(ROOT_DIR.'/'.$path);throw $saveError;}
        $removed=delete_unreferenced_product_images($data,$replaced);log_activity('Product pictures imported',$matched.' matched; '.$removed.' replaced files removed; '.count($unmatched).' unmatched; '.count($errors).' failed');
        json_response(['ok'=>true,'message'=>$matched.' pictures matched ('.$primary.' primary, '.$gallery.' gallery); '.$removed.' replaced files removed.','catalog'=>$data,'matched'=>$matched,'primary'=>$primary,'gallery'=>$gallery,'removed'=>$removed,'unmatched'=>array_slice($unmatched,0,100),'errors'=>array_slice($errors,0,100)]);
    }
    if($action==='prune_orphan_images'){$deleted=prune_orphan_product_images($data);log_activity('Unused pictures cleaned',$deleted.' files deleted');json_response(['ok'=>true,'message'=>$deleted?$deleted.' unused picture files deleted.':'No unused picture files were found.']);}
    if($action==='save_opencv_audit'){
        $decoded=json_decode((string)($_POST['results']??''),true);if(!is_array($decoded)||count($decoded)>50)throw new RuntimeException('Invalid image-audit results.');$saved=load_json(OPENCV_AUDIT_FILE,[]);$count=0;
        foreach($decoded as $result){if(!is_array($result))continue;$id=max(0,(int)($result['id']??0));$image=clean_text($result['image']??'',250);$status=(string)($result['status']??'warning');if(!$id||!preg_match('#^(uploads/products/[A-Za-z0-9._-]+|https?://)#',$image)||!in_array($status,['pass','warning','fail'],true))continue;$reasons=[];foreach(array_slice((array)($result['reasons']??[]),0,10) as $reason){$clean=clean_text($reason,180);if($clean!=='')$reasons[]=$clean;}$saved[(string)$id]=['id'=>$id,'image'=>$image,'status'=>$status,'width'=>max(0,(int)($result['width']??0)),'height'=>max(0,(int)($result['height']??0)),'sharpness'=>round(max(0,(float)($result['sharpness']??0)),1),'brightness'=>round(min(255,max(0,(float)($result['brightness']??0))),1),'contrast'=>round(min(255,max(0,(float)($result['contrast']??0))),1),'crop_risk'=>round(min(100,max(0,(float)($result['crop_risk']??0))),1),'background_uniformity'=>round(min(100,max(0,(float)($result['background_uniformity']??0))),1),'reasons'=>$reasons,'audited_at'=>gmdate('c')];$count++;}
        save_json(OPENCV_AUDIT_FILE,$saved);if(!empty($_POST['finished']))log_activity('OpenCV image audit completed',count($saved).' stored results');json_response(['ok'=>true,'message'=>$count.' image-audit results saved.']);
    }
    if($action==='clear_opencv_audit'){save_json(OPENCV_AUDIT_FILE,[]);log_activity('OpenCV image-audit results cleared');json_response(['ok'=>true,'message'=>'Saved OpenCV audit results cleared.','opencv_audit'=>[]]);}
    if($action==='import_csv'){
        if(empty($_FILES['csv'])||($_FILES['csv']['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_OK)throw new RuntimeException('Choose a CSV file exported from the dashboard.');
        $handle=fopen($_FILES['csv']['tmp_name'],'r'); if(!$handle)throw new RuntimeException('Could not read CSV file.');
        $headers=fgetcsv($handle); if(!$headers)throw new RuntimeException('CSV has no header row.');
        $headers=array_map(fn($h)=>strtolower(trim((string)preg_replace('/^\xEF\xBB\xBF/','',(string)$h))), $headers);
        $count=0;$created=0;$updated=0;$max=0;
        foreach($data as $category)foreach(($category['products']??[]) as $product)$max=max($max,(int)$product['id']);
        while(($row=fgetcsv($handle))!==false){
            $row=array_slice(array_pad($row,count($headers),''),0,count($headers));
            $record=array_combine($headers,$row); if(!$record||trim((string)($record['name']??''))==='')continue;
            $requestedId=max(0,(int)($record['product_id']??0));$existing=null;
            if($requestedId>0){foreach($data as &$category){foreach(($category['products']??[]) as $pi=>$product){if((int)$product['id']===$requestedId){$existing=$product;unset($category['products'][$pi]);$category['products']=array_values($category['products']);break 2;}}}unset($category);}
            $id=$requestedId>0?$requestedId:++$max;$max=max($max,$id);
            $categoryName=clean_text($record['category']??'Imported',100)?:'Imported';$categoryGroup=clean_text($record['category_group']??'Other',100)?:'Other';$requestedSlug=clean_text($record['category_slug']??'',100);$slug=$requestedSlug!==''?slugify($requestedSlug):slugify($categoryName);$ci=null;
            foreach($data as $index=>$category)if($category['slug']===$slug){$ci=$index;break;}
            if($ci===null){$data[]=['name'=>$categoryName,'slug'=>$slug,'group'=>$categoryGroup,'products'=>[]];$ci=count($data)-1;}elseif(!empty($record['category_group']))$data[$ci]['group']=$categoryGroup;
            $options=csv_options($record['options_json']??'');$tiers=csv_tiers($record['tiers_json']??'');
            $colors=csv_list($record['colors_json']??($record['colors']??''),50,100)?:['Standard'];
            $flavors=csv_list($record['flavors_json']??($record['flavors']??''),100,180);
            $variantStock=csv_variant_stock($record['variant_stock_json']??'');$variantQuantity=csv_variant_quantity($record['variant_quantity_json']??'');
            $image=csv_image_reference($record['image']??'')??($existing['image']??null);$images=[];
            foreach(csv_json_array($record['images_json']??'') as $candidate){$valid=csv_image_reference($candidate);if($valid)$images[]=$valid;}
            if(!$images)$images=$existing['images']??[];
            $stock=in_array($record['stock']??'',['in-stock','low-stock','out-of-stock'],true)?$record['stock']:'in-stock';
            $visibility=in_array($record['visibility']??'',['published','draft','hidden'],true)?$record['visibility']:'published';
            $rawPrice=trim((string)($record['price']??''));$price=$options?null:(is_numeric($rawPrice)?max(0,(float)$rawPrice):null);
            $sku=strtoupper(clean_text($record['sku']??'',64));if($sku==='')$sku=$existing['sku']??('DR-'.str_pad((string)$id,6,'0',STR_PAD_LEFT));if(!preg_match('/^[A-Z0-9._-]{2,64}$/',$sku))throw new RuntimeException('Invalid SKU for '.$record['name'].'.');foreach($data as $category)foreach($category['products'] as $product)if(strcasecmp((string)($product['sku']??''),$sku)===0)throw new RuntimeException('Duplicate SKU in CSV: '.$sku);
            $stockUpdatedAt=clean_text($record['stock_updated_at']??'',40)?:($existing['stock_updated_at']??null);if(!$existing||($existing['stock']??null)!==$stock||($existing['stock_quantity']??null)!==max(0,(int)($record['stock_quantity']??0))||($existing['variant_stock']??[])!==$variantStock||($existing['variant_quantity']??[])!==$variantQuantity)$stockUpdatedAt=gmdate('c');
            $data[$ci]['products'][]=['id'=>$id,'sku'=>$sku,'name'=>clean_text($record['name'],250),'brand'=>clean_text($record['brand']??'',100),'price'=>$price,'options'=>$options,'tiers'=>$tiers,'colors'=>$colors,'flavors'=>$flavors,'stock'=>$stock,'stock_quantity'=>max(0,(int)($record['stock_quantity']??0)),'stock_updated_at'=>$stockUpdatedAt,'visibility'=>$visibility,'variant_stock'=>$variantStock,'variant_quantity'=>$variantQuantity,'color'=>implode(' ',$colors),'type'=>clean_text($record['details']??'',300),'image'=>$image,'images'=>array_values(array_unique($images)),'added_at'=>clean_text($record['added_at']??'',40)?:($existing['added_at']??gmdate('c')),'restocked_at'=>clean_text($record['restocked_at']??'',40)?:($existing['restocked_at']??null)];
            $count++;$existing?$updated++:$created++;
        }
        fclose($handle);if(!$count)throw new RuntimeException('No valid product rows were found.');save_catalog($data);$detail=$created.' created, '.$updated.' updated';log_activity('Spreadsheet imported',$detail);json_response(['ok'=>true,'message'=>$count.' products imported ('.$detail.').','catalog'=>$data]);
    }
    throw new RuntimeException('Unsupported action.');
} catch (Throwable $error) { json_response(['ok'=>false,'error'=>$error->getMessage()],400); }
