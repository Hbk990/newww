<?php
namespace App\Repositories;

use App\Core\Database;
use App\Services\AnalyticsEventService;
use App\Support\Money;

final class OrderRepository
{
    public function findByIdempotency(int $storeId, string $hash): ?array
    {
        $s = Database::connection()->prepare('SELECT * FROM orders WHERE store_id=? AND idempotency_key_hash=? LIMIT 1');
        $s->execute([$storeId, $hash]);
        return $s->fetch() ?: null;
    }

    public function publicOrder(int $storeId, string $reference, string $hash): ?array
    {
        $s = Database::connection()->prepare('SELECT * FROM orders WHERE store_id=? AND reference=? AND idempotency_key_hash=? LIMIT 1');
        $s->execute([$storeId, $reference, $hash]);
        $order = $s->fetch();
        if (!$order) return null;
        $order['items'] = $this->items($storeId, (int) $order['id']);
        return $order;
    }

    public function markWhatsAppOpened(int $storeId, int $orderId): void
    {
        $s = Database::connection()->prepare('UPDATE orders SET whatsapp_opened_at=UTC_TIMESTAMP(),updated_at=UTC_TIMESTAMP() WHERE id=? AND store_id=? AND whatsapp_opened_at IS NULL');
        $s->execute([$orderId, $storeId]);
        if($s->rowCount()===1)try{(new AnalyticsEventService)->record($storeId,'whatsapp_opened');}catch(\Throwable){}
    }

    public function metrics(int $storeId): array
    {
        $s = Database::connection()->prepare("SELECT COUNT(*) orders_today,COALESCE(SUM(total),0) order_value_today FROM orders WHERE store_id=? AND placed_at>=UTC_DATE() AND placed_at<UTC_DATE()+INTERVAL 1 DAY AND status<>'CANCELLED'");
        $s->execute([$storeId]);
        return $s->fetch() ?: ['orders_today' => 0, 'order_value_today' => '0.00'];
    }

    public function recent(int $storeId, int $limit = 5): array
    {
        $limit = max(1, min(20, $limit));
        $s = Database::connection()->prepare("SELECT reference,customer_name,total,currency_code,status,placed_at FROM orders WHERE store_id=? ORDER BY placed_at DESC,id DESC LIMIT {$limit}");
        $s->execute([$storeId]);
        return $s->fetchAll();
    }

    public function paginate(int $storeId, string $status, string $query, int $page): array
    {
        $where = ' WHERE store_id=?'; $params = [$storeId];
        if ($status !== '') { $where .= ' AND status=?'; $params[] = $status; }
        if ($query !== '') { $where .= ' AND (reference LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)'; $like = '%' . $query . '%'; array_push($params, $like, $like, $like); }
        $count = Database::connection()->prepare('SELECT COUNT(*) FROM orders' . $where); $count->execute($params); $total = (int) $count->fetchColumn();
        $page = max(1, $page); $pages = max(1, (int) ceil($total / 20)); $offset = ($page - 1) * 20;
        $s = Database::connection()->prepare('SELECT reference,customer_name,customer_phone,total,currency_code,status,placed_at,whatsapp_opened_at FROM orders' . $where . " ORDER BY placed_at DESC,id DESC LIMIT 20 OFFSET {$offset}");
        $s->execute($params);
        return ['items' => $s->fetchAll(), 'total' => $total, 'page' => $page, 'pages' => $pages];
    }

    public function merchantOrder(int $storeId, string $reference): ?array
    {
        $s = Database::connection()->prepare('SELECT * FROM orders WHERE store_id=? AND reference=? LIMIT 1');
        $s->execute([$storeId, $reference]); $order = $s->fetch();
        if (!$order) return null;
        $order['items'] = $this->items($storeId, (int) $order['id']);
        $history = Database::connection()->prepare('SELECT h.status,h.reason_code,h.reason_note,h.created_at,u.name actor_name FROM order_status_history h LEFT JOIN users u ON u.id=h.changed_by_user_id WHERE h.store_id=? AND h.order_id=? ORDER BY h.created_at,h.id');
        $history->execute([$storeId, $order['id']]); $order['history'] = $history->fetchAll();
        return $order;
    }

