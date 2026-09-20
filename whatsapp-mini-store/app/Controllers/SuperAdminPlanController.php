<?php
namespace App\Controllers;
use App\Core\{Auth,Request,Response,Session,View};
use App\Repositories\AdminPlanRepository;
use App\Services\SuperAdminActionService;
final class SuperAdminPlanController
{
    public function index(Request$request):void{Auth::requireSuperAdmin();View::render('super_admin/plans/index',['title'=>'Plans','plans'=>(new AdminPlanRepository)->all(),'definitions'=>config('plans')],'admin');}
    public function edit(Request$request):void{Auth::requireSuperAdmin();$plan=(new AdminPlanRepository)->find((int)$request->route('id'));if(!$plan)Response::abort(404);View::render('super_admin/plans/edit',['title'=>'Edit plan','plan'=>$plan,'definitions'=>config('plans')],'admin');}
    public function update(Request$request):void{$admin=Auth::requireSuperAdmin();$id=(int)$request->route('id');try{(new SuperAdminActionService)->updatePlan((int)$admin['id'],$id,$request->all());}catch(\DomainException$e){Session::put('_old',$request->all());Session::flash('error',$e->getMessage());Response::redirect('/sa/plans/'.$id,303);}Session::flash('success','Plan configuration updated. Enforcement uses the new server-side values immediately.');Response::redirect('/sa/plans/'.$id,303);}
}
