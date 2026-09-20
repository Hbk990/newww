<?php
namespace App\Services;

use App\Core\Database;
use App\Repositories\SystemTaskRepository;
use App\Support\Http;

final class SystemStatusService
{
    public function status():array
    {
        $database=['ok'=>false,'message'=>'Unavailable'];$migrations=['count'=>0,'latest'=>null];try{Database::connection()->query('SELECT 1')->fetchColumn();$database=['ok'=>true,'message'=>'Connected'];$row=Database::connection()->query('SELECT COUNT(*) count,MAX(applied_at) latest FROM schema_migrations')->fetch();$migrations=['count'=>(int)($row['count']??0),'latest'=>$row['latest']??null];}catch(\Throwable$e){}
        $log=BASE_PATH.'/storage/logs/app.log';$errorLog=['exists'=>is_file($log),'bytes'=>is_file($log)?(int)filesize($log):0,'updated_at'=>is_file($log)?gmdate('Y-m-d H:i:s',(int)filemtime($log)):null];
        return['database'=>$database,'migrations'=>$migrations,'runtime'=>['php_version'=>PHP_VERSION,'environment'=>config('app')['env']],'https'=>$this->https(),'writable'=>['logs'=>is_writable(BASE_PATH.'/storage/logs'),'sessions'=>is_writable(BASE_PATH.'/storage/sessions'),'rate_limits'=>is_writable(BASE_PATH.'/storage/cache/rate-limits'),'uploads'=>is_writable(BASE_PATH.'/public/uploads')],'storage'=>$this->storageStats(),'error_log'=>$errorLog,'tasks'=>(new SystemTaskRepository)->all()];
    }
    private function https():bool{return Http::isHttps();}
    private function storageStats():array
    {
        $cache=BASE_PATH.'/storage/cache/system-storage.json';if(is_file($cache)&&filemtime($cache)>=time()-300){$decoded=json_decode((string)file_get_contents($cache),true);if(is_array($decoded))return$decoded;}
        $stats=['uploads'=>$this->directoryStats(BASE_PATH.'/public/uploads'),'logs'=>$this->directoryStats(BASE_PATH.'/storage/logs'),'sessions'=>$this->directoryStats(BASE_PATH.'/storage/sessions'),'cache'=>$this->directoryStats(BASE_PATH.'/storage/cache')];$handle=@fopen($cache,'c+');if($handle){try{if(flock($handle,LOCK_EX)){ftruncate($handle,0);rewind($handle);fwrite($handle,json_encode($stats));fflush($handle);}}finally{flock($handle,LOCK_UN);fclose($handle);}}return$stats;
    }
    private function directoryStats(string$path):array{$bytes=0;$files=0;if(!is_dir($path))return['bytes'=>0,'files'=>0];try{$iterator=new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($path,\FilesystemIterator::SKIP_DOTS));foreach($iterator as$file)if($file->isFile()){$bytes+=$file->getSize();$files++;}}catch(\Throwable$e){}return['bytes'=>$bytes,'files'=>$files];}
}