    public function reorder(int$storeId,int$orderId,string$storeSlug):array
    {
        $s=Database::connection()->prepare("SELECT oi.product_id,oi.variant_id,oi.quantity,oi.product_name snapshot_name,p.name,p.slug,p.price,p.availability,p.status,p.deleted_at,(SELECT COALESCE(thumbnail_path,path) FROM product_images pi WHERE pi.product_id=p.id AND pi.store_id=p.store_id ORDER BY sort_order,id LIMIT 1) image,(SELECT COUNT(*) FROM product_variants x WHERE x.product_id=p.id AND x.store_id=p.store_id) variant_count,v.label variant_label,v.price_adjustment,v.stock_quantity,v.is_available FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id AND p.store_id=oi.store_id LEFT JOIN product_variants v ON v.id=oi.variant_id AND v.product_id=p.id AND v.store_id=p.store_id WHERE oi.order_id=? AND oi.store_id=? ORDER BY oi.id");$s->execute([$orderId,$storeId]);$items=[];$skipped=[];
        foreach($s->fetchAll()as$row){if(!$row['product_id']||!$row['name']||$row['deleted_at']||$row['status']!=='ACTIVE'||$row['availability']!=='AVAILABLE'){$skipped[]=$row['snapshot_name'].' is no longer available.';continue;}if($row['variant_id']===null&&(int)$row['variant_count']>0){$skipped[]=$row['name'].' now requires an option selection.';continue;}if($row['variant_id']!==null&&(!$row['variant_label']||!(int)$row['is_available']||($row['stock_quantity']!==null&&(int)$row['stock_quantity']<1))){$skipped[]=$row['name'].' · '.($row['variant_label']?:'previous option').' is unavailable.';continue;}$quantity=min(99,(int)$row['quantity']);if($row['stock_quantity']!==null)$quantity=min($quantity,(int)$row['stock_quantity']);$price=$row['variant_id']!==null?Money::add($row['price'],$row['price_adjustment']):$row['price'];$items[]=['productId'=>(int)$row['product_id'],'variantId'=>$row['variant_id']!==null?(int)$row['variant_id']:null,'name'=>$row['name'],'variantLabel'=>$row['variant_label']??'','price'=>$price,'image'=>$row['image']??'','url'=>'/'.$storeSlug.'/product/'.$row['slug'],'quantity'=>$quantity,'maxStock'=>$row['stock_quantity']!==null?(int)$row['stock_quantity']:null];}
        return['items'=>$items,'skipped'=>$skipped];
    }

    public function updateStatus(int $storeId, string $reference, string $next, int $actorId, ?string $reasonCode = null, ?string $reasonNote = null): bool
    {
        $transitions = ['NEW'=>['CONFIRMED','CANCELLED'],'CONFIRMED'=>['PREPARING','CANCELLED'],'PREPARING'=>['READY','CANCELLED'],'READY'=>['COMPLETED','CANCELLED'],'COMPLETED'=>[],'CANCELLED'=>[]];
        $pdo = Database::connection(); $pdo->beginTransaction();
        try {
            $s = $pdo->prepare('SELECT id,status,stock_released_at FROM orders WHERE store_id=? AND reference=? FOR UPDATE'); $s->execute([$storeId,$reference]); $order = $s->fetch();
            if (!$order) { $pdo->rollBack(); return false; }
            if (!in_array($next, $transitions[$order['status']] ?? [], true)) throw new \DomainException('That status change is not allowed.');
            if ($next === 'CANCELLED' && !$order['stock_released_at']) {
                $items = $this->items($storeId, (int) $order['id']);
                $restore = $pdo->prepare('UPDATE product_variants SET stock_quantity=stock_quantity+?,updated_at=UTC_TIMESTAMP() WHERE id=? AND store_id=? AND stock_quantity IS NOT NULL');
                foreach ($items as $item) if ($item['variant_id']) $restore->execute([(int)$item['quantity'],(int)$item['variant_id'],$storeId]);
            }
            $u = $pdo->prepare("UPDATE orders SET status=?,status_updated_at=UTC_TIMESTAMP(),stock_released_at=IF(?='CANCELLED',COALESCE(stock_released_at,UTC_TIMESTAMP()),stock_released_at),updated_at=UTC_TIMESTAMP() WHERE id=? AND store_id=?");
            $u->execute([$next,$next,$order['id'],$storeId]);
            $h = $pdo->prepare('INSERT INTO order_status_history (store_id,order_id,status,reason_code,reason_note,changed_by_user_id,created_at) VALUES (?,?,?,?,?,?,UTC_TIMESTAMP())');
            $h->execute([$storeId,$order['id'],$next,$next==='CANCELLED'?$reasonCode:null,$next==='CANCELLED'?$reasonNote:null,$actorId]);
            $pdo->commit(); return true;
        } catch (\Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
    }

    private function items(int $storeId, int $orderId): array
    {
        $s = Database::connection()->prepare('SELECT * FROM order_items WHERE store_id=? AND order_id=? ORDER BY id');
        $s->execute([$storeId, $orderId]); return $s->fetchAll();
    }
}
