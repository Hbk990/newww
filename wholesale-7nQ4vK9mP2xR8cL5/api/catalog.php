<?php
declare(strict_types=1);
require_once __DIR__ . '/../inc/bootstrap.php';
if (!is_customer()) json_response(['ok' => false, 'error' => 'Authentication required.'], 401);
$siteSettings=settings(); $publicCatalog=[];
foreach(catalog() as $category){$category['products']=array_values(array_filter($category['products']??[],fn($product)=>(string)($product['visibility']??'published')==='published'));if($category['products'])$publicCatalog[]=$category;}
json_response(['ok'=>true,'catalog'=>$publicCatalog,'admin'=>is_admin(),'contact'=>['phone'=>$siteSettings['phone']??'','location'=>$siteSettings['location']??'','map_url'=>$siteSettings['map_url']??''],'store'=>['currency'=>$siteSettings['currency']??'USD','minimum_order'=>$siteSettings['minimum_order']??0,'payment_terms'=>$siteSettings['payment_terms']??'','delivery_terms'=>$siteSettings['delivery_terms']??'']]);
