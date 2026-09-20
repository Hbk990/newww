<?php
namespace App\Repositories;

use App\Core\Database;
use App\Services\PlanAccessService;

final class StoreRepository
{
    public function slugExists(string $slug): bool
    {
        $s = Database::connection()->prepare('SELECT 1 FROM stores WHERE slug=? UNION SELECT 1 FROM store_slug_redirects WHERE old_slug=? LIMIT 1');
        $s->execute([$slug,$slug]);
        return (bool) $s->fetchColumn();
    }

    public function slugAvailableFor(int $storeId,string $slug):bool
    {
        $s=Database::connection()->prepare('SELECT 1 FROM stores WHERE slug=? AND id<>? UNION SELECT 1 FROM store_slug_redirects WHERE old_slug=? LIMIT 1');$s->execute([$slug,$storeId,$slug]);return!$s->fetchColumn();
    }

    public function updateDesign(int$storeId,array$data):void
    {
        $pdo=Database::connection();$pdo->beginTransaction();
        try{$lock=$pdo->prepare('SELECT slug FROM stores WHERE id=? FOR UPDATE');$lock->execute([$storeId]);$oldSlug=$lock->fetchColumn();if(!$oldSlug)throw new \DomainException('Store not found.');
            if($oldSlug!==$data['slug']){$taken=$pdo->prepare('SELECT 1 FROM stores WHERE slug=? AND id<>? UNION SELECT 1 FROM store_slug_redirects WHERE old_slug=? LIMIT 1');$taken->execute([$data['slug'],$storeId,$data['slug']]);if($taken->fetchColumn())throw new \DomainException('That store address is already in use or reserved as an old address.');$pdo->prepare('INSERT INTO store_slug_redirects (store_id,old_slug,created_at) VALUES (?,?,UTC_TIMESTAMP())')->execute([$storeId,$oldSlug]);}
            $s=$pdo->prepare('UPDATE stores SET name=?,slug=?,theme=?,logo_path=?,banner_path=?,accent_color=?,font_key=?,description=?,contact_email=?,address_text=?,social_links=?,updated_at=UTC_TIMESTAMP() WHERE id=?');
            $s->execute([$data['name'],$data['slug'],$data['theme'],$data['logo_path'],$data['banner_path'],$data['accent_color'],$data['font_key'],$data['description'],$data['contact_email'],$data['address_text'],json_encode($data['social_links'],JSON_UNESCAPED_SLASHES),$storeId]);$pdo->commit();
        }catch(\Throwable$e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}
    }

