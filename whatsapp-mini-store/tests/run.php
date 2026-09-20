<?php
declare(strict_types=1);
putenv('APP_ENV=testing');
putenv('SESSION_SECURE=false');
require dirname(__DIR__) . '/bootstrap.php';

$passed = 0; $failed = 0;
$test = static function (string $name, callable $fn) use (&$passed, &$failed): void {
    try { $fn(); echo "PASS {$name}\n"; $passed++; }
    catch (Throwable $e) { echo "FAIL {$name}: {$e->getMessage()}\n"; $failed++; }
};
$assert = static function (bool $condition, string $message = 'Assertion failed'): void {
    if (!$condition) throw new RuntimeException($message);
};

$test('password policy rejects short input', fn() => $assert(App\Support\Validation::password('Short1') !== null));
$test('password policy accepts strong input', fn() => $assert(App\Support\Validation::password('Correct-Horse-9') === null));
$test('slug accepts canonical value', fn() => $assert(App\Support\Validation::slug('tech-corner-2')));
$test('slug rejects path traversal', fn() => $assert(!App\Support\Validation::slug('../admin')));
$test('international phone accepts E.164-like input', fn() => $assert(App\Support\Validation::phone('+96171123456')));
$test('phone rejects local ambiguous input', fn() => $assert(!App\Support\Validation::phone('71123456')));
$test('reserved slug list contains protected routes', function () use ($assert): void {
    $required = ['admin','login','register','api','assets','uploads','dashboard','checkout','cart','support'];
    $assert(array_diff($required, config('app')['reserved_slugs']) === []);
});
$test('password hashes are not plaintext and verify', function () use ($assert): void {
    $password = 'Correct-Horse-9'; $hasher = new App\Services\PasswordHasher; $hash = $hasher->hash($password);
    $assert($hash !== $password && $hasher->verify($password, $hash) && !$hasher->verify('wrong', $hash));
});
$test('CSRF rejects missing token', fn() => $assert(!App\Core\Csrf::verify('')));
$test('CSRF accepts current token', function () use ($assert): void { $token = App\Core\Csrf::token(); $assert(App\Core\Csrf::verify($token)); });
$test('schema includes tenant membership and constraints', function () use ($assert): void {
    $sql = (string) file_get_contents(BASE_PATH . '/database/migrations/001_phase1_foundation.sql');
    foreach (['CREATE TABLE IF NOT EXISTS store_users','UNIQUE KEY uq_stores_slug','FOREIGN KEY (store_id)','FOREIGN KEY (user_id)'] as $needle) $assert(str_contains($sql, $needle), "Missing {$needle}");
});
$test('all POST routes receive global CSRF enforcement', function () use ($assert): void {
    $router = (string) file_get_contents(BASE_PATH . '/app/Core/Router.php');
    $assert(str_contains($router, "request->method === 'POST'") && str_contains($router, 'Csrf::verify'));
});
$test('merchant store lookup derives tenant from authenticated user', function () use ($assert): void {
    $repo = (string) file_get_contents(BASE_PATH . '/app/Repositories/StoreRepository.php');
    $assert(str_contains($repo, 'su.user_id=?') && !str_contains($repo, '$_GET'));
});
$test('Phase 2 catalog tables all carry tenant ownership', function () use ($assert): void {
    $sql=(string)file_get_contents(BASE_PATH.'/database/migrations/002_phase2_catalog.sql');
    foreach(['categories','products','product_images','product_options','product_option_values','product_variants']as$table){$start=strpos($sql,"CREATE TABLE IF NOT EXISTS {$table}");$assert($start!==false,"Missing {$table}");$segment=substr($sql,$start,1400);$assert(str_contains($segment,'store_id BIGINT UNSIGNED NOT NULL'),"{$table} lacks store_id");}
});
$test('Phase 2 resource reads scope IDs by store', function () use ($assert): void {
    foreach(['CategoryRepository.php','ProductRepository.php','ImageRepository.php']as$file){$code=(string)file_get_contents(BASE_PATH.'/app/Repositories/'.$file);$assert(str_contains($code,'store_id'),"{$file} lacks tenant scoping");}
});
$test('tenant context allows owners only by default', function () use ($assert): void {
    $code=(string)file_get_contents(BASE_PATH.'/app/Services/TenantContext.php');$assert(str_contains($code,"['MERCHANT_OWNER']")&&str_contains($code,'member_role'));
});
$test('uploads reject executable formats and use content inspection', function () use ($assert): void {
    $service=(string)file_get_contents(BASE_PATH.'/app/Services/ImageUploadService.php');$guard=(string)file_get_contents(BASE_PATH.'/public/uploads/.htaccess');$assert(str_contains($service,'FILEINFO_MIME_TYPE')&&str_contains($service,'getimagesize')&&str_contains($guard,'RemoveHandler .php'));
});
$test('soft-deleted product frees unique slug and SKUs', function () use ($assert): void {
    $repo=(string)file_get_contents(BASE_PATH.'/app/Repositories/ProductRepository.php');$assert(str_contains($repo,"'-deleted-'")&&str_contains($repo,'product_variants SET sku=NULL'));
});
$test('money addition uses exact minor units', function () use ($assert): void {
    $assert(App\Support\Money::add('10.10','-0.25')==='9.85');$assert(App\Support\Money::add('0.10','0.20')==='0.30');
});
$test('public storefront queries expose active catalog data only', function () use ($assert): void {
    $repo=(string)file_get_contents(BASE_PATH.'/app/Repositories/StorefrontRepository.php');foreach(["status IN ('ACTIVE','SUSPENDED')","p.status='ACTIVE'","p.deleted_at IS NULL","p.store_id=?"]as$needle)$assert(str_contains($repo,$needle),"Missing {$needle}");
});
$test('draft stores are absent from public store lookup', function () use ($assert): void {
    $repo=(string)file_get_contents(BASE_PATH.'/app/Repositories/StorefrontRepository.php');$assert(!str_contains($repo,"status IN ('ACTIVE','DRAFT'"));
});
$test('clean storefront routes are registered after protected exact routes', function () use ($assert): void {
    $routes=(string)file_get_contents(BASE_PATH.'/routes/web.php');$assert(str_contains($routes,"'/{storeSlug}/product/{productSlug}'")&&str_contains($routes,"'/{storeSlug}/cart'"));$assert(strpos($routes,"'/sa'")<strpos($routes,"'/{storeSlug}'"));
});
$test('browser cart is namespaced per store and marked non-authoritative', function () use ($assert): void {
    $js=(string)file_get_contents(BASE_PATH.'/public/assets/js/storefront.js');$view=(string)file_get_contents(BASE_PATH.'/resources/views/storefront/cart.php');$assert(str_contains($js,'ministore:cart:${storeSlug}:v1'));$assert(str_contains($view,'server validates products'));
});
$test('new reserved slugs protect storefront and merchant routes', function () use ($assert): void {
    foreach(['storefront','merchant','sa']as$slug)$assert(in_array($slug,config('app')['reserved_slugs'],true),"Missing {$slug}");
});
$test('Phase 4 order schema preserves snapshots and tenant constraints', function () use ($assert): void {
    $sql=(string)file_get_contents(BASE_PATH.'/database/migrations/003_phase4_orders.sql');
    foreach(['CREATE TABLE IF NOT EXISTS orders','CREATE TABLE IF NOT EXISTS order_items','CREATE TABLE IF NOT EXISTS order_status_history','uq_orders_store_idempotency','currency_code CHAR(3)','unit_price DECIMAL(12,2)','line_total DECIMAL(12,2)','FOREIGN KEY (order_id,store_id)']as$needle)$assert(str_contains($sql,$needle),"Missing {$needle}");
});
$test('order creation derives prices and totals on the server', function () use ($assert): void {
    $code=(string)file_get_contents(BASE_PATH.'/app/Services/OrderService.php');
    foreach(['lockProduct','lockVariant','Money::add','Money::minor','Money::fromMinor','FOR UPDATE']as$needle)$assert(str_contains($code,$needle),"Missing {$needle}");
    $assert(!str_contains($code,"line['price']"),'Client price must not be read');
});
$test('order creation normalizes duplicate lines and enforces quantity limits', function () use ($assert): void {
    $code=(string)file_get_contents(BASE_PATH.'/app/Services/OrderService.php');$assert(str_contains($code,'normalizeLines')&&str_contains($code,"max_range'=>99")&&str_contains($code,"quantity']+=") );
});
$test('checkout is idempotent per store and saves before WhatsApp continuation', function () use ($assert): void {
    $service=(string)file_get_contents(BASE_PATH.'/app/Services/OrderService.php');$controller=(string)file_get_contents(BASE_PATH.'/app/Controllers/CheckoutController.php');$routes=(string)file_get_contents(BASE_PATH.'/routes/web.php');
    $assert(str_contains($service,'findByIdempotency')&&str_contains($service,"'NEW'")&&str_contains($controller,'new OrderService'));
    $assert(strpos($controller,'->create($store')<strpos($controller,"/continue?token="));
    $assert(str_contains($routes,"'/{storeSlug}/order/{reference}/continue'"));
});
$test('WhatsApp terminology does not claim message delivery', function () use ($assert): void {
    $schema=(string)file_get_contents(BASE_PATH.'/database/migrations/003_phase4_orders.sql');$view=(string)file_get_contents(BASE_PATH.'/resources/views/storefront/whatsapp_continue.php');
    $assert(str_contains($schema,'whatsapp_opened_at')&&!str_contains($schema,'message_delivered'));
    $assert(str_contains($view,'does not mean the message was sent'));
});
$test('merchant order operations scope every lookup by store', function () use ($assert): void {
    $repo=(string)file_get_contents(BASE_PATH.'/app/Repositories/OrderRepository.php');$assert(substr_count($repo,'store_id=?')>=8);$assert(!str_contains($repo,'$_GET'));
});
$test('order status machine has terminal completed and cancelled states', function () use ($assert): void {
    $repo=(string)file_get_contents(BASE_PATH.'/app/Repositories/OrderRepository.php');$assert(str_contains($repo,"'COMPLETED'=>[]")&&str_contains($repo,"'CANCELLED'=>[]")&&str_contains($repo,'stock_released_at'));
});
$test('checkout posts only product, variant, and quantity cart fields', function () use ($assert): void {
    $js=(string)file_get_contents(BASE_PATH.'/public/assets/js/storefront.js');$assert(str_contains($js,'productId:item.productId,variantId:item.variantId,quantity:item.quantity'));
});
$test('Phase 5 migration adds controlled branding and slug history', function () use ($assert): void {
    $sql=(string)file_get_contents(BASE_PATH.'/database/migrations/004_phase5_store_customization.sql');foreach(['logo_path','banner_path','accent_color','font_key','social_links JSON','CREATE TABLE IF NOT EXISTS store_slug_redirects','UNIQUE KEY uq_store_slug_redirects_old_slug','FOREIGN KEY (store_id)']as$needle)$assert(str_contains($sql,$needle),"Missing {$needle}");
});
$test('store customization is tenant-authorized and CSRF protected', function () use ($assert): void {
    $controller=(string)file_get_contents(BASE_PATH.'/app/Controllers/StoreDesignController.php');$routes=(string)file_get_contents(BASE_PATH.'/routes/web.php');$assert(str_contains($controller,'new TenantContext')&&str_contains($routes,"post('/merchant/design'"));$assert(str_contains((string)file_get_contents(BASE_PATH.'/app/Core/Router.php'),'Csrf::verify'));
});
$test('store branding uploads inspect content and isolate paths by store', function () use ($assert): void {
    $service=(string)file_get_contents(BASE_PATH.'/app/Services/ImageUploadService.php');foreach(['uploadStoreAsset','FILEINFO_MIME_TYPE','getimagesize','/public/uploads/stores/{$storeId}/branding']as$needle)$assert(str_contains($service,$needle),"Missing {$needle}");
});
$test('slug changes reserve old addresses and public routes redirect permanently', function () use ($assert): void {
    $stores=(string)file_get_contents(BASE_PATH.'/app/Repositories/StoreRepository.php');$public=(string)file_get_contents(BASE_PATH.'/app/Controllers/StorefrontController.php');$assert(str_contains($stores,'store_slug_redirects')&&str_contains($stores,'FOR UPDATE'));$assert(str_contains($public,'redirectTarget')&&str_contains($public,',301'));
});
$test('public customization is constrained to approved themes fonts and safe colors', function () use ($assert): void {
    $app=config('app');$expected=['modern','luxury','playful','minimal','boutique','bold','editorial','natural','tech','streetwear','beauty','artisan','classic','vibrant','monochrome'];$assert($app['themes']===$expected);$assert(array_keys($app['theme_catalog'])===$expected);$assert(array_keys($app['fonts'])===['system','editorial','rounded']);$assert(App\Support\Color::safeHex('#12abEF')==='#12ABEF');$assert(App\Support\Color::safeHex('red')==='#2F5BFF');$assert(in_array(App\Support\Color::contrastText('#FFFFFF'),['#FFFFFF','#111111'],true));
});
$test('all controlled templates have selector previews and storefront rules', function () use ($assert): void {
    $app=config('app');$design=(string)file_get_contents(BASE_PATH.'/resources/views/merchant/design.php');$adminCss=(string)file_get_contents(BASE_PATH.'/public/assets/css/app.css');$storeCss=(string)file_get_contents(BASE_PATH.'/public/assets/css/storefront.css');foreach($app['themes']as$theme){$assert(isset($app['theme_catalog'][$theme]['name'],$app['theme_catalog'][$theme]['description']),"Missing metadata for {$theme}");$assert($theme==='modern'||str_contains($adminCss,".theme-{$theme}"),"Missing preview for {$theme}");$assert(in_array($theme,['modern','luxury','playful'],true)||str_contains($storeCss,"store-theme-{$theme}"),"Missing storefront rules for {$theme}");}$assert(str_contains($design,"\$app['theme_catalog']"));
});
$test('onboarding offers the full 15-template catalog, not a narrowed subset', function () use ($assert): void {
    $app=config('app');$onboarding=(string)file_get_contents(BASE_PATH.'/resources/views/onboarding/create.php');$assert(str_contains($onboarding,"\$app['theme_catalog']"),'Onboarding must render every template in theme_catalog');$assert(!str_contains($onboarding,'onboarding_themes'),'Onboarding must not read a narrowed onboarding_themes list');$assert(!array_key_exists('onboarding_themes',$app),'onboarding_themes config should be removed once onboarding offers all templates');
});
$test('live preview removes previously selected dynamic theme classes', function () use ($assert): void {
    $js=(string)file_get_contents(BASE_PATH.'/public/assets/js/app.js');$assert(str_contains($js,"startsWith('theme-')")&&str_contains($js,'data-preview-theme'));
});
$test('storefront emits canonical Open Graph and social metadata', function () use ($assert): void {
    $layout=(string)file_get_contents(BASE_PATH.'/resources/views/layouts/storefront.php');foreach(['rel="canonical"','property="og:title"','property="og:description"','property="og:image"','name="twitter:card"']as$needle)$assert(str_contains($layout,$needle),"Missing {$needle}");
});
$test('QR generation is local and supports high resolution PNG and SVG', function () use ($assert): void {
    $view=(string)file_get_contents(BASE_PATH.'/resources/views/merchant/design.php');$js=(string)file_get_contents(BASE_PATH.'/public/assets/js/app.js');$qr=(string)file_get_contents(BASE_PATH.'/public/assets/js/qrcode.js');$assert(str_contains($view,'width="2048"')&&str_contains($js,"data-download-qr")&&str_contains($js,"image/svg+xml"));$assert(str_contains($qr,'MiniStoreQRCode')&&!str_contains($view,'api.qrserver'));
});
$test('product sharing includes native WhatsApp Facebook and copy actions', function () use ($assert): void {
    $view=(string)file_get_contents(BASE_PATH.'/resources/views/storefront/product.php');foreach(['data-share-product','https://wa.me/?text=','facebook.com/sharer','data-copy-product']as$needle)$assert(str_contains($view,$needle),"Missing {$needle}");
});
$test('Phase 6 migration is additive tenant-scoped and indexed', function () use ($assert): void {
    $sql=(string)file_get_contents(BASE_PATH.'/database/migrations/005_phase6_analytics_crm_import.sql');foreach(['CREATE TABLE IF NOT EXISTS customers','ALTER TABLE orders','ADD COLUMN customer_id','CREATE TABLE IF NOT EXISTS analytics_events','CREATE TABLE IF NOT EXISTS import_batches','UNIQUE KEY uq_customers_store_phone','KEY idx_analytics_store_type_date','FOREIGN KEY (store_id)']as$needle)$assert(str_contains($sql,$needle),"Missing {$needle}");
});
$test('Phase 6 merchant reads and import batches enforce store scope', function () use ($assert): void {
    foreach(['CustomerRepository.php','AnalyticsRepository.php','ImportBatchRepository.php']as$file){$code=(string)file_get_contents(BASE_PATH.'/app/Repositories/'.$file);$assert(str_contains($code,'store_id=?'),"{$file} lacks tenant scoping");}$batch=(string)file_get_contents(BASE_PATH.'/app/Repositories/ImportBatchRepository.php');$assert(str_contains($batch,'created_by_user_id=?')&&str_contains($batch,'FOR UPDATE')&&str_contains($batch,'beginTransaction'));
});
$test('customer merge and order link happen inside order transaction', function () use ($assert): void {
    $service=(string)file_get_contents(BASE_PATH.'/app/Services/OrderService.php');$customerPos=strpos($service,'CustomerRepository');$commitPos=strpos($service,'$pdo->commit()');$assert($customerPos!==false&&$commitPos!==false&&$customerPos<$commitPos);$assert(str_contains($service,'customer_id,reference'));
});
$test('analytics stores hashed sessions and excludes raw IP addresses', function () use ($assert): void {
    $service=(string)file_get_contents(BASE_PATH.'/app/Services/AnalyticsEventService.php');$repo=(string)file_get_contents(BASE_PATH.'/app/Repositories/AnalyticsRepository.php');$controller=(string)file_get_contents(BASE_PATH.'/app/Controllers/AnalyticsController.php');$assert(str_contains($service,"hash_hmac('sha256',session_id()")&&!str_contains($repo,'ip_address'));$assert(str_contains($controller,'Auth::id()')&&str_contains($controller,'isLikelyBot'));
});
$test('spreadsheet import is previewed and committed atomically as drafts', function () use ($assert): void {
    $parser=(string)file_get_contents(BASE_PATH.'/app/Services/SpreadsheetImportService.php');$import=(string)file_get_contents(BASE_PATH.'/app/Services/ProductImportService.php');$controller=(string)file_get_contents(BASE_PATH.'/app/Controllers/ImportController.php');$assert(str_contains($parser,"\$ext==='csv'")&&str_contains($parser,"\$ext==='xlsx'")&&str_contains($parser,'500 rows'));$assert(str_contains($import,"'DRAFT'")&&str_contains($controller,'ImportBatchRepository')&&str_contains($controller,'ImageUploadService'));
});
$test('reorder uses secret order token and current authoritative catalog data', function () use ($assert): void {
    $controller=(string)file_get_contents(BASE_PATH.'/app/Controllers/CheckoutController.php');$repo=(string)file_get_contents(BASE_PATH.'/app/Repositories/OrderRepository.php');$assert(str_contains($controller,"hash('sha256',\$token)")&&str_contains($repo,"\$row['status']!=='ACTIVE'")&&str_contains($repo,"\$row['availability']!=='AVAILABLE'")&&str_contains($repo,'Money::add'));
});
$test('Phase 6 exact routes precede generic merchant and storefront routes', function () use ($assert): void {
    $routes=(string)file_get_contents(BASE_PATH.'/routes/web.php');foreach(['/merchant/customers','/merchant/analytics','/merchant/import']as$route)$assert(strpos($routes,"'{$route}'")<strpos($routes,"'/merchant/{section}'"),"{$route} route is shadowed");$assert(strpos($routes,"'/{storeSlug}/events'")<strpos($routes,"'/{storeSlug}'"));
});

