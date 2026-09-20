<?php
namespace App\Repositories;

use App\Core\Database;
use PDO;

final class OfferRepository
{
    public function all(int $storeId): array
    {
        $s = Database::connection()->prepare('SELECT o.*,p.name product_name,c.name category_name FROM offers o LEFT JOIN products p ON p.id=o.scope_product_id AND p.store_id=o.store_id LEFT JOIN categories c ON c.id=o.scope_category_id AND c.store_id=o.store_id WHERE o.store_id=? ORDER BY o.created_at DESC,o.id DESC');
        $s->execute([$storeId]);
        $offers = $s->fetchAll();
        foreach ($offers as &$offer) if ($offer['type'] === 'FIXED_BUNDLE') $offer['items'] = $this->bundleItems($storeId, (int) $offer['id']);
        return $offers;
    }

    public function find(int $storeId, int $id): ?array
    {
        $s = Database::connection()->prepare('SELECT * FROM offers WHERE id=? AND store_id=? LIMIT 1');
        $s->execute([$id, $storeId]);
        $offer = $s->fetch() ?: null;
        if ($offer && $offer['type'] === 'FIXED_BUNDLE') $offer['items'] = $this->bundleItems($storeId, $id);
        return $offer;
    }

    public function bundleItems(int $storeId, int $offerId): array
    {
        $s = Database::connection()->prepare('SELECT b.product_id,b.quantity,p.name product_name FROM offer_bundle_items b JOIN products p ON p.id=b.product_id AND p.store_id=b.store_id WHERE b.offer_id=? AND b.store_id=? ORDER BY b.id');
        $s->execute([$offerId, $storeId]);
        return $s->fetchAll();
    }

    /** Every currently-redeemable offer for this store (status + active window already resolved), FIXED_BUNDLE rows carrying their item list. */
    public function activeForStore(int $storeId): array
    {
        $s = Database::connection()->prepare("SELECT o.*,p.name product_name,c.name category_name FROM offers o LEFT JOIN products p ON p.id=o.scope_product_id AND p.store_id=o.store_id LEFT JOIN categories c ON c.id=o.scope_category_id AND c.store_id=o.store_id WHERE o.store_id=? AND o.status='ACTIVE' AND (o.starts_at IS NULL OR o.starts_at<=UTC_TIMESTAMP()) AND (o.ends_at IS NULL OR o.ends_at>=UTC_TIMESTAMP())");
        $s->execute([$storeId]);
        $offers = $s->fetchAll();
        foreach ($offers as &$offer) if ($offer['type'] === 'FIXED_BUNDLE') $offer['items'] = $this->bundleItems($storeId, (int) $offer['id']);
        return $offers;
    }

    public function recordRedemption(PDO $pdo, int $storeId, int $offerId, int $orderId, string $discountAmount): void
    {
        $pdo->prepare('INSERT INTO offer_redemptions (store_id,offer_id,order_id,discount_amount,created_at) VALUES (?,?,?,?,UTC_TIMESTAMP())')
            ->execute([$storeId, $offerId, $orderId, $discountAmount]);
    }

    public function create(int $storeId, array $data): int
    {
        $s = Database::connection()->prepare('INSERT INTO offers (store_id,name,headline,type,scope_product_id,scope_category_id,buy_quantity,get_quantity,get_discount_type,get_discount_value,bundle_price,starts_at,ends_at,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())');
        $s->execute([$storeId,$data['name'],$data['headline'],$data['type'],$data['scope_product_id'],$data['scope_category_id'],$data['buy_quantity'],$data['get_quantity'],$data['get_discount_type'],$data['get_discount_value'],$data['bundle_price'],$data['starts_at'],$data['ends_at'],$data['status']]);
        $id = (int) Database::connection()->lastInsertId();
        if ($data['type'] === 'FIXED_BUNDLE') $this->replaceBundleItems($storeId, $id, $data['bundle_items']);
        return $id;
    }

    public function update(int $storeId, int $id, array $data): bool
    {
        $s = Database::connection()->prepare('UPDATE offers SET name=?,headline=?,type=?,scope_product_id=?,scope_category_id=?,buy_quantity=?,get_quantity=?,get_discount_type=?,get_discount_value=?,bundle_price=?,starts_at=?,ends_at=?,status=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND store_id=?');
        $s->execute([$data['name'],$data['headline'],$data['type'],$data['scope_product_id'],$data['scope_category_id'],$data['buy_quantity'],$data['get_quantity'],$data['get_discount_type'],$data['get_discount_value'],$data['bundle_price'],$data['starts_at'],$data['ends_at'],$data['status'],$id,$storeId]);
        $ok = $s->rowCount() > 0;
        if ($data['type'] === 'FIXED_BUNDLE') $this->replaceBundleItems($storeId, $id, $data['bundle_items']);
        return $ok;
    }

    private function replaceBundleItems(int $storeId, int $offerId, array $items): void
    {
        $pdo = Database::connection();
        $pdo->prepare('DELETE FROM offer_bundle_items WHERE offer_id=? AND store_id=?')->execute([$offerId, $storeId]);
        $insert = $pdo->prepare('INSERT INTO offer_bundle_items (store_id,offer_id,product_id,quantity,created_at) VALUES (?,?,?,?,UTC_TIMESTAMP())');
        foreach ($items as $item) $insert->execute([$storeId, $offerId, $item['product_id'], $item['quantity']]);
    }

    public function setStatus(int $storeId, int $id, string $status): bool
    {
        $s = Database::connection()->prepare("UPDATE offers SET status=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND store_id=?");
        $s->execute([$status, $id, $storeId]);
        return $s->rowCount() > 0;
    }
}
