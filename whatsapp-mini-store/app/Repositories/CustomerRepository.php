<?php
namespace App\Repositories;

use App\Core\Database;

final class CustomerRepository
{
    public function paginate(int$storeId,string$query,int$page):array
    {
        $where=' WHERE c.store_id=?';$params=[$storeId];if($query!==''){$where.=' AND (c.name LIKE ? OR c.normalized_phone LIKE ?)';$like='%'.$query.'%';array_push($params,$like,$like);}
        $count=Database::connection()->prepare('SELECT COUNT(*) FROM customers c'.$where);$count->execute($params);$total=(int)$count->fetchColumn();$page=max(1,$page);$pages=max(1,(int)ceil($total/20));$offset=($page-1)*20;
        $s=Database::connection()->prepare("SELECT c.id,c.name,c.phone,c.first_order_at,c.last_order_at,COUNT(CASE WHEN o.status<>'CANCELLED' THEN 1 END) order_count,COALESCE(SUM(CASE WHEN o.status<>'CANCELLED' THEN o.total ELSE 0 END),0) total_value,MAX(o.currency_code) currency_code FROM customers c LEFT JOIN orders o ON o.customer_id=c.id AND o.store_id=c.store_id{$where} GROUP BY c.id ORDER BY c.last_order_at DESC,c.id DESC LIMIT 20 OFFSET {$offset}");$s->execute($params);
        return['items'=>$s->fetchAll(),'total'=>$total,'page'=>$page,'pages'=>$pages];
    }

    public function find(int$storeId,int$id):?array
    {
        $s=Database::connection()->prepare("SELECT c.*,COUNT(CASE WHEN o.status<>'CANCELLED' THEN 1 END) order_count,COALESCE(SUM(CASE WHEN o.status<>'CANCELLED' THEN o.total ELSE 0 END),0) total_value,MAX(o.currency_code) currency_code FROM customers c LEFT JOIN orders o ON o.customer_id=c.id AND o.store_id=c.store_id WHERE c.id=? AND c.store_id=? GROUP BY c.id");$s->execute([$id,$storeId]);$customer=$s->fetch();if(!$customer)return null;
        $orders=Database::connection()->prepare('SELECT reference,status,total,currency_code,placed_at,whatsapp_opened_at FROM orders WHERE customer_id=? AND store_id=? ORDER BY placed_at DESC,id DESC');$orders->execute([$id,$storeId]);$customer['orders']=$orders->fetchAll();return$customer;
    }

    public function upsert(\PDO$pdo,int$storeId,string$name,string$phone):int
    {
        $s=$pdo->prepare('INSERT INTO customers (store_id,name,phone,normalized_phone,first_order_at,last_order_at,created_at,updated_at) VALUES (?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id),name=VALUES(name),phone=VALUES(phone),last_order_at=UTC_TIMESTAMP(),updated_at=UTC_TIMESTAMP()');$s->execute([$storeId,$name,$phone,$phone]);return(int)$pdo->lastInsertId();
    }
}
