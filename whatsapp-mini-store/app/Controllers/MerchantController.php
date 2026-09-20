<?php
namespace App\Controllers;

use App\Core\{Auth, Request, Response, Session, View};
use App\Repositories\{OrderRepository,ProductRepository,StoreRepository};
use App\Services\TenantContext;

final class MerchantController
{
    public function dashboard(Request $request): void
    {
        $user = Auth::requireMerchant();
        $store = (new TenantContext)->store();
        $products=new ProductRepository;$metrics=$products->metrics((int)$store['id']);$metrics['public_ready_products']=$products->publicReadyCount((int)$store['id']);$orders=new OrderRepository;$metrics=array_merge($metrics,$orders->metrics((int)$store['id']));
        $lowStock=$products->lowStock((int)$store['id'],(int)$store['low_stock_threshold']);
        View::render('merchant/dashboard', ['title' => 'Dashboard', 'user' => $user, 'store' => $store, 'metrics'=>$metrics,'recentOrders'=>$orders->recent((int)$store['id']),'lowStock'=>$lowStock], 'merchant');
    }

    public function updateLowStockThreshold(Request $request): void
    {
        $store = (new TenantContext)->store();
        $raw = trim((string) $request->input('low_stock_threshold'));
        if (!ctype_digit($raw) || (int) $raw > 100000) { Session::flash('error', 'Low stock threshold must be a whole number.'); Response::redirect('/dashboard'); }
        (new StoreRepository)->updateLowStockThreshold((int) $store['id'], (int) $raw);
        Session::flash('success', 'Low stock threshold updated.');
        Response::redirect('/dashboard');
    }
}
