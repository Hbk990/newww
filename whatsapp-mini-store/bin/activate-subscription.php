<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require dirname(__DIR__).'/bootstrap.php';
[$script,$slug,$planCode,$days,$reference]=array_pad($argv,5,null);if(!$slug||!$planCode){fwrite(STDERR,"Usage: php bin/activate-subscription.php <store-slug> <plan-code> [period-days] [provider-reference]\n");exit(1);}$s=App\Core\Database::connection()->prepare('SELECT id FROM stores WHERE slug=?');$s->execute([$slug]);$storeId=(int)$s->fetchColumn();if(!$storeId){fwrite(STDERR,"Store not found.\n");exit(1);}try{(new App\Services\SubscriptionService)->activate($storeId,$planCode,(int)($days?:config('billing')['manual_period_days']),$reference);echo "Subscription activated.\n";}catch(Throwable$e){fwrite(STDERR,$e->getMessage()."\n");exit(1);}
