<?php
namespace App\Repositories;

use App\Core\Database;
use PDO;

final class DiscountCodeRepository
{
    public function all(int $storeId): array
    {
        $s = Database::connection()->prepare('SELECT d.*,p.name product_name,c.name category_name FROM discount_codes d LEFT JOIN products p ON p.id=d.scope_product_id AND p.store_id=d.store_id LEFT JOIN categories c ON c.id=d.scope_category_id AND c.store_id=d.store_id WHERE d.store_id=? ORDER BY d.created_at DESC,d.id DESC');
        $s->execute([$storeId]);
        return $s->fetchAll();
    }

    public function find(int $storeId, int $id): ?array
    {
        $s = Database::connection()->prepare('SELECT * FROM discount_codes WHERE id=? AND store_id=? LIMIT 1');
        $s->execute([$id, $storeId]);
        return $s->fetch() ?: null;
    }

    /** Locks and returns the code row only if it is currently redeemable in isolation (status/date/global-limit); caller still must check per-customer limits and cart-specific rules. */
    public function lockRedeemable(PDO $pdo, int $storeId, string $code): ?array
    {
        $s = $pdo->prepare("SELECT * FROM discount_codes WHERE store_id=? AND code=? AND status='ACTIVE' FOR UPDATE");
        $s->execute([$storeId, $code]);
        $row = $s->fetch();
        if (!$row) return null;
        $now = time();
        if ($row['starts_at'] && strtotime($row['starts_at']) > $now) return null;
        if ($row['ends_at'] && strtotime($row['ends_at']) < $now) return null;
        if ($row['usage_limit'] !== null && (int) $row['times_used'] >= (int) $row['usage_limit']) return null;
        return $row;
    }

    public function customerRedemptionCount(PDO $pdo, int $storeId, int $discountCodeId, int $customerId): int
    {
        $s = $pdo->prepare('SELECT COUNT(*) FROM discount_code_redemptions WHERE store_id=? AND discount_code_id=? AND customer_id=?');
        $s->execute([$storeId, $discountCodeId, $customerId]);
        return (int) $s->fetchColumn();
    }

    public function recordRedemption(PDO $pdo, int $storeId, int $discountCodeId, int $orderId, ?int $customerId, string $discountAmount): void
    {
        $pdo->prepare('INSERT INTO discount_code_redemptions (store_id,discount_code_id,order_id,customer_id,discount_amount,created_at) VALUES (?,?,?,?,?,UTC_TIMESTAMP())')
            ->execute([$storeId, $discountCodeId, $orderId, $customerId, $discountAmount]);
        $pdo->prepare('UPDATE discount_codes SET times_used=times_used+1,updated_at=UTC_TIMESTAMP() WHERE id=? AND store_id=?')
            ->execute([$discountCodeId, $storeId]);
    }

    public function create(int $storeId, array $data): int
    {
        $s = Database::connection()->prepare('INSERT INTO discount_codes (store_id,code,type,value,scope_product_id,scope_category_id,min_order_amount,starts_at,ends_at,usage_limit,usage_limit_per_customer,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())');
        $s->execute([$storeId,$data['code'],$data['type'],$data['value'],$data['scope_product_id'],$data['scope_category_id'],$data['min_order_amount'],$data['starts_at'],$data['ends_at'],$data['usage_limit'],$data['usage_limit_per_customer'],$data['status']]);
        return (int) Database::connection()->lastInsertId();
    }

    public function update(int $storeId, int $id, array $data): bool
    {
        $s = Database::connection()->prepare('UPDATE discount_codes SET code=?,type=?,value=?,scope_product_id=?,scope_category_id=?,min_order_amount=?,starts_at=?,ends_at=?,usage_limit=?,usage_limit_per_customer=?,status=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND store_id=?');
        $s->execute([$data['code'],$data['type'],$data['value'],$data['scope_product_id'],$data['scope_category_id'],$data['min_order_amount'],$data['starts_at'],$data['ends_at'],$data['usage_limit'],$data['usage_limit_per_customer'],$data['status'],$id,$storeId]);
        return $s->rowCount() > 0;
    }

    public function setStatus(int $storeId, int $id, string $status): bool
    {
        $s = Database::connection()->prepare("UPDATE discount_codes SET status=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND store_id=?");
        $s->execute([$status, $id, $storeId]);
        return $s->rowCount() > 0;
    }
}
