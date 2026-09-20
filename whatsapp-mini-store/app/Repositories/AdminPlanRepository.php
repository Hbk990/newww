<?php
namespace App\Repositories;
use App\Core\Database;
final class AdminPlanRepository
{
    public function all():array{$rows=Database::connection()->query("SELECT p.*,COUNT(sub.id) subscription_count,SUM(sub.status IN ('ACTIVE','TRIAL')) active_subscription_count FROM plans p LEFT JOIN subscriptions sub ON sub.plan_id=p.id GROUP BY p.id ORDER BY p.sort_order,p.id")->fetchAll();foreach($rows as&$row)$this->decode($row);unset($row);return$rows;}
    public function find(int$id,bool$forUpdate=false,?\PDO$pdo=null):?array{$pdo??=Database::connection();$s=$pdo->prepare('SELECT * FROM plans WHERE id=? LIMIT 1'.($forUpdate?' FOR UPDATE':''));$s->execute([$id]);$row=$s->fetch();if(!$row)return null;$this->decode($row);return$row;}
    private function decode(array&$row):void{$features=json_decode((string)$row['features'],true);$limits=json_decode((string)$row['limits'],true);$row['features']=is_array($features)?$features:[];$row['limits']=is_array($limits)?$limits:[];}
}
