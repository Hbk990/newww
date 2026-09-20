<?php
namespace App\Services;

use App\Repositories\AnalyticsRepository;
use App\Support\Env;

final class AnalyticsEventService
{
    public const TYPES=['store_view','product_view','search','add_to_cart','checkout_started','order_created','whatsapp_opened'];

    public function record(int $storeId,string $type,?int $productId=null,?string $search=null,array $metadata=[]):void
    {
        if(!in_array($type,self::TYPES,true))throw new \DomainException('Unsupported analytics event.');
        $search=$search===null?null:mb_substr(trim(preg_replace('/\s+/u',' ',$search)??''),0,100);
        if($search==='')$search=null;
        (new AnalyticsRepository)->record($storeId,$type,$this->sessionHash(),$productId,$search,$metadata);
    }

    public function sessionHash():string
    {
        $key=Env::get('APP_KEY','testing-key-not-for-production');
        return hash_hmac('sha256',session_id(),$key);
    }

    public function isLikelyBot(string $agent):bool{return $agent===''||(bool)preg_match('/bot|crawler|spider|slurp|preview|facebookexternalhit|whatsapp/i',$agent);}
}
