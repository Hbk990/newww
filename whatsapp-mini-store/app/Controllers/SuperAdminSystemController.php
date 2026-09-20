<?php
namespace App\Controllers;
use App\Core\{Auth,Request,Response,View};
use App\Repositories\AdminRepository;
use App\Services\SystemStatusService;
final class SuperAdminSystemController
{
    public function status(Request$request):void{Auth::requireSuperAdmin();View::render('super_admin/system',['title'=>'System status','status'=>(new SystemStatusService)->status()],'admin');}
    public function audit(Request$request):void{Auth::requireSuperAdmin();$filters=['q'=>mb_substr(trim((string)$request->query('q')),0,120),'event'=>mb_substr(trim((string)$request->query('event')),0,100),'page'=>max(1,(int)$request->query('page',1))];$repo=new AdminRepository;$result=$repo->audit($filters);if($filters['page']>$result['pages']&&$result['total']>0)Response::redirect('/sa/audit');View::render('super_admin/audit',['title'=>'Audit log','result'=>$result,'filters'=>$filters,'events'=>$repo->auditEvents()],'admin');}
}
