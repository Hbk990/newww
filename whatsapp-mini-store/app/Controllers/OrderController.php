<?php
namespace App\Controllers;

use App\Core\{Auth,Request,Response,Session,View};
use App\Repositories\{AuditLogRepository,OrderRepository};
use App\Services\TenantContext;

final class OrderController
{
    private const STATUSES=['NEW','CONFIRMED','PREPARING','READY','COMPLETED','CANCELLED'];
    public function index(Request$request):void{$store=(new TenantContext)->store();$status=strtoupper(trim((string)$request->query('status')));if($status!==''&&!in_array($status,self::STATUSES,true))Response::abort(400);$query=mb_substr(trim((string)$request->query('q')),0,100);$orders=(new OrderRepository)->paginate((int)$store['id'],$status,$query,max(1,(int)$request->query('page',1)));if($orders['total']>0&&(int)$orders['page']>(int)$orders['pages'])Response::abort(404);View::render('merchant/orders/index',['title'=>'Orders','store'=>$store,'orders'=>$orders,'status'=>$status,'query'=>$query,'statuses'=>self::STATUSES],'merchant');}
    public function show(Request$request):void{$store=(new TenantContext)->store();$order=(new OrderRepository)->merchantOrder((int)$store['id'],(string)$request->route('reference'));if(!$order)Response::abort(404);View::render('merchant/orders/show',['title'=>$order['reference'],'store'=>$store,'order'=>$order,'nextStatuses'=>$this->next($order['status'])],'merchant');}
    public function status(Request$request):void{$store=(new TenantContext)->store();$reference=(string)$request->route('reference');$next=strtoupper((string)$request->input('status'));if(!in_array($next,self::STATUSES,true))Response::abort(400);$repo=new OrderRepository;try{if(!$repo->updateStatus((int)$store['id'],$reference,$next,(int)Auth::id()))Response::abort(404);}catch(\DomainException$e){Session::flash('error',$e->getMessage());Response::redirect('/merchant/orders/'.$reference,303);}$order=$repo->merchantOrder((int)$store['id'],$reference);(new AuditLogRepository)->record((int)Auth::id(),'order.status_changed','order',(int)$order['id'],['store_id'=>$store['id'],'reference'=>$reference,'status'=>$next]);Session::flash('success','Order status updated to '.ucfirst(strtolower($next)).'.');Response::redirect('/merchant/orders/'.$reference,303);}
    private function next(string$status):array{return match($status){'NEW'=>['CONFIRMED','CANCELLED'],'CONFIRMED'=>['PREPARING','CANCELLED'],'PREPARING'=>['READY','CANCELLED'],'READY'=>['COMPLETED','CANCELLED'],default=>[]};}
}
