<?php
namespace App\Services;

use App\Core\{Auth, Response,Session};
use App\Repositories\StoreRepository;

final class TenantContext
{
    public function store(array $allowedRoles = ['MERCHANT_OWNER']): array
    {
        $user = Auth::requireMerchant();
        if (!$user['email_verified_at']) Response::redirect('/email/pending');
        $repo=new StoreRepository;$selected=(int)Session::get('active_store_id',0);$store=$selected?$repo->accessibleBy((int)$user['id'],$selected):null;if(!$store)$store=$repo->firstAccessibleBy((int)$user['id']);
        if (!$store) Response::redirect('/onboarding');
        if (!in_array($store['member_role'], $allowedRoles, true)) Response::abort(403);
        Session::put('active_store_id',(int)$store['id']);$store['_accessible_stores']=$repo->accessibleStores((int)$user['id']);
        return $store;
    }
}
