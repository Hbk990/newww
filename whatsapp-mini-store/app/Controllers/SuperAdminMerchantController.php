<?php
namespace App\Controllers;
use App\Core\{Auth,Request,Response,Session,View};
use App\Repositories\AdminMerchantRepository;
use App\Services\SuperAdminActionService;
final class SuperAdminMerchantController
{
    public function index(Request$request):void{Auth::requireSuperAdmin();$filters=['q'=>mb_substr(trim((string)$request->query('q')),0,120),'status'=>strtoupper((string)$request->query('status')),'page'=>max(1,(int)$request->query('page',1))];if(!in_array($filters['status'],['','ACTIVE','SUSPENDED'],true))$filters['status']='';$result=(new AdminMerchantRepository)->search($filters);if($filters['page']>$result['pages']&&$result['total']>0)Response::redirect('/sa/merchants');View::render('super_admin/merchants/index',['title'=>'Merchants','result'=>$result,'filters'=>$filters],'admin');}
    public function show(Request$request):void{Auth::requireSuperAdmin();$id=(int)$request->route('id');$repo=new AdminMerchantRepository;$merchant=$repo->find($id);if(!$merchant)Response::abort(404);View::render('super_admin/merchants/show',['title'=>'Merchant details','merchant'=>$merchant,'stores'=>$repo->stores($id),'audit'=>$repo->recentAudit($id)],'admin');}
    public function status(Request$request):void{$admin=Auth::requireSuperAdmin();$id=(int)$request->route('id');$status=strtoupper((string)$request->input('status'));try{(new SuperAdminActionService)->setMerchantStatus((int)$admin['id'],$id,$status);}catch(\DomainException$e){Session::flash('error',$e->getMessage());Response::redirect('/sa/merchants/'.$id,303);}Session::flash('success',$status==='SUSPENDED'?'Merchant access suspended.':'Merchant access reactivated.');Response::redirect('/sa/merchants/'.$id,303);}
}