$test('Phase 7 migration adds bounded SEO controls and plan feature branding', function () use ($assert): void {
    $sql=(string)file_get_contents(BASE_PATH.'/database/migrations/006_phase7_seo_growth.sql');foreach(['seo_title VARCHAR(70)','seo_description VARCHAR(160)','search_indexing TINYINT(1)','idx_stores_status_indexing','remove_platform_branding']as$needle)$assert(str_contains($sql,$needle),"Missing {$needle}");$assert(!str_contains(strtoupper($sql),'DROP TABLE')&&!str_contains(strtoupper($sql),'DROP COLUMN'));
});
$test('SEO settings derive tenant from membership and never accept client store id', function () use ($assert): void {
    $controller=(string)file_get_contents(BASE_PATH.'/app/Controllers/SeoController.php');$repo=(string)file_get_contents(BASE_PATH.'/app/Repositories/SeoRepository.php');$assert(str_contains($controller,'new TenantContext')&&str_contains($repo,'WHERE id=?'));$assert(!str_contains($controller,"input('store_id')")&&!str_contains($repo,'$_GET'));
});
$test('Phase 7 routes are not shadowed by generic merchant or storefront routes', function () use ($assert): void {
    $routes=(string)file_get_contents(BASE_PATH.'/routes/web.php');$assert(strpos($routes,"'/merchant/seo'")<strpos($routes,"'/merchant/{section}'"));foreach(["'/robots.txt'","'/sitemap.xml'","'/{storeSlug}/sitemap.xml'"]as$route)$assert(strpos($routes,$route)<strpos($routes,"'/{storeSlug}'"),"{$route} route is shadowed");
});
$test('router quotes literal dots in parameterized sitemap paths', function () use ($assert): void {
    $router=(string)file_get_contents(BASE_PATH.'/app/Core/Router.php');$assert(str_contains($router,"preg_quote(\$route, '#')"));
});
$test('indexing opt-out controls meta robots and sitemap inclusion server-side', function () use ($assert): void {
    $layout=(string)file_get_contents(BASE_PATH.'/resources/views/layouts/storefront.php');$repo=(string)file_get_contents(BASE_PATH.'/app/Repositories/SeoRepository.php');$controller=(string)file_get_contents(BASE_PATH.'/app/Controllers/SeoController.php');$assert(str_contains($layout,"'noindex,nofollow'")&&str_contains($layout,'search_indexing')&&str_contains($layout,'X-Robots-Tag'));$assert(substr_count($repo,'search_indexing=1')>=2);$assert(str_contains($controller,'Sitemap: ')&&str_contains($controller,'application/xml'));
});
$test('product pages emit valid schema fields without fabricated ratings or reviews', function () use ($assert): void {
    $controller=(string)file_get_contents(BASE_PATH.'/app/Controllers/StorefrontController.php');$layout=(string)file_get_contents(BASE_PATH.'/resources/views/layouts/storefront.php');foreach(["'@type'=>'Product'","'@type'=>'Offer'",'priceCurrency',"schema.org/InStock"]as$needle)$assert(str_contains($controller,$needle),"Missing {$needle}");$all=$controller.$layout;$assert(!str_contains($all,'aggregateRating')&&!str_contains($all,'reviewCount'));$assert(str_contains($layout,'application/ld+json'));
});
$test('platform branding is enforced from subscription features', function () use ($assert): void {
    $repo=(string)file_get_contents(BASE_PATH.'/app/Repositories/StorefrontRepository.php');$layout=(string)file_get_contents(BASE_PATH.'/resources/views/layouts/storefront.php');$assert(str_contains($repo,'remove_platform_branding')&&str_contains($repo,'show_platform_branding'));$assert(str_contains($layout,'Powered by')&&str_contains($layout,'marketing_url'));
});
$test('sharing covers native WhatsApp Facebook Instagram and copy workflows', function () use ($assert): void {
    $view=(string)file_get_contents(BASE_PATH.'/resources/views/storefront/product.php');$js=(string)file_get_contents(BASE_PATH.'/public/assets/js/storefront.js');foreach(['data-share-product','https://wa.me/?text=','facebook.com/sharer','data-copy-instagram','data-copy-product']as$needle)$assert(str_contains($view,$needle),"Missing {$needle}");$assert(str_contains($js,'paste it into Instagram'));
});

