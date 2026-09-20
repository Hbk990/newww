<?php
namespace App\Controllers;

use App\Core\{Auth, Request, View};
use App\Repositories\{OrderRepository,ProductRepository};
use App\Services\TenantContext;

final class MerchantController
{
    public function dashboard(Request $request): void
    {
        $user = Auth::requireMerchant();
        $store = (new TenantContext)->store();
        $products=new ProductRepository;$metrics=$products->metrics((int)$store['id']);$metrics['public_ready_products']=$products->publicReadyCount((int)$store['id']);$orders=new OrderRepository;$metrics=array_merge($metrics,$orders->metrics((int)$store['id']));
        View::render('merchant/dashboard', ['title' => 'Dashboard', 'user' => $user, 'store' => $store, 'metrics'=>$metrics,'recentOrders'=>$orders->recent((int)$store['id'])], 'merchant');
    }
}
