<?php
namespace App\Controllers;

use App\Core\{Request,Response,Session,View};
use App\Repositories\{OrderRepository,StorefrontRepository};
use App\Services\{CheckoutTokenService,OrderService,RateLimiter,WhatsAppService};
use App\Support\Validation;

final class CheckoutController
{
    public function form(Request $request): void
    {
        $store = $this->activeStore((string)$request->route('storeSlug'),'/checkout');
        View::render('storefront/checkout',['title'=>'Checkout','store'=>$store,'checkoutToken'=>(new CheckoutTokenService)->issue((int)$store['id']),'meta'=>['robots'=>'noindex,nofollow','canonical'=>config('app')['url'].'/'.$store['slug'].'/checkout']],'storefront');
    }

    public function create(Request $request): void
    {
        $store = $this->activeStore((string)$request->route('storeSlug')); $slug=$store['slug'];
        if ((new RateLimiter)->tooMany('checkout',(int)$store['id'].'|'.$request->ip(),10,3600)) { Session::flash('error','Too many checkout attempts. Please wait and try again.'); Response::redirect("/{$slug}/checkout",303); }
        $token=(string)$request->input('idempotency_token');
        if (!(new CheckoutTokenService)->validForStore($token,(int)$store['id'])) Response::abort(419);
        $customer=['name'=>trim((string)$request->input('name')),'phone'=>trim((string)$request->input('phone')),'address'=>trim((string)$request->input('delivery_address')),'notes'=>trim((string)$request->input('notes'))];
        $errors=[];if(mb_strlen($customer['name'])<2||mb_strlen($customer['name'])>120)$errors[]='Name must be 2–120 characters.';if(!Validation::phone($customer['phone']))$errors[]='Enter a phone number in international format, such as +96171123456.';if(mb_strlen($customer['address'])<5||mb_strlen($customer['address'])>2000)$errors[]='Delivery address must be 5–2000 characters.';if(mb_strlen($customer['notes'])>1000)$errors[]='Notes cannot exceed 1000 characters.';
        $raw=(string)$request->input('cart');if(strlen($raw)>20000)$errors[]='The cart is too large.';$lines=json_decode($raw,true);if(!is_array($lines))$errors[]='Your cart could not be read. Return to the cart and try again.';
        if($errors)$this->fail($slug,implode(' ',$errors),$request);
        try{$order=(new OrderService)->create($store,$customer,$lines,$token);}catch(\DomainException$e){$this->fail($slug,$e->getMessage(),$request);}
        Response::redirect('/'.$slug.'/order/'.$order['reference'].'/continue?token='.rawurlencode($token),303);
    }

    public function continue(Request $request): void
    {
        $reference=(string)$request->route('reference');$token=(string)$request->query('token');$store=$this->activeStore((string)$request->route('storeSlug'),'/order/'.$reference.'/continue?token='.rawurlencode($token));
        if(!(new CheckoutTokenService)->validForStore($token,(int)$store['id']))Response::abort(404);
        $repo=new OrderRepository;$order=$repo->publicOrder((int)$store['id'],(string)$request->route('reference'),hash('sha256',$token));if(!$order)Response::abort(404);
        $repo->markWhatsAppOpened((int)$store['id'],(int)$order['id']);$url=(new WhatsAppService)->orderUrl($store,$order);
        View::render('storefront/whatsapp_continue',['title'=>'Order saved','store'=>$store,'order'=>$order,'whatsappUrl'=>$url,'reorderToken'=>$token,'meta'=>['robots'=>'noindex,nofollow']],'storefront');
    }

    public function reorder(Request$request):void
    {
        $reference=(string)$request->route('reference');$token=(string)$request->query('token');if(!preg_match('/^[a-f0-9]{64}$/',$token))Response::abort(404);$store=$this->activeStore((string)$request->route('storeSlug'));
        $repo=new OrderRepository;$order=$repo->publicOrder((int)$store['id'],$reference,hash('sha256',$token));if(!$order)Response::abort(404);$reorder=$repo->reorder((int)$store['id'],(int)$order['id'],$store['slug']);
        View::render('storefront/reorder',['title'=>'Reorder '.$reference,'store'=>$store,'order'=>$order,'reorder'=>$reorder,'meta'=>['robots'=>'noindex,nofollow']],'storefront');
    }

    private function activeStore(string$slug,string$redirectSuffix=''):array{$repo=new StorefrontRepository;$store=$repo->storeBySlug($slug);if(!$store){$target=$repo->redirectTarget($slug);if($target&&$redirectSuffix!=='')Response::redirect('/'.$target.$redirectSuffix,301);Response::abort(404);}if($store['status']!=='ACTIVE')Response::abort(404);return$store;}
    private function fail(string$slug,string$message,Request$request):never{Session::put('_old',array_diff_key($request->all(),['_token'=>true,'cart'=>true,'idempotency_token'=>true]));Session::flash('error',$message);Response::redirect("/{$slug}/checkout",303);}
}
