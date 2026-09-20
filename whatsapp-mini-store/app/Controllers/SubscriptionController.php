<?php
namespace App\Controllers;

use App\Core\{Auth,Request,Response,Session,View};
use App\Repositories\{AuditLogRepository,SubscriptionRepository};
use App\Services\{PlanAccessService,SubscriptionService,TenantContext};

final class SubscriptionController
{
    public function index(Request$request):void{$store=(new TenantContext)->store();$repo=new SubscriptionRepository;$access=(new PlanAccessService)->context((int)$store['id']);View::render('merchant/subscription',['title'=>'Plan & Billing','store'=>$store,'plans'=>$repo->plans(),'access'=>$access,'requests'=>$repo->recentRequests((int)$store['id'])],'merchant');}
    public function change(Request$request):void{$store=(new TenantContext)->store();$code=strtoupper(trim((string)$request->input('plan_code')));try{$result=(new SubscriptionService)->requestChange($store,(int)Auth::id(),$code);}catch(\DomainException$e){Session::flash('error',$e->getMessage());Response::redirect('/merchant/subscription',303);}(new AuditLogRepository)->record((int)Auth::id(),'subscription.change_requested','store',(int)$store['id'],['plan_code'=>$code,'status'=>$result['status']]);Session::flash('success',$result['status']==='APPLIED'?'Plan changed successfully.':($result['status']==='SCHEDULED'?'Downgrade scheduled for the end of the current period.':'Paid plan request received. Access starts only after payment is confirmed.'));Response::redirect('/merchant/subscription',303);}
    public function cancel(Request$request):void{$store=(new TenantContext)->store();$id=(int)$request->route('id');try{(new SubscriptionService)->cancelRequest((int)$store['id'],(int)Auth::id(),$id);}catch(\DomainException$e){Session::flash('error',$e->getMessage());Response::redirect('/merchant/subscription',303);}(new AuditLogRepository)->record((int)Auth::id(),'subscription.change_cancelled','subscription_change',$id,['store_id'=>$store['id']]);Session::flash('success','Pending plan change cancelled.');Response::redirect('/merchant/subscription',303);}
}
