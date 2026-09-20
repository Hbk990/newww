<?php
namespace App\Services;

use App\Core\Database;
use App\Repositories\{AdminPlanRepository,AuditLogRepository};

final class SuperAdminActionService
{
    public function setMerchantStatus(int$actorId,int$userId,string$status):void
    {
        if(!in_array($status,['ACTIVE','SUSPENDED'],true))throw new \DomainException('Choose a valid merchant status.');$pdo=Database::connection();$pdo->beginTransaction();try{$s=$pdo->prepare("SELECT id,status FROM users WHERE id=? AND platform_role='MERCHANT' AND deleted_at IS NULL FOR UPDATE");$s->execute([$userId]);$user=$s->fetch();if(!$user)throw new \DomainException('Merchant not found.');if($user['status']===$status){$pdo->commit();return;}$pdo->prepare('UPDATE users SET status=?,updated_at=UTC_TIMESTAMP() WHERE id=?')->execute([$status,$userId]);(new AuditLogRepository)->record($actorId,$status==='SUSPENDED'?'admin.merchant_suspended':'admin.merchant_reactivated','user',$userId,['from'=>$user['status'],'to'=>$status]);$pdo->commit();}catch(\Throwable$e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}
    }

    public function setStoreSuspension(int$actorId,int$storeId,bool$suspend):void
    {
        $pdo=Database::connection();$pdo->beginTransaction();try{$s=$pdo->prepare('SELECT id,status,status_before_suspension FROM stores WHERE id=? FOR UPDATE');$s->execute([$storeId]);$store=$s->fetch();if(!$store)throw new \DomainException('Store not found.');if($suspend){if($store['status']==='SUSPENDED'){$pdo->commit();return;}$pdo->prepare("UPDATE stores SET status_before_suspension=status,status='SUSPENDED',suspended_at=UTC_TIMESTAMP(),updated_at=UTC_TIMESTAMP() WHERE id=?")->execute([$storeId]);$to='SUSPENDED';$event='admin.store_suspended';}else{if($store['status']!=='SUSPENDED')throw new \DomainException('Only suspended stores can be reactivated.');$to=in_array($store['status_before_suspension'],['DRAFT','ACTIVE'],true)?$store['status_before_suspension']:'DRAFT';$pdo->prepare('UPDATE stores SET status=?,status_before_suspension=NULL,suspended_at=NULL,updated_at=UTC_TIMESTAMP() WHERE id=?')->execute([$to,$storeId]);$event='admin.store_reactivated';}(new AuditLogRepository)->record($actorId,$event,'store',$storeId,['from'=>$store['status'],'to'=>$to]);$pdo->commit();}catch(\Throwable$e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}
    }

    public function changeStorePlan(int$actorId,int$storeId,string$planCode,int$days):void
    {
        $plan=(new \App\Repositories\SubscriptionRepository)->planByCode(strtoupper($planCode),false);if(!$plan)throw new \DomainException('Plan not found.');$days=max(1,min(3650,$days));(new SubscriptionService)->activate($storeId,$plan['code'],$days,'ADMIN-'.$actorId.'-'.gmdate('YmdHis'),$actorId);
    }

    public function updatePlan(int$actorId,int$planId,array$input):void
    {
        $definitions=config('plans');$name=trim((string)($input['name']??''));$description=trim((string)($input['description']??''));$price=trim((string)($input['monthly_price']??''));$currency=strtoupper(trim((string)($input['currency_code']??'')));$sort=(int)($input['sort_order']??0);$errors=[];if(mb_strlen($name)<2||mb_strlen($name)>80)$errors[]='Plan name must be 2–80 characters.';if(mb_strlen($description)>255)$errors[]='Description is too long.';if(!preg_match('/^\d{1,10}(?:\.\d{1,2})?$/',$price))$errors[]='Enter a valid monthly price.';if(!in_array($currency,config('app')['currencies'],true))$errors[]='Choose a supported currency.';if($sort<0||$sort>10000)$errors[]='Sort order must be between 0 and 10000.';$limits=[];foreach($definitions['limits']as$key=>$definition){$value=filter_var($input['limits'][$key]??null,FILTER_VALIDATE_INT);if($value===false||($value!==-1&&($value<$definition['min']||$value>$definition['max'])))$errors[]=$definition['label'].' must be -1 for unlimited or within its allowed range.';$limits[$key]=(int)$value;}if($errors)throw new \DomainException(implode(' ',$errors));$pdo=Database::connection();$pdo->beginTransaction();try{$repo=new AdminPlanRepository;$plan=$repo->find($planId,true,$pdo);if(!$plan)throw new \DomainException('Plan not found.');$features=$plan['features'];foreach($definitions['features']as$key=>$label)$features[$key]=isset($input['features'][$key]);$mergedLimits=array_replace($plan['limits'],$limits);$isPublic=isset($input['is_public'])?1:0;$isActive=isset($input['is_active'])?1:0;if($plan['code']==='FREE'){$price='0.00';$isPublic=1;$isActive=1;$features['basic_storefront']=true;$mergedLimits['stores']=max(1,(int)$mergedLimits['stores']);}$s=$pdo->prepare('UPDATE plans SET name=?,description=?,features=?,limits=?,monthly_price=?,currency_code=?,sort_order=?,is_public=?,is_active=?,updated_at=UTC_TIMESTAMP() WHERE id=?');$s->execute([$name,$description===''?null:$description,json_encode($features,JSON_UNESCAPED_SLASHES),json_encode($mergedLimits,JSON_UNESCAPED_SLASHES),$price,$currency,$sort,$isPublic,$isActive,$planId]);(new AuditLogRepository)->record($actorId,'admin.plan_updated','plan',$planId,['code'=>$plan['code'],'price_from'=>$plan['monthly_price'],'price_to'=>$price,'currency'=>$currency,'limits'=>$mergedLimits,'features'=>$features,'is_public'=>$isPublic,'is_active'=>$isActive]);$pdo->commit();}catch(\Throwable$e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}
    }
}
