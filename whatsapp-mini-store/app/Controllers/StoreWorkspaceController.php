<?php
namespace App\Controllers;

use App\Core\{Auth,Request,Response,Session};
use App\Repositories\StoreRepository;

final class StoreWorkspaceController
{
    public function switch(Request$request):void{$user=Auth::requireMerchant();$storeId=(int)$request->route('id');$store=(new StoreRepository)->accessibleBy((int)$user['id'],$storeId);if(!$store)Response::abort(404);Session::put('active_store_id',$storeId);Session::flash('success','Switched to '.$store['name'].'.');Response::redirect('/dashboard',303);}
}
