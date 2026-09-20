<?php
namespace App\Controllers;

use App\Core\{Request,View};
use App\Services\TenantContext;

final class ComingSoonController
{
    public function show(Request $request):void{$store=(new TenantContext)->store();$section=(string)$request->route('section');$allowed=['settings'];if(!in_array($section,$allowed,true))\App\Core\Response::abort(404);View::render('merchant/coming',['title'=>ucfirst($section),'store'=>$store,'section'=>$section],'merchant');}
}
