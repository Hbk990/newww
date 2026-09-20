<?php
namespace App\Controllers;

use App\Core\{Auth,Request,Response,View};
use App\Repositories\{AnalyticsRepository,StorefrontRepository};
use App\Services\{AnalyticsEventService,PlanAccessService,RateLimiter,TenantContext};

final class AnalyticsController
{
    public function index(Request$request):void
    {
        $store=(new TenantContext)->store();$advanced=(new PlanAccessService)->feature((int)$store['id'],'advanced_analytics');$days=(int)$request->query('days',30);if(!$advanced||!in_array($days,[7,30,90],true))$days=30;
        View::render('merchant/analytics',['title'=>'Analytics','store'=>$store,'analytics'=>(new AnalyticsRepository)->dashboard((int)$store['id'],$days),'advanced'=>$advanced],'merchant');
    }

    public function record(Request$request):void
    {
        if(Auth::id()){http_response_code(204);return;}$repo=new StorefrontRepository;$store=$repo->storeBySlug((string)$request->route('storeSlug'));if(!$store||$store['status']!=='ACTIVE')Response::abort(404);
        $service=new AnalyticsEventService;if($service->isLikelyBot((string)($_SERVER['HTTP_USER_AGENT']??''))){http_response_code(204);return;}
        if((new RateLimiter)->tooMany('analytics',(int)$store['id'].'|'.$service->sessionHash(),120,3600)){http_response_code(204);return;}
        $type=(string)$request->input('event');$productId=$request->input('product_id');$productId=$productId!==null&&$productId!==''?(int)$productId:null;
        if(!in_array($type,['store_view','product_view','search','add_to_cart','checkout_started'],true))Response::abort(400);
        if($productId&&(!$repo->publicProductId((int)$store['id'],$productId)))Response::abort(400);
        $service->record((int)$store['id'],$type,$productId,(string)$request->input('search'));
        http_response_code(204);
    }
}
