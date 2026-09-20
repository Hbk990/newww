<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require dirname(__DIR__).'/bootstrap.php';
[$script,$task,$status,$detail]=array_pad($argv,4,null);$allowed=['backup_database','backup_uploads'];if(!in_array($task,$allowed,true)||!in_array($status,['success','failed'],true)){fwrite(STDERR,"Usage: php bin/record-system-task.php <backup_database|backup_uploads> <success|failed> [short-detail]\n");exit(1);}$detail=mb_substr(trim((string)$detail),0,200);(new App\Repositories\SystemTaskRepository)->finish($task,$status==='success',$detail===''?[]:['summary'=>$detail]);echo "Task heartbeat recorded.\n";