    public function createForOwner(int $userId, array $data): int
    {
        $pdo = Database::connection();
        $pdo->beginTransaction();
        try {
            $lock = $pdo->prepare('SELECT id FROM users WHERE id=? FOR UPDATE');
            $lock->execute([$userId]);
            if (!$lock->fetchColumn()) throw new \DomainException('Owner not found.');
            $owned=$pdo->prepare("SELECT store_id FROM store_users WHERE user_id=? AND role='MERCHANT_OWNER' AND status='ACTIVE' ORDER BY store_id FOR UPDATE");$owned->execute([$userId]);$storeIds=array_map('intval',$owned->fetchAll(\PDO::FETCH_COLUMN));$limit=(int)((new \App\Repositories\SubscriptionRepository)->freePlan($pdo)['limits']['stores']??1);foreach($storeIds as$ownedStoreId){$candidate=(int)((new PlanAccessService)->context($ownedStoreId,$pdo,true,false)['limits']['stores']??1);if($candidate<0){$limit=-1;break;}$limit=max($limit,$candidate);}if($limit>=0&&count($storeIds)>=$limit)throw new \DomainException('Your current plan does not allow another store.');
            $s = $pdo->prepare('INSERT INTO stores (name,slug,whatsapp_number,country_code,currency_code,theme,status,created_at,updated_at) VALUES (?,?,?,?,?,?,\'DRAFT\',UTC_TIMESTAMP(),UTC_TIMESTAMP())');
            $s->execute([$data['business_name'], $data['slug'], $data['whatsapp_number'], $data['country_code'], $data['currency_code'], $data['theme']]);
            $storeId = (int) $pdo->lastInsertId();
            $pdo->prepare('INSERT INTO store_users (store_id,user_id,role,status,created_at,updated_at) VALUES (?,?,\'MERCHANT_OWNER\',\'ACTIVE\',UTC_TIMESTAMP(),UTC_TIMESTAMP())')->execute([$storeId, $userId]);
            $topPlan = (new \App\Repositories\SubscriptionRepository)->topPlan($pdo);
            $trialDays = (int) config('billing')['trial_days'];
            $trialEndsAt = $trialDays > 0 ? gmdate('Y-m-d H:i:s', time() + $trialDays * 86400) : null;
            $subscription = $pdo->prepare('INSERT INTO subscriptions (store_id,plan_id,status,started_at,trial_ends_at,created_at,updated_at) VALUES (?,?,\'TRIAL\',UTC_TIMESTAMP(),?,UTC_TIMESTAMP(),UTC_TIMESTAMP())');
            $subscription->execute([$storeId, $topPlan['id'], $trialEndsAt]);
            if ($subscription->rowCount() !== 1) throw new \RuntimeException('Default plan is not configured.');
            $pdo->commit();
            return $storeId;
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    }

    public function firstOwnedBy(int $userId): ?array
    {
        $s = Database::connection()->prepare('SELECT s.* FROM stores s JOIN store_users su ON su.store_id=s.id WHERE su.user_id=? AND su.role=\'MERCHANT_OWNER\' AND su.status=\'ACTIVE\' ORDER BY s.id LIMIT 1');
        $s->execute([$userId]);
        return $s->fetch() ?: null;
    }

    public function firstAccessibleBy(int $userId): ?array
    {
        $s = Database::connection()->prepare("SELECT s.*,su.role AS member_role FROM stores s JOIN store_users su ON su.store_id=s.id WHERE su.user_id=? AND su.status='ACTIVE' ORDER BY FIELD(su.role,'MERCHANT_OWNER','MERCHANT_ADMIN','STAFF','ORDER_MANAGER'),s.id LIMIT 1");
        $s->execute([$userId]);
        return $s->fetch() ?: null;
    }

    public function accessibleBy(int$userId,int$storeId):?array{$s=Database::connection()->prepare("SELECT s.*,su.role AS member_role FROM stores s JOIN store_users su ON su.store_id=s.id WHERE s.id=? AND su.user_id=? AND su.status='ACTIVE' LIMIT 1");$s->execute([$storeId,$userId]);return$s->fetch()?:null;}
    public function accessibleStores(int$userId):array{$s=Database::connection()->prepare("SELECT s.id,s.name,s.slug,s.status,su.role AS member_role FROM stores s JOIN store_users su ON su.store_id=s.id WHERE su.user_id=? AND su.status='ACTIVE' ORDER BY s.name,s.id");$s->execute([$userId]);return$s->fetchAll();}
    public function canCreateForOwner(int$userId):bool
    {
        $s=Database::connection()->prepare("SELECT su.store_id FROM store_users su WHERE su.user_id=? AND su.role='MERCHANT_OWNER' AND su.status='ACTIVE' ORDER BY su.store_id");$s->execute([$userId]);$ids=array_map('intval',$s->fetchAll(\PDO::FETCH_COLUMN));$free=(new \App\Repositories\SubscriptionRepository)->freePlan();$limit=(int)($free['limits']['stores']??1);foreach($ids as$id){$candidate=(int)((new PlanAccessService)->context($id,null,false,false)['limits']['stores']??1);if($candidate<0)return true;$limit=max($limit,$candidate);}return count($ids)<$limit;
    }

    public function setStatusForOwner(int$userId,int$storeId,string$status):bool
    {
        if(!in_array($status,['DRAFT','ACTIVE'],true))return false;$s=Database::connection()->prepare("UPDATE stores s JOIN store_users su ON su.store_id=s.id SET s.status=?,s.updated_at=UTC_TIMESTAMP() WHERE s.id=? AND su.user_id=? AND su.role='MERCHANT_OWNER' AND su.status='ACTIVE' AND s.status<>'SUSPENDED'");$s->execute([$status,$storeId,$userId]);$check=Database::connection()->prepare('SELECT status FROM stores WHERE id=?');$check->execute([$storeId]);return$check->fetchColumn()===$status;
    }
}
