<?php
namespace App\Controllers;

use App\Core\{Auth, Request, View};
use App\Repositories\AdminRepository;
use App\Services\SystemStatusService;

final class SuperAdminController
{
    public function dashboard(Request $request): void
    {
        $user = Auth::requireSuperAdmin();
        $repo = new AdminRepository;
        View::render('super_admin/dashboard',['title'=>'Platform overview','user'=>$user,'metrics'=>$repo->metrics(),'mrr'=>$repo->mrrByCurrency(),'orderValue'=>$repo->orderValueByCurrency(),'recent'=>$repo->recentRegistrations(),'orders'=>$repo->recentOrders(),'system'=>(new SystemStatusService)->status()],'admin');
    }
}
