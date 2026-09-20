<?php
declare(strict_types=1);
putenv('APP_ENV=testing');putenv('SESSION_SECURE=false');
require dirname(__DIR__).'/bootstrap.php';

$pdo=App\Core\Database::connection();$suffix=bin2hex(random_bytes(5));$pdo->beginTransaction();
try{
    $store=$pdo->prepare("INSERT INTO stores (name,slug,whatsapp_number,country_code,currency_code,theme,status,created_at,updated_at) VALUES (?,?,?,'LB','USD','modern','DRAFT',UTC_TIMESTAMP(),UTC_TIMESTAMP())");
    $store->execute(['Tenant A','tenant-a-'.$suffix,'+96171111111']);$storeA=(int)$pdo->lastInsertId();$store->execute(['Tenant B','tenant-b-'.$suffix,'+96172222222']);$storeB=(int)$pdo->lastInsertId();
    $freePlan=(int)$pdo->query("SELECT id FROM plans WHERE code='FREE'")->fetchColumn();$proPlan=(int)$pdo->query("SELECT id FROM plans WHERE code='PRO'")->fetchColumn();if(!$freePlan||!$proPlan)throw new RuntimeException('Phase 8 plans are not seeded.');$subscription=$pdo->prepare("INSERT INTO subscriptions (store_id,plan_id,status,started_at,current_period_ends_at,created_at,updated_at) VALUES (?,?,'ACTIVE',UTC_TIMESTAMP(),?,UTC_TIMESTAMP(),UTC_TIMESTAMP())");$subscription->execute([$storeA,$freePlan,null]);$subscription->execute([$storeB,$proPlan,gmdate('Y-m-d H:i:s',time()+86400)]);
    $category=$pdo->prepare("INSERT INTO categories (store_id,name,slug,sort_order,status,created_at,updated_at) VALUES (?,'Private B','private-b',0,'ACTIVE',UTC_TIMESTAMP(),UTC_TIMESTAMP())");$category->execute([$storeB]);$categoryB=(int)$pdo->lastInsertId();
    $product=$pdo->prepare("INSERT INTO products (store_id,category_id,name,slug,price,availability,is_featured,status,created_at,updated_at) VALUES (?,?,'Private Product B','private-product-b',10.00,'AVAILABLE',0,'ACTIVE',UTC_TIMESTAMP(),UTC_TIMESTAMP())");$product->execute([$storeB,$categoryB]);$productB=(int)$pdo->lastInsertId();
    $image=$pdo->prepare("INSERT INTO product_images (store_id,product_id,path,mime_type,size_bytes,width,height,sort_order,created_at) VALUES (?,?,'/test.jpg','image/jpeg',1000,300,300,0,UTC_TIMESTAMP())");$image->execute([$storeB,$productB]);$imageB=(int)$pdo->lastInsertId();
    $idempotencyHash=hash('sha256','tenant-b-test-token');$order=$pdo->prepare("INSERT INTO orders (store_id,reference,idempotency_key_hash,customer_name,customer_phone,delivery_address,currency_code,subtotal,total,status,placed_at,status_updated_at,created_at,updated_at) VALUES (?,? ,?,'Private Customer B','+96173333333','Private address','USD',10.00,10.00,'NEW',UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP())");$reference='ORD-TEST-'.$suffix;$order->execute([$storeB,$reference,$idempotencyHash]);$orderB=(int)$pdo->lastInsertId();
    $pdo->prepare("INSERT INTO order_items (store_id,order_id,product_id,product_name,product_slug,unit_price,quantity,line_total,created_at) VALUES (?,?,?,'Private Product B','private-product-b',10.00,1,10.00,UTC_TIMESTAMP())")->execute([$storeB,$orderB,$productB]);
    $customer=$pdo->prepare("INSERT INTO customers (store_id,name,phone,normalized_phone,first_order_at,last_order_at,created_at,updated_at) VALUES (?,'Private Customer B','+96173333333','+96173333333',UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP())");$customer->execute([$storeB]);$customerB=(int)$pdo->lastInsertId();$pdo->prepare('UPDATE orders SET customer_id=? WHERE id=? AND store_id=?')->execute([$customerB,$orderB,$storeB]);
    $pdo->prepare("INSERT INTO analytics_events (store_id,event_type,session_hash,occurred_at,created_at) VALUES (?,'store_view',?,UTC_TIMESTAMP(),UTC_TIMESTAMP())")->execute([$storeB,hash('sha256','private-session')]);
    $categories=new App\Repositories\CategoryRepository;$products=new App\Repositories\ProductRepository;$images=new App\Repositories\ImageRepository;
    if($categories->find($storeA,$categoryB)!==null)throw new RuntimeException('Cross-tenant category read succeeded.');
    if($categories->update($storeA,$categoryB,['name'=>'Attack','slug'=>'attack','description'=>null,'status'=>'ACTIVE']))throw new RuntimeException('Cross-tenant category update succeeded.');
    if($products->find($storeA,$productB)!==null)throw new RuntimeException('Cross-tenant product read succeeded.');
    if($products->archive($storeA,$productB))throw new RuntimeException('Cross-tenant product archive succeeded.');
    if($images->find($storeA,$productB,$imageB)!==null)throw new RuntimeException('Cross-tenant image read succeeded.');
    $orders=new App\Repositories\OrderRepository;
    if($orders->merchantOrder($storeA,$reference)!==null)throw new RuntimeException('Cross-tenant order read succeeded.');
    if($orders->publicOrder($storeA,$reference,$idempotencyHash)!==null)throw new RuntimeException('Cross-tenant public order read succeeded.');
    if((new App\Repositories\CustomerRepository)->find($storeA,$customerB)!==null)throw new RuntimeException('Cross-tenant customer read succeeded.');
    $analytics=(new App\Repositories\AnalyticsRepository)->dashboard($storeA,30);if((int)($analytics['metrics']['visitors']??0)!==0)throw new RuntimeException('Cross-tenant analytics leaked.');
    $accessA=(new App\Services\PlanAccessService)->context($storeA);$accessB=(new App\Services\PlanAccessService)->context($storeB);if($accessA['plan']['code']!=='FREE'||$accessB['plan']['code']!=='PRO')throw new RuntimeException('Cross-tenant subscription entitlement leaked.');if((int)$accessA['usage']['products']!==0||(int)$accessA['usage']['categories']!==0)throw new RuntimeException('Cross-tenant plan usage leaked.');
    $pdo->rollBack();echo "PASS Phase 2, Phase 4, Phase 6, and Phase 8 cross-tenant isolation\n";
}catch(Throwable$e){if($pdo->inTransaction())$pdo->rollBack();fwrite(STDERR,'FAIL '.$e->getMessage().PHP_EOL);exit(1);}
