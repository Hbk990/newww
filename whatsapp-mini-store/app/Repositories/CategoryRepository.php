<?php
namespace App\Repositories;

use App\Core\Database;
use App\Services\PlanAccessService;

final class CategoryRepository
{
    public function all(int $storeId, bool $activeOnly = false): array
    {
        $sql = "SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id AND p.store_id=c.store_id AND p.deleted_at IS NULL) product_count FROM categories c WHERE c.store_id=? AND c.deleted_at IS NULL";
        if ($activeOnly) $sql .= " AND c.status='ACTIVE'";
        $sql .= ' ORDER BY c.sort_order,c.name';
        $s = Database::connection()->prepare($sql); $s->execute([$storeId]); return $s->fetchAll();
    }

    public function find(int $storeId, int $id): ?array
    {
        $s = Database::connection()->prepare('SELECT * FROM categories WHERE id=? AND store_id=? AND deleted_at IS NULL');
        $s->execute([$id,$storeId]); return $s->fetch() ?: null;
    }

    public function create(int $storeId, array $data): int
    {
        $pdo=Database::connection();$pdo->beginTransaction();try{(new PlanAccessService)->assertCanAdd($storeId,'categories',1,$pdo);$s=$pdo->prepare("INSERT INTO categories (store_id,name,slug,description,sort_order,status,created_at,updated_at) SELECT ?,?,?,?,COALESCE(MAX(sort_order),-1)+1,?,UTC_TIMESTAMP(),UTC_TIMESTAMP() FROM categories WHERE store_id=? AND deleted_at IS NULL");$s->execute([$storeId,$data['name'],$data['slug'],$data['description'],$data['status'],$storeId]);$id=(int)$pdo->lastInsertId();$pdo->commit();return$id;}catch(\Throwable$e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}
    }

    public function update(int $storeId, int $id, array $data): bool
    {
        $s = Database::connection()->prepare('UPDATE categories SET name=?,slug=?,description=?,status=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND store_id=? AND deleted_at IS NULL');
        $s->execute([$data['name'],$data['slug'],$data['description'],$data['status'],$id,$storeId]);
        $check=Database::connection()->prepare('SELECT 1 FROM categories WHERE id=? AND store_id=? AND deleted_at IS NULL');$check->execute([$id,$storeId]);return(bool)$check->fetchColumn();
    }

    public function setImage(int $storeId,int $id,?string $path):bool{$s=Database::connection()->prepare('UPDATE categories SET image_path=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND store_id=? AND deleted_at IS NULL');$s->execute([$path,$id,$storeId]);return$s->rowCount()>0;}

    public function toggle(int $storeId, int $id): bool
    {
        $s = Database::connection()->prepare("UPDATE categories SET status=IF(status='ACTIVE','INACTIVE','ACTIVE'),updated_at=UTC_TIMESTAMP() WHERE id=? AND store_id=? AND deleted_at IS NULL");
        $s->execute([$id,$storeId]); return $s->rowCount() > 0;
    }

    public function deleteSafe(int $storeId, int $id): string
    {
        $pdo = Database::connection(); $pdo->beginTransaction();
        try {
            $check = $pdo->prepare('SELECT id FROM categories WHERE id=? AND store_id=? AND deleted_at IS NULL FOR UPDATE');
            $check->execute([$id,$storeId]); if (!$check->fetchColumn()) { $pdo->rollBack(); return 'missing'; }
            $products = $pdo->prepare('SELECT COUNT(*) FROM products WHERE category_id=? AND store_id=? AND deleted_at IS NULL');
            $products->execute([$id,$storeId]); if ((int) $products->fetchColumn() > 0) { $pdo->rollBack(); return 'in_use'; }
            $pdo->prepare('DELETE FROM categories WHERE id=? AND store_id=?')->execute([$id,$storeId]);
            $pdo->commit(); return 'deleted';
        } catch (\Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
    }

    public function move(int $storeId, int $id, string $direction): bool
    {
        $pdo = Database::connection(); $pdo->beginTransaction();
        try {
            $current = $pdo->prepare('SELECT id,sort_order FROM categories WHERE id=? AND store_id=? AND deleted_at IS NULL FOR UPDATE');
            $current->execute([$id,$storeId]); $row = $current->fetch(); if (!$row) { $pdo->rollBack(); return false; }
            $op = $direction === 'up' ? '<' : '>'; $order = $direction === 'up' ? 'DESC' : 'ASC';
            $near = $pdo->prepare("SELECT id,sort_order FROM categories WHERE store_id=? AND deleted_at IS NULL AND sort_order {$op} ? ORDER BY sort_order {$order},id {$order} LIMIT 1 FOR UPDATE");
            $near->execute([$storeId,$row['sort_order']]); $other = $near->fetch(); if (!$other) { $pdo->rollBack(); return true; }
            $pdo->prepare('UPDATE categories SET sort_order=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND store_id=?')->execute([$other['sort_order'],$row['id'],$storeId]);
            $pdo->prepare('UPDATE categories SET sort_order=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND store_id=?')->execute([$row['sort_order'],$other['id'],$storeId]);
            $pdo->commit(); return true;
        } catch (\Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
    }
}
