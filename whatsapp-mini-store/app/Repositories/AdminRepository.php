<?php
namespace App\Repositories;

use App\Core\Database;

final class AdminRepository
{
    public function metrics():array
    {
        $sql="SELECT
          (SELECT COUNT(*) FROM users WHERE platform_role='MERCHANT' AND deleted_at IS NULL) merchants,
          (SELECT COUNT(*) FROM users WHERE platform_role='MERCHANT' AND deleted_at IS NULL AND created_at>=UTC_TIMESTAMP()-INTERVAL 30 DAY) new_merchants_30d,
          (SELECT COUNT(*) FROM stores) stores,
          (SELECT COUNT(*) FROM stores WHERE status='ACTIVE') active_stores,
          (SELECT COUNT(*) FROM stores WHERE status='SUSPENDED') suspended_stores,
          (SELECT COUNT(*) FROM subscriptions WHERE status IN ('ACTIVE','TRIAL')) active_subscriptions,
          (SELECT COUNT(*) FROM orders) orders,
          (SELECT COUNT(*) FROM orders WHERE placed_at>=UTC_DATE()) orders_today";
        return Database::connection()->query($sql)->fetch()?:[];
    }

    public function mrrByCurrency():array
    {
        return Database::connection()->query("SELECT p.currency_code,SUM(p.monthly_price) amount,COUNT(*) subscriptions FROM subscriptions sub JOIN plans p ON p.id=sub.plan_id WHERE sub.status='ACTIVE' AND p.monthly_price>0 AND (sub.current_period_ends_at IS NULL OR sub.current_period_ends_at>UTC_TIMESTAMP()) GROUP BY p.currency_code ORDER BY p.currency_code")->fetchAll();
    }

    public function orderValueByCurrency():array{return Database::connection()->query("SELECT currency_code,SUM(total) amount,COUNT(*) orders FROM orders WHERE status<>'CANCELLED' GROUP BY currency_code ORDER BY currency_code")->fetchAll();}
    public function recentRegistrations():array{return Database::connection()->query("SELECT id,name,email,status,email_verified_at,created_at FROM users WHERE platform_role='MERCHANT' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 8")->fetchAll();}
    public function recentOrders():array{return Database::connection()->query("SELECT o.reference,o.customer_name,o.currency_code,o.total,o.status,o.placed_at,s.id store_id,s.name store_name FROM orders o JOIN stores s ON s.id=o.store_id ORDER BY o.placed_at DESC,o.id DESC LIMIT 8")->fetchAll();}

    public function audit(array$filters):array
    {
        $where=' WHERE 1=1';$params=[];if($filters['q']!==''){$where.=' AND (a.event LIKE ? OR a.target_type LIKE ? OR u.email LIKE ?)';$like='%'.$filters['q'].'%';array_push($params,$like,$like,$like);}if($filters['event']!==''){$where.=' AND a.event=?';$params[]=$filters['event'];}$pdo=Database::connection();$count=$pdo->prepare('SELECT COUNT(*) FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id'.$where);$count->execute($params);$total=(int)$count->fetchColumn();$offset=($filters['page']-1)*30;$s=$pdo->prepare('SELECT a.id,a.event,a.target_type,a.target_id,a.ip_address,a.metadata,a.created_at,u.name actor_name,u.email actor_email FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id'.$where." ORDER BY a.created_at DESC,a.id DESC LIMIT 30 OFFSET {$offset}");$s->execute($params);return['items'=>$s->fetchAll(),'total'=>$total,'page'=>$filters['page'],'pages'=>max(1,(int)ceil($total/30))];
    }
    public function auditEvents():array{return Database::connection()->query('SELECT DISTINCT event FROM audit_logs ORDER BY event')->fetchAll(\PDO::FETCH_COLUMN);}
}
