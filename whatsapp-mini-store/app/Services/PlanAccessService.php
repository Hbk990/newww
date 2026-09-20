<?php
namespace App\Services;

use App\Core\Database;
use App\Repositories\SubscriptionRepository;
use PDO;

final class PlanAccessService
{
    private array$cache=[];

    public function context(int$storeId,?PDO$pdo=null,bool$forUpdate=false,bool$includeUsage=true):array
    {
        $cacheKey=$storeId.':'.($includeUsage?'usage':'entitlement');if(!$pdo&&!$forUpdate&&isset($this->cache[$cacheKey]))return$this->cache[$cacheKey];$repo=new SubscriptionRepository;$subscription=$repo->current($storeId,$pdo,$forUpdate);$effective=$subscription&&$this->isEntitled($subscription)?$this->planFromSubscription($subscription):$repo->freePlan($pdo);$context=['subscription'=>$subscription,'plan'=>$effective,'features'=>$effective['features']??[],'limits'=>$effective['limits']??[],'usage'=>$includeUsage?$repo->usage($storeId,$pdo):[],'is_fallback'=>!$subscription||($effective['code']??'FREE')!==($subscription['plan_code']??'FREE')];if(!$pdo&&!$forUpdate)$this->cache[$cacheKey]=$context;return$context;
    }

    public function feature(int$storeId,string$key):bool{return(bool)($this->context($storeId,null,false,false)['features'][$key]??false);}
    public function requireFeature(int$storeId,string$key,string$message):void{if(!$this->feature($storeId,$key))throw new \DomainException($message);}

    public function assertCanAdd(int$storeId,string$resource,int$amount=1,?PDO$pdo=null):void
    {
        $this->assertCanAddMany($storeId,[$resource=>$amount],$pdo);
    }

    public function assertCanAddMany(int$storeId,array$resources,?PDO$pdo=null):void
    {
        foreach($resources as$resource=>$amount)if(!in_array($resource,['products','categories','staff'],true)||!is_int($amount)||$amount<0)throw new \InvalidArgumentException('Invalid plan resource.');
        $pdo??=Database::connection();$context=$this->context($storeId,$pdo,true);foreach($resources as$resource=>$amount){if($amount===0)continue;$limit=(int)($context['limits'][$resource]??-1);if($limit<0)continue;$used=(int)($context['usage'][$resource]??0);if($used+$amount>$limit)throw new \DomainException('Your '.$context['plan']['name'].' plan allows '.$limit.' '.$resource.'. Upgrade your plan or remove an existing item.');}
    }

    public function remaining(int$storeId,string$resource):?int{$context=$this->context($storeId);$limit=(int)($context['limits'][$resource]??-1);return$limit<0?null:max(0,$limit-(int)($context['usage'][$resource]??0));}

    private function isEntitled(array$subscription):bool
    {
        $now=time();if($subscription['pending_plan_id']&&$subscription['scheduled_change_at']&&strtotime($subscription['scheduled_change_at'])<=$now)return false;$status=$subscription['status'];if($status==='ACTIVE'){if(!$subscription['current_period_ends_at'])return true;$end=strtotime($subscription['current_period_ends_at']);return$end>$now||$this->withinDerivedGrace($end,$now);}if($status==='TRIAL'){if(!$subscription['trial_ends_at'])return true;$end=strtotime($subscription['trial_ends_at']);return$end>$now||$this->withinDerivedGrace($end,$now);}if(in_array($status,['PAST_DUE','GRACE'],true))return(bool)$subscription['grace_ends_at']&&strtotime($subscription['grace_ends_at'])>$now;return false;
    }

    private function withinDerivedGrace(int|false$periodEnd,int$now):bool{return$periodEnd!==false&&$periodEnd+max(0,(int)config('billing')['grace_days'])*86400>$now;}

    private function planFromSubscription(array$subscription):array{return['id'=>$subscription['plan_id'],'code'=>$subscription['plan_code'],'name'=>$subscription['plan_name'],'description'=>$subscription['plan_description'],'features'=>$subscription['features'],'limits'=>$subscription['limits'],'monthly_price'=>$subscription['monthly_price'],'currency_code'=>$subscription['plan_currency'],'sort_order'=>$subscription['plan_sort_order']];}
}
