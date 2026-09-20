<?php
namespace App\Services;

use App\Core\Database;
use App\Repositories\{CustomerRepository,OrderRepository};
use App\Support\Money;

final class OrderService
{
    public function create(array $store, array $customer, array $rawLines, string $idempotencyToken, ?string $discountCode = null): array
    {
        $storeId = (int) $store['id']; $hash = hash('sha256', $idempotencyToken); $repo = new OrderRepository;
        if ($existing = $repo->findByIdempotency($storeId, $hash)) return $existing;
        $lines = $this->normalizeLines($rawLines);
        $pdo = Database::connection(); $pdo->beginTransaction();
        try {
            $items = []; $totalMinor = 0;
            foreach ($lines as $line) {
                $product = $this->lockProduct($storeId, $line['product_id']);
                if (!$product) throw new \DomainException('One of the products is no longer available.');
                $unit = $product['price']; $variant = null;
                if ($line['variant_id'] !== null) {
                    $variant = $this->lockVariant($storeId, (int)$product['id'], $line['variant_id']);
                    if (!$variant || !(int)$variant['is_available']) throw new \DomainException($product['name'] . ' option is unavailable.');
                    if ($variant['stock_quantity'] !== null && (int)$variant['stock_quantity'] < $line['quantity']) throw new \DomainException('Not enough stock is available for ' . $product['name'] . '.');
                    $unit = Money::add($product['price'], $variant['price_adjustment']);
                    if (Money::minor($unit) < 0) throw new \DomainException('A product has an invalid price.');
                } elseif ((int)$product['variant_count'] > 0) throw new \DomainException('Choose an option for ' . $product['name'] . '.');
                $lineMinor = Money::minor($unit) * $line['quantity']; $totalMinor += $lineMinor;
                if ($totalMinor > 999999999999) throw new \DomainException('The order total is too large.');
                $items[] = ['product_id'=>(int)$product['id'],'category_id'=>$product['category_id']!==null?(int)$product['category_id']:null,'variant_id'=>$variant?(int)$variant['id']:null,'product_name'=>$product['name'],'product_slug'=>$product['slug'],'sku_snapshot'=>$variant['sku']??$product['sku'],'variant_label'=>$variant['label']??null,'unit_price'=>$unit,'quantity'=>$line['quantity'],'line_total'=>Money::fromMinor($lineMinor)];
            }
            $subtotal = Money::fromMinor($totalMinor); $customerId=(new CustomerRepository)->upsert($pdo,$storeId,$customer['name'],$customer['phone']);
            $offer = (new OfferService)->resolve($pdo,$storeId,$items,$subtotal);
            $discount = (new DiscountService)->resolve($pdo,$storeId,$discountCode,$items,$subtotal,$customerId);
            $discountAmount = $discount['discount_amount'] ?? '0.00'; $offerAmount = $offer['discount_amount'];
            $combinedMinor = min(Money::minor($discountAmount)+Money::minor($offerAmount),$totalMinor); $finalTotal = Money::fromMinor($totalMinor - $combinedMinor);
            $reference = $this->reference($pdo);
            $insert = $pdo->prepare("INSERT INTO orders (store_id,customer_id,reference,idempotency_key_hash,customer_name,customer_phone,delivery_address,notes,currency_code,subtotal,total,discount_code_id,discount_amount,discount_code_snapshot,free_delivery,offer_discount_amount,offer_snapshot,status,placed_at,status_updated_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'NEW',UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP())");
            $insert->execute([$storeId,$customerId,$reference,$hash,$customer['name'],$customer['phone'],$customer['address'],$customer['notes'],$store['currency_code'],$subtotal,$finalTotal,$discount?(int)$discount['code']['id']:null,$discountAmount,$discount?$discount['code']['code']:null,$discount&&$discount['free_delivery']?1:0,$offerAmount,$offer['snapshot']]); $orderId = (int)$pdo->lastInsertId();
            $itemInsert = $pdo->prepare('INSERT INTO order_items (store_id,order_id,product_id,variant_id,product_name,product_slug,sku_snapshot,variant_label,unit_price,quantity,line_total,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP())');
            $decrement = $pdo->prepare('UPDATE product_variants SET stock_quantity=stock_quantity-?,updated_at=UTC_TIMESTAMP() WHERE id=? AND store_id=? AND stock_quantity IS NOT NULL AND stock_quantity>=?');
            foreach ($items as $item) {
                $itemInsert->execute([$storeId,$orderId,$item['product_id'],$item['variant_id'],$item['product_name'],$item['product_slug'],$item['sku_snapshot'],$item['variant_label'],$item['unit_price'],$item['quantity'],$item['line_total']]);
                if ($item['variant_id'] !== null && $this->hasFiniteStock($pdo,$storeId,$item['variant_id'])) { $decrement->execute([$item['quantity'],$item['variant_id'],$storeId,$item['quantity']]); if ($decrement->rowCount() !== 1) throw new \DomainException('Stock changed while ordering. Please review your cart.'); }
            }
            if ($discount) (new \App\Repositories\DiscountCodeRepository)->recordRedemption($pdo,$storeId,(int)$discount['code']['id'],$orderId,$customerId,$discountAmount);
            if ($offer['applied']) { $offerRepo=new \App\Repositories\OfferRepository; foreach ($offer['applied'] as $a) $offerRepo->recordRedemption($pdo,$storeId,$a['offer_id'],$orderId,$a['discount_amount']); }
            $pdo->prepare("INSERT INTO order_status_history (store_id,order_id,status,changed_by_user_id,created_at) VALUES (?,?,'NEW',NULL,UTC_TIMESTAMP())")->execute([$storeId,$orderId]);
            $pdo->commit();try{(new AnalyticsEventService)->record($storeId,'order_created');}catch(\Throwable){}return ['id'=>$orderId,'reference'=>$reference];
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            if ((string)$e->getCode()==='23000' && ($existing=$repo->findByIdempotency($storeId,$hash))) return $existing;
            throw $e;
        } catch (\Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
    }

    private function normalizeLines(array $raw): array
    {
        if (!$raw || count($raw) > 30) throw new \DomainException('Your cart must contain between 1 and 30 different items.');
        $lines=[];
        foreach ($raw as $line) {
            if (!is_array($line) || !filter_var($line['productId']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]])) throw new \DomainException('The cart contains invalid product data.');
            $variantRaw=$line['variantId']??null; $variant=$variantRaw===null||$variantRaw===''?null:filter_var($variantRaw,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
            if ($variantRaw!==null&&$variantRaw!==''&&$variant===false) throw new \DomainException('The cart contains invalid option data.');
            $quantity=filter_var($line['quantity']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1,'max_range'=>99]]); if($quantity===false)throw new \DomainException('Quantities must be between 1 and 99.');
            $key=(int)$line['productId'].':'.($variant===null?'base':$variant); if(!isset($lines[$key]))$lines[$key]=['product_id'=>(int)$line['productId'],'variant_id'=>$variant===null?null:(int)$variant,'quantity'=>0]; $lines[$key]['quantity']+=(int)$quantity; if($lines[$key]['quantity']>99)throw new \DomainException('A product quantity cannot exceed 99.');
        }
        $lines=array_values($lines);usort($lines,static fn(array$a,array$b):int=>[$a['product_id'],$a['variant_id']??0]<=>[$b['product_id'],$b['variant_id']??0]);return$lines;
    }

    private function lockProduct(int $storeId,int $productId):?array{$s=Database::connection()->prepare("SELECT p.id,p.name,p.slug,p.sku,p.price,p.category_id,(SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id=p.id AND pv.store_id=p.store_id) variant_count FROM products p LEFT JOIN categories c ON c.id=p.category_id AND c.store_id=p.store_id WHERE p.id=? AND p.store_id=? AND p.status='ACTIVE' AND p.availability='AVAILABLE' AND p.deleted_at IS NULL AND (p.category_id IS NULL OR c.status='ACTIVE') FOR UPDATE");$s->execute([$productId,$storeId]);return$s->fetch()?:null;}
    private function lockVariant(int$storeId,int$productId,int$variantId):?array{$s=Database::connection()->prepare('SELECT id,label,sku,price_adjustment,stock_quantity,is_available FROM product_variants WHERE id=? AND product_id=? AND store_id=? FOR UPDATE');$s->execute([$variantId,$productId,$storeId]);return$s->fetch()?:null;}
    private function hasFiniteStock(\PDO$pdo,int$storeId,int$variantId):bool{$s=$pdo->prepare('SELECT stock_quantity IS NOT NULL FROM product_variants WHERE id=? AND store_id=?');$s->execute([$variantId,$storeId]);return(bool)$s->fetchColumn();}
    private function reference(\PDO$pdo):string{do{$alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';$suffix='';for($i=0;$i<6;$i++)$suffix.=$alphabet[random_int(0,strlen($alphabet)-1)];$reference='ORD-'.gmdate('Ymd').'-'.$suffix;$s=$pdo->prepare('SELECT 1 FROM orders WHERE reference=?');$s->execute([$reference]);}while($s->fetchColumn());return$reference;}
}
