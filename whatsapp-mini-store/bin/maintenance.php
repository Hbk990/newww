<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require dirname(__DIR__).'/bootstrap.php';

$lock=fopen(BASE_PATH.'/storage/cache/maintenance.lock','c+');if(!$lock||!flock($lock,LOCK_EX|LOCK_NB)){fwrite(STDERR,"Maintenance is already running.\n");exit(1);}
$tasks=new App\Repositories\SystemTaskRepository;$tasks->start('maintenance');
try{
    $pdo=App\Core\Database::connection();$retention=max(30,min(3650,App\Support\Env::int('ANALYTICS_RETENTION_DAYS',730)));$cutoff=gmdate('Y-m-d H:i:s',time()-$retention*86400);$analyticsDeleted=0;do{$analytics=$pdo->prepare('DELETE FROM analytics_events WHERE occurred_at<? ORDER BY id LIMIT 5000');$analytics->execute([$cutoff]);$batch=$analytics->rowCount();$analyticsDeleted+=$batch;}while($batch===5000);$pdo->beginTransaction();
    $expiredImports=$pdo->exec("UPDATE import_batches SET status='EXPIRED',payload_json='[]',updated_at=UTC_TIMESTAMP() WHERE status='PREVIEW' AND expires_at<UTC_TIMESTAMP()");
    $pdo->exec("DELETE FROM password_resets WHERE expires_at<UTC_TIMESTAMP()-INTERVAL 7 DAY OR consumed_at<UTC_TIMESTAMP()-INTERVAL 7 DAY");
    $pdo->exec("DELETE FROM email_verifications WHERE expires_at<UTC_TIMESTAMP()-INTERVAL 7 DAY OR consumed_at<UTC_TIMESTAMP()-INTERVAL 7 DAY");$pdo->commit();
    $removed=0;foreach([BASE_PATH.'/storage/cache/rate-limits'=>172800,BASE_PATH.'/storage/sessions'=>max(86400,config('security')['session_lifetime']*60+86400)]as$directory=>$age){foreach(glob($directory.'/*')?:[]as$file)if(is_file($file)&&filemtime($file)<time()-$age&&@unlink($file))$removed++;}
    $log=BASE_PATH.'/storage/logs/app.log';if(is_file($log)&&filesize($log)>10*1024*1024){$rotated=BASE_PATH.'/storage/logs/app-'.gmdate('Ymd-His').'.log';rename($log,$rotated);chmod($rotated,0640);}foreach(glob(BASE_PATH.'/storage/logs/app-*.log')?:[]as$file)if(is_file($file)&&filemtime($file)<time()-30*86400)@unlink($file);
    $details=['analytics_deleted'=>$analyticsDeleted,'imports_expired'=>(int)$expiredImports,'files_removed'=>$removed];$tasks->finish('maintenance',true,$details);echo json_encode($details,JSON_UNESCAPED_SLASHES).PHP_EOL;
}catch(Throwable$e){if(isset($pdo)&&$pdo->inTransaction())$pdo->rollBack();$tasks->finish('maintenance',false,['error_class'=>get_class($e)]);App\Support\Logger::error('Maintenance failed',$e);fwrite(STDERR,"Maintenance failed. Check the protected application log.\n");exit(1);}finally{flock($lock,LOCK_UN);fclose($lock);}
