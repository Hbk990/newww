<?php
namespace App\Repositories;

use App\Core\Database;
use PDO;

final class SubscriptionRepository
{
    public function plans(bool$publicOnly=true):array
    {
        $sql='SELECT * FROM plans WHERE is_active=1'.($publicOnly?' AND is_public=1':'').' ORDER BY sort_order,id';$rows=Database::connection()->query($sql)->fetchAll();foreach($rows as&$row)$this->decodePlan($row);unset($row);return$rows;
    }

    public function planByCode(string$code,bool$publicOnly=true,?PDO$pdo=null,bool$forUpdate=false):?array
    {
        $pdo??=Database::connection();$sql='SELECT * FROM plans WHERE code=? AND is_active=1'.($publicOnly?' AND is_public=1':'').' LIMIT 1'.($forUpdate?' FOR UPDATE':'');$s=$pdo->prepare($sql);$s->execute([$code]);$plan=$s->fetch();if(!$plan)return null;$this->decodePlan($plan);return$plan;
    }

    public function freePlan(?PDO$pdo=null):array
    {
        $pdo??=Database::connection();$s=$pdo->prepare("SELECT * FROM plans WHERE code='FREE' AND is_active=1 LIMIT 1");$s->execute();$plan=$s->fetch();if(!$plan)throw new \RuntimeException('The FREE plan is not configured.');$this->decodePlan($plan);return$plan;
    }

    public function current(int$storeId,?PDO$pdo=null,bool$forUpdate=false):?array
    {
        $pdo??=Database::connection();$s=$pdo->prepare('SELECT sub.*,p.code plan_code,p.name plan_name,p.description plan_description,p.features plan_features,p.limits plan_limits,p.monthly_price,p.currency_code plan_currency,p.sort_order plan_sort_order,pp.code pending_plan_code,pp.name pending_plan_name FROM subscriptions sub JOIN plans p ON p.id=sub.plan_id LEFT JOIN plans pp ON pp.id=sub.pending_plan_id WHERE sub.store_id=? LIMIT 1'.($forUpdate?' FOR UPDATE':''));$s->execute([$storeId]);$row=$s->fetch();if(!$row)return null;$features=json_decode((string)$row['plan_features'],true);$limits=json_decode((string)$row['plan_limits'],true);$row['features']=is_array($features)?$features:[];$row['limits']=is_array($limits)?$limits:[];return$row;
    }

    public function usage(int$storeId,?PDO$pdo=null):array
    {
        $pdo??=Database::connection();$queries=['products'=>"SELECT COUNT(*) FROM products WHERE store_id=? AND deleted_at IS NULL",'categories'=>"SELECT COUNT(*) FROM categories WHERE store_id=? AND deleted_at IS NULL",'staff'=>"SELECT COUNT(*) FROM store_users WHERE store_id=? AND status='ACTIVE' AND role<>'MERCHANT_OWNER'"];$out=[];foreach($queries as$key=>$sql){$s=$pdo->prepare($sql);$s->execute([$storeId]);$out[$key]=(int)$s->fetchColumn();}return$out;
    }

    public function recentRequests(int$storeId):array
    {
        $s=Database::connection()->prepare('SELECT r.*,fp.name from_plan_name,tp.name to_plan_name FROM subscription_change_requests r JOIN plans fp ON fp.id=r.from_plan_id JOIN plans tp ON tp.id=r.to_plan_id WHERE r.store_id=? ORDER BY r.id DESC LIMIT 10');$s->execute([$storeId]);return$s->fetchAll();
    }

    private function decodePlan(array&$plan):void{$features=json_decode((string)$plan['features'],true);$limits=json_decode((string)$plan['limits'],true);$plan['features']=is_array($features)?$features:[];$plan['limits']=is_array($limits)?$limits:[];}
}
