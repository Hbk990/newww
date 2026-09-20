<?php
namespace App\Controllers;

use App\Core\{Auth,Request,Response,Session};
use App\Repositories\{AuditLogRepository,ProductRepository,StoreRepository};
use App\Services\TenantContext;

final class StorefrontAdminController
{
    public function publish(Request$request):void{$store=(new TenantContext)->store();if($store['status']==='SUSPENDED')Response::abort(403);if((new ProductRepository)->publicReadyCount((int)$store['id'])<1){Session::flash('error','Add at least one active, available product before publishing.');Response::redirect('/dashboard');}if(!(new StoreRepository)->setStatusForOwner((int)Auth::id(),(int)$store['id'],'ACTIVE'))Response::abort(403);(new AuditLogRepository)->record((int)Auth::id(),'store.published','store',(int)$store['id']);Session::flash('success','Your storefront is now public.');Response::redirect('/dashboard');}
    public function unpublish(Request$request):void{$store=(new TenantContext)->store();if(!(new StoreRepository)->setStatusForOwner((int)Auth::id(),(int)$store['id'],'DRAFT'))Response::abort(403);(new AuditLogRepository)->record((int)Auth::id(),'store.unpublished','store',(int)$store['id']);Session::flash('success','Your storefront is now private.');Response::redirect('/dashboard');}
}
