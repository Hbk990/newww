<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require dirname(__DIR__).'/bootstrap.php';
$tasks=new App\Repositories\SystemTaskRepository;$tasks->start('subscription_lifecycle');
try{$result=(new App\Services\SubscriptionService)->processLifecycle();$success=$result['errors']===0;$tasks->finish('subscription_lifecycle',$success,$result);echo "Subscription lifecycle: {$result['changed']} changed, {$result['errors']} errors.\n";exit($success?0:1);}catch(Throwable$e){$tasks->finish('subscription_lifecycle',false,['error_class'=>get_class($e)]);throw$e;}
