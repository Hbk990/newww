<?php
namespace App\Repositories;

use App\Core\Database;

final class AnalyticsRepository
{
    public function record(int $storeId,string $type,string $sessionHash,?int $productId=null,?string $search=null,array $metadata=[]):void
    {
        $s=Database::connection()->prepare('INSERT INTO analytics_events (store_id,event_type,session_hash,product_id,search_query,metadata_json,occurred_at,created_at) VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())');
        $s->execute([$storeId,$type,$sessionHash,$productId,$search,json_encode($metadata,JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE)?:null]);
    }

    public function dashboard(int $storeId,int $days=30):array
    {
        $days=max(1,min(365,$days));$pdo=Database::connection();
        $events=$pdo->prepare("SELECT COUNT(DISTINCT CASE WHEN event_type IN ('store_view','product_view') THEN session_hash END) visitors,SUM(event_type='product_view') product_views,SUM(event_type='add_to_cart') cart_additions,SUM(event_type='checkout_started') checkouts FROM analytics_events WHERE store_id=? AND occurred_at>=UTC_TIMESTAMP()-INTERVAL {$days} DAY");$events->execute([$storeId]);$metrics=$events->fetch()?:[];
        $orders=$pdo->prepare("SELECT COUNT(*) orders,COALESCE(SUM(CASE WHEN status<>'CANCELLED' THEN total ELSE 0 END),0) order_value FROM orders WHERE store_id=? AND placed_at>=UTC_TIMESTAMP()-INTERVAL {$days} DAY");$orders->execute([$storeId]);$metrics=array_merge($metrics,$orders->fetch()?:[]);
        $funnel=$pdo->prepare("SELECT COUNT(DISTINCT CASE WHEN event_type IN ('store_view','product_view') THEN session_hash END) visitors,COUNT(DISTINCT CASE WHEN event_type='product_view' THEN session_hash END) product_viewers,COUNT(DISTINCT CASE WHEN event_type='add_to_cart' THEN session_hash END) cart_users,COUNT(DISTINCT CASE WHEN event_type='checkout_started' THEN session_hash END) checkout_users,COUNT(DISTINCT CASE WHEN event_type='order_created' THEN session_hash END) ordering_users FROM analytics_events WHERE store_id=? AND occurred_at>=UTC_TIMESTAMP()-INTERVAL {$days} DAY");$funnel->execute([$storeId]);
        $popular=$pdo->prepare("SELECT COALESCE(p.name,'Deleted product') name,e.product_id,COUNT(*) views FROM analytics_events e LEFT JOIN products p ON p.id=e.product_id AND p.store_id=e.store_id WHERE e.store_id=? AND e.event_type='product_view' AND e.occurred_at>=UTC_TIMESTAMP()-INTERVAL {$days} DAY GROUP BY e.product_id,p.name ORDER BY views DESC,name LIMIT 10");$popular->execute([$storeId]);
        $searches=$pdo->prepare("SELECT search_query,COUNT(*) searches FROM analytics_events WHERE store_id=? AND event_type='search' AND search_query IS NOT NULL AND occurred_at>=UTC_TIMESTAMP()-INTERVAL {$days} DAY GROUP BY search_query ORDER BY searches DESC,search_query LIMIT 10");$searches->execute([$storeId]);
        $daily=$pdo->prepare("SELECT DATE(occurred_at) day,COUNT(DISTINCT CASE WHEN event_type IN ('store_view','product_view') THEN session_hash END) visitors,SUM(event_type='product_view') product_views FROM analytics_events WHERE store_id=? AND occurred_at>=UTC_DATE()-INTERVAL 13 DAY GROUP BY DATE(occurred_at) ORDER BY day");$daily->execute([$storeId]);
        return['metrics'=>$metrics,'funnel'=>$funnel->fetch()?:[],'popular'=>$popular->fetchAll(),'searches'=>$searches->fetchAll(),'daily'=>$daily->fetchAll(),'days'=>$days];
    }
}
