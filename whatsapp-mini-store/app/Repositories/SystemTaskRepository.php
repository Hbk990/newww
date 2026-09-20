<?php
namespace App\Repositories;
use App\Core\Database;
final class SystemTaskRepository
{
    public function all():array{$rows=Database::connection()->query('SELECT * FROM system_tasks ORDER BY id')->fetchAll();foreach($rows as&$row){$details=json_decode((string)($row['details']??''),true);$row['details']=is_array($details)?$details:[];}unset($row);return$rows;}
    public function start(string$key):void{$s=Database::connection()->prepare("UPDATE system_tasks SET last_started_at=UTC_TIMESTAMP(),last_status='RUNNING',updated_at=UTC_TIMESTAMP() WHERE task_key=?");$s->execute([$key]);}
    public function finish(string$key,bool$success,array$details=[]):void{$s=Database::connection()->prepare("UPDATE system_tasks SET last_completed_at=UTC_TIMESTAMP(),last_status=?,details=?,updated_at=UTC_TIMESTAMP() WHERE task_key=?");$s->execute([$success?'SUCCESS':'FAILED',json_encode($details,JSON_UNESCAPED_SLASHES),$key]);}
}
