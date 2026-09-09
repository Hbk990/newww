<?php
declare(strict_types=1);
require_once __DIR__ . '/../inc/bootstrap.php';
if (!is_customer()) json_response(['ok' => false, 'error' => 'Authentication required.'], 401);

/* The catalog is ~318 KB of JSON and changes only when the dashboard saves. An
   ETag lets a returning customer get a 304 instead of the whole payload.
   bootstrap.php sends Cache-Control: no-store for every request, which would stop
   the browser keeping a copy to revalidate — override it for this endpoint only.
   "private, no-cache" still forces revalidation on every visit and keeps shared
   proxies out; it just permits a local copy to revalidate against. */
header('Cache-Control: private, no-cache, must-revalidate');

$catalogStamp = is_file(CATALOG_FILE) ? filemtime(CATALOG_FILE) . '-' . filesize(CATALOG_FILE) : '0';
$settingsStamp = is_file(SETTINGS_FILE) ? filemtime(SETTINGS_FILE) . '-' . filesize(SETTINGS_FILE) : '0';
// is_admin() changes the payload, so it has to be part of the identity.
$etag = '"' . hash('xxh128', $catalogStamp . ':' . $settingsStamp . ':' . (is_admin() ? 'a' : 'c')) . '"';
header('ETag: ' . $etag);

$candidate = trim((string)($_SERVER['HTTP_IF_NONE_MATCH'] ?? ''));
if ($candidate !== '') {
    foreach (explode(',', $candidate) as $tag) {
        $tag = trim($tag);
        if (str_starts_with($tag, 'W/')) $tag = substr($tag, 2);
        if ($tag === $etag) { http_response_code(304); exit; }
    }
}

$siteSettings=settings(); $publicCatalog=[];
foreach(catalog() as $category){$category['products']=array_values(array_filter($category['products']??[],fn($product)=>(string)($product['visibility']??'published')==='published'));if($category['products'])$publicCatalog[]=$category;}
json_response(['ok'=>true,'catalog'=>$publicCatalog,'admin'=>is_admin(),'csrf'=>csrf_token(),'contact'=>['phone'=>$siteSettings['phone']??'','location'=>$siteSettings['location']??'','map_url'=>$siteSettings['map_url']??''],'store'=>['currency'=>$siteSettings['currency']??'USD','minimum_order'=>$siteSettings['minimum_order']??0,'payment_terms'=>$siteSettings['payment_terms']??'','delivery_terms'=>$siteSettings['delivery_terms']??'']]);