$test('Phase 8 migration is additive and seeds configurable plans', function () use ($assert): void {
    $sql=(string)file_get_contents(BASE_PATH.'/database/migrations/007_phase8_subscriptions.sql');foreach(['pending_plan_id','subscription_change_requests','subscription_events',"'FREE'","'PRO'","'BUSINESS'",'monthly_price DECIMAL(12,2)',"'products',10","'categories',3","'products',250","'custom_domain',TRUE"]as$needle)$assert(str_contains($sql,$needle),"Missing {$needle}");$assert(!preg_match('/DROP\s+(TABLE|COLUMN)/i',$sql),'Phase 8 migration contains a destructive drop');
});
$test('plan limits are centrally enforced inside catalog transactions', function () use ($assert): void {
    $access=(string)file_get_contents(BASE_PATH.'/app/Services/PlanAccessService.php');$products=(string)file_get_contents(BASE_PATH.'/app/Repositories/ProductRepository.php');$categories=(string)file_get_contents(BASE_PATH.'/app/Repositories/CategoryRepository.php');$import=(string)file_get_contents(BASE_PATH.'/app/Services/ProductImportService.php');$assert(str_contains($access,'assertCanAddMany')&&str_contains($access,'FOR UPDATE')===false);$assert(str_contains($products,"assertCanAdd(\$storeId,'products'")&&str_contains($categories,"assertCanAdd(\$storeId,'categories'")&&str_contains($import,'assertCanAddMany'));$assert(strpos($products,'beginTransaction()')<strpos($products,'assertCanAdd'));
});
$test('paid plan requests cannot self-grant access and are idempotent', function () use ($assert): void {
    $service=(string)file_get_contents(BASE_PATH.'/app/Services/SubscriptionService.php');$provider=(string)file_get_contents(BASE_PATH.'/app/Services/Billing/PaymentProviderInterface.php');$assert(str_contains($service,"\$status='PENDING'")&&str_contains($service,'requestPaidChange')&&str_contains($service,'openRequest'));$assert(str_contains($provider,'idempotencyKey'));$requestPos=strpos($service,'requestPaidChange');$activatePos=strpos($service,'public function activate');$assert($requestPos!==false&&$activatePos!==false&&$requestPos<$activatePos);$requestSection=substr($service,0,$activatePos);$assert(!str_contains($requestSection,"status='ACTIVE'"),'Paid request path grants ACTIVE directly');
});
$test('expiry grace and scheduled downgrades are enforced without trusting cron timing', function () use ($assert): void {
    $access=(string)file_get_contents(BASE_PATH.'/app/Services/PlanAccessService.php');$lifecycle=(string)file_get_contents(BASE_PATH.'/app/Services/SubscriptionService.php');$assert(str_contains($access,'withinDerivedGrace')&&str_contains($access,'scheduled_change_at')&&str_contains($access,'pending_plan_id'));foreach(["status='GRACE'","status='PAST_DUE'","status='EXPIRED'",'subscription.scheduled_change_applied']as$needle)$assert(str_contains($lifecycle,$needle),"Missing lifecycle behavior {$needle}");
});
$test('new stores start a timed trial on the top plan instead of a permanent free grant', function () use ($assert): void {
    $stores=(string)file_get_contents(BASE_PATH.'/app/Repositories/StoreRepository.php');$subs=(string)file_get_contents(BASE_PATH.'/app/Repositories/SubscriptionRepository.php');$assert(str_contains($stores,'topPlan(')&&str_contains($stores,"TRIAL")&&str_contains($stores,'trial_ends_at'),'createForOwner must grant a timed trial, not a bare ACTIVE row');$assert(!str_contains($stores,'WHERE code=\'FREE\''),'createForOwner must not silently grant permanent FREE access');$assert(str_contains($subs,'function topPlan')&&str_contains($subs,'ORDER BY sort_order DESC'));
    $billing=config('billing');$assert(is_int($billing['trial_days'])&&$billing['trial_days']>=0);
});
$test('an expired subscription automatically suspends the store, and suspension can be reversed', function () use ($assert): void {
    $lifecycle=(string)file_get_contents(BASE_PATH.'/app/Services/SubscriptionService.php');$assert(str_contains($lifecycle,"status='SUSPENDED'")&&str_contains($lifecycle,'status_before_suspension=status'),'Reaching EXPIRED must suspend the store the same way the super-admin suspend action does');$expiredPos=strpos($lifecycle,"status='EXPIRED'");$suspendPos=strpos($lifecycle,"status='SUSPENDED'");$assert($expiredPos!==false&&$suspendPos!==false&&$expiredPos<$suspendPos);
    $admin=(string)file_get_contents(BASE_PATH.'/app/Services/SuperAdminActionService.php');$assert(str_contains($admin,'status_before_suspension')&&str_contains($admin,'changeStorePlan'),'Manual reactivation and manual billing grants must remain available after auto-suspension');
});
$test('paid features and workspace switching are authorized server-side', function () use ($assert): void {
    $imports=(string)file_get_contents(BASE_PATH.'/app/Controllers/ImportController.php');$analytics=(string)file_get_contents(BASE_PATH.'/app/Controllers/AnalyticsController.php');$workspace=(string)file_get_contents(BASE_PATH.'/app/Controllers/StoreWorkspaceController.php');$routes=(string)file_get_contents(BASE_PATH.'/routes/web.php');$assert(substr_count($imports,'requireFeature')>=3&&str_contains($analytics,"feature((int)\$store['id'],'advanced_analytics'"));$assert(str_contains($workspace,'accessibleBy')&&!str_contains($workspace,"input('store_id')"));$assert(strpos($routes,"'/merchant/subscription'")<strpos($routes,"'/merchant/{section}'")&&str_contains($routes,"'/merchant/stores/{id}/switch'"));
});
$test('effective plan controls public branding after expiry', function () use ($assert): void {
    $storefront=(string)file_get_contents(BASE_PATH.'/app/Repositories/StorefrontRepository.php');$seo=(string)file_get_contents(BASE_PATH.'/app/Controllers/SeoController.php');$assert(str_contains($storefront,'PlanAccessService')&&str_contains($storefront,'show_platform_branding')&&str_contains($seo,'PlanAccessService'));
});

$test('Phase 9 migration is additive and records operations status', function () use ($assert): void {
    $sql=(string)file_get_contents(BASE_PATH.'/database/migrations/008_phase9_super_admin.sql');foreach(['status_before_suspension','suspended_at','idx_audit_created_at','idx_orders_placed_at','system_tasks','subscription_lifecycle','backup_database','backup_uploads']as$needle)$assert(str_contains($sql,$needle),"Missing {$needle}");$assert(!preg_match('/DROP\s+(TABLE|COLUMN)/i',$sql),'Phase 9 migration contains a destructive drop');
});
$test('every Phase 9 controller enforces the super-admin boundary', function () use ($assert): void {
    foreach(['SuperAdminController.php','SuperAdminMerchantController.php','SuperAdminStoreController.php','SuperAdminPlanController.php','SuperAdminSystemController.php']as$file){$code=(string)file_get_contents(BASE_PATH.'/app/Controllers/'.$file);$assert(str_contains($code,'requireSuperAdmin'),"{$file} lacks super-admin authorization");}
});
$test('admin merchant reads never select password or token material', function () use ($assert): void {
    $repo=(string)file_get_contents(BASE_PATH.'/app/Repositories/AdminMerchantRepository.php');$assert(!str_contains($repo,'password_hash')&&!str_contains($repo,'token_hash'));$assert(str_contains($repo,"platform_role='MERCHANT'"));
});
$test('privileged status and plan changes are locked and audited', function () use ($assert): void {
    $service=(string)file_get_contents(BASE_PATH.'/app/Services/SuperAdminActionService.php');foreach(['FOR UPDATE','AuditLogRepository','admin.merchant_suspended','admin.store_suspended','admin.plan_updated','status_before_suspension']as$needle)$assert(str_contains($service,$needle),"Missing {$needle}");$assert(str_contains($service,"platform_role='MERCHANT'"));
});
$test('plan editor preserves extension keys and protects the FREE baseline', function () use ($assert): void {
    $service=(string)file_get_contents(BASE_PATH.'/app/Services/SuperAdminActionService.php');$config=config('plans');$assert(isset($config['features']['custom_domain'],$config['features']['staff_management'],$config['limits']['products']));$assert(str_contains($service,'array_replace')&&str_contains($service,"\$plan['code']==='FREE'"));
});
$test('Phase 9 routes precede public storefront routing', function () use ($assert): void {
    $routes=(string)file_get_contents(BASE_PATH.'/routes/web.php');foreach(['/sa/merchants','/sa/stores','/sa/plans','/sa/audit','/sa/system']as$route)$assert(strpos($routes,"'{$route}'")<strpos($routes,"'/{storeSlug}'"),"{$route} is shadowed");
});
$test('system status avoids raw secrets and tracks lifecycle heartbeat', function () use ($assert): void {
    $service=(string)file_get_contents(BASE_PATH.'/app/Services/SystemStatusService.php');$script=(string)file_get_contents(BASE_PATH.'/bin/process-subscriptions.php');foreach(['schema_migrations','directoryStats','error_log','SystemTaskRepository']as$needle)$assert(str_contains($service,$needle),"Missing {$needle}");$assert(!str_contains($service,'getenv(')&&!str_contains($service,'$_ENV'));$assert(str_contains($script,"start('subscription_lifecycle')")&&str_contains($script,"finish('subscription_lifecycle'"));
});
$test('admin overview reports operational health without counting trials as MRR', function () use ($assert): void {
    $dashboard=(string)file_get_contents(BASE_PATH.'/resources/views/super_admin/dashboard.php');$repo=(string)file_get_contents(BASE_PATH.'/app/Repositories/AdminRepository.php');$editor=(string)file_get_contents(BASE_PATH.'/resources/views/super_admin/plans/edit.php');$assert(str_contains($dashboard,'admin-health-strip')&&str_contains($dashboard,"['storage']['uploads']"));$assert(str_contains($repo,"sub.status='ACTIVE'")&&!str_contains($repo,"sub.status IN ('ACTIVE','TRIAL') AND p.monthly_price"));$assert(str_contains($editor,'$hasOld')&&str_contains($editor,'$isPublic')&&str_contains($editor,'$isActive'));
});
$test('Phase 10 security headers and production checks fail closed', function () use ($assert): void {
    $headers=(string)file_get_contents(BASE_PATH.'/app/Support/SecurityHeaders.php');$bootstrap=(string)file_get_contents(BASE_PATH.'/bootstrap.php');$http=(string)file_get_contents(BASE_PATH.'/app/Support/Http.php');foreach(['Content-Security-Policy','Strict-Transport-Security','frame-ancestors','X-Request-ID']as$needle)$assert(str_contains($headers,$needle));$assert(str_contains($headers,'Http::isHttps()')&&str_contains($http,'TRUSTED_PROXY_IPS'));$assert(str_contains($bootstrap,'APP_DEBUG must be false')&&str_contains($bootstrap,'APP_URL must be a valid HTTPS URL'));
});
$test('password changes invalidate old sessions and auth abuse has IP limits', function () use ($assert): void {
    $auth=(string)file_get_contents(BASE_PATH.'/app/Core/Auth.php');$controller=(string)file_get_contents(BASE_PATH.'/app/Controllers/AuthController.php');$assert(str_contains($auth,'_authenticated_at')&&str_contains($auth,'password_changed_at')&&str_contains($auth,'clearSession'));$assert(str_contains($controller,"tooMany('login_ip'")&&str_contains($controller,"tooMany('reset_ip'"));$assert(strpos($controller,"owner('email_verifications'")<strpos($controller,"consume('email_verifications'"));
});
$test('Phase 10 limits image decompression and protects upload execution', function () use ($assert): void {
    $upload=(string)file_get_contents(BASE_PATH.'/app/Services/ImageUploadService.php');$rules=(string)file_get_contents(BASE_PATH.'/public/uploads/.htaccess');$assert(str_contains($upload,"\$config['max_pixels']")&&str_contains($upload,'12000000'));foreach(['RemoveHandler','RemoveType','Options -ExecCGI']as$needle)$assert(str_contains($rules,$needle));
});
$test('order locking, storefront options, and system storage are optimized', function () use ($assert): void {
    $orders=(string)file_get_contents(BASE_PATH.'/app/Services/OrderService.php');$storefront=(string)file_get_contents(BASE_PATH.'/app/Repositories/StorefrontRepository.php');$status=(string)file_get_contents(BASE_PATH.'/app/Services/SystemStatusService.php');$assert(str_contains($orders,'usort($lines'));$assert(str_contains($storefront,'valuesByOption'));$assert(str_contains($status,'system-storage.json')&&str_contains($status,'time()-300'));
});
$test('Phase 10 migration and operations scripts are safe and CLI-only', function () use ($assert): void {
    $sql=(string)file_get_contents(BASE_PATH.'/database/migrations/009_phase10_production_hardening.sql');$maintenance=(string)file_get_contents(BASE_PATH.'/bin/maintenance.php');$production=(string)file_get_contents(BASE_PATH.'/bin/production-check.php');$assert(str_contains($sql,'idx_orders_store_date')&&str_contains($sql,'idx_products_public_catalog')&&!preg_match('/DROP\s+(TABLE|COLUMN)/i',$sql));$assert(str_contains($maintenance,"PHP_SAPI!=='cli'")&&str_contains($maintenance,'maintenance.lock')&&str_contains($maintenance,'ANALYTICS_RETENTION_DAYS'));$assert(str_contains($production,'Database migrations')&&str_contains($production,'Upload execution protection'));
});

$test('Phase 12 migration adds a bounded cancellation reason to status history', function () use ($assert): void {
    $sql=(string)file_get_contents(BASE_PATH.'/database/migrations/011_phase12_order_cancellation_reason.sql');$assert(str_contains($sql,'reason_code ENUM')&&str_contains($sql,'reason_note VARCHAR(300)')&&str_contains($sql,'order_status_history'));
});
$test('cancelling an order always requires a known reason code', function () use ($assert): void {
    $controller=(string)file_get_contents(BASE_PATH.'/app/Controllers/OrderController.php');$assert(str_contains($controller,'CANCEL_REASONS')&&str_contains($controller,"'CANCELLED'"));
    $view=(string)file_get_contents(BASE_PATH.'/resources/views/merchant/orders/show.php');$assert(str_contains($view,'cancel-order-form')&&str_contains($view,'name="reason_code"')&&str_contains($view,'required'));
});
$test('Phase 13 migration adds discount codes scoped and constrained per store', function () use ($assert): void {
    $sql=(string)file_get_contents(BASE_PATH.'/database/migrations/012_phase13_discount_codes.sql');
    foreach(['CREATE TABLE IF NOT EXISTS discount_codes','CREATE TABLE IF NOT EXISTS discount_code_redemptions','discount_code_id','discount_amount','discount_code_snapshot','free_delivery']as$needle)$assert(str_contains($sql,$needle),"Missing {$needle}");
    $assert(str_contains($sql,'ON DELETE RESTRICT'),'orders->discount_codes FK must not risk nulling store_id');
});
$test('discount resolution is computed server-side for every supported type', function () use ($assert): void {
    $service=(string)file_get_contents(BASE_PATH.'/app/Services/DiscountService.php');
    foreach(['PERCENT_ORDER','FIXED_ORDER','PERCENT_PRODUCT','PERCENT_CATEGORY','FREE_DELIVERY']as$type)$assert(str_contains($service,$type),"Missing {$type} handling");
    $assert(str_contains($service,'lockRedeemable')&&str_contains($service,'min_order_amount')&&str_contains($service,'usage_limit_per_customer'));
});
$test('discount codes are locked and redeemed inside the order transaction', function () use ($assert): void {
    $orderService=(string)file_get_contents(BASE_PATH.'/app/Services/OrderService.php');
    $assert(str_contains($orderService,'DiscountService')&&str_contains($orderService,'recordRedemption')&&str_contains($orderService,'category_id'));
});
$test('discount code management is tenant scoped and validated server-side', function () use ($assert): void {
    $controller=(string)file_get_contents(BASE_PATH.'/app/Controllers/DiscountCodeController.php');
    $assert(str_contains($controller,'store_id')&&str_contains($controller,"'23000'")&&str_contains($controller,'/^[A-Z0-9_-]{3,40}$/'));
    $sql=(string)file_get_contents(BASE_PATH.'/database/migrations/012_phase13_discount_codes.sql');$assert(preg_match('/UNIQUE KEY[^\n]*store_id[^\n]*code/',$sql)===1,'code uniqueness must be enforced by the database, not a racy pre-check');
    $routes=(string)file_get_contents(BASE_PATH.'/routes/web.php');$assert(str_contains($routes,'/merchant/discounts'));
});
$test('WhatsApp handoff message reflects applied discounts without trusting the client', function () use ($assert): void {
    $wa=(string)file_get_contents(BASE_PATH.'/app/Services/WhatsAppService.php');$assert(str_contains($wa,'discount_code_snapshot')&&str_contains($wa,'discount_amount')&&str_contains($wa,'free_delivery'));
});

echo "\n{$passed} passed, {$failed} failed.\n";
exit($failed === 0 ? 0 : 1);
