<?php
namespace App\Repositories;

use App\Core\Database;

final class ImportBatchRepository
{
    public function create(int$storeId,int$userId,string$source,array$rows,array$report):string
    {
        $token=bin2hex(random_bytes(32));$s=Database::connection()->prepare("INSERT INTO import_batches (store_id,created_by_user_id,token_hash,kind,status,source_name,payload_json,report_json,expires_at,created_at,updated_at) VALUES (?,?,?,'PRODUCTS','PREVIEW',?,?,?,UTC_TIMESTAMP()+INTERVAL 2 HOUR,UTC_TIMESTAMP(),UTC_TIMESTAMP())");$s->execute([$storeId,$userId,hash('sha256',$token),mb_substr($source,0,255),json_encode($rows,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),json_encode($report,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)]);return$token;
    }
    public function preview(int$storeId,int$userId,string$token):?array
    {
        if(!preg_match('/^[a-f0-9]{64}$/',$token))return null;$s=Database::connection()->prepare("SELECT * FROM import_batches WHERE store_id=? AND created_by_user_id=? AND token_hash=? AND status='PREVIEW' AND expires_at>UTC_TIMESTAMP() LIMIT 1");$s->execute([$storeId,$userId,hash('sha256',$token)]);$batch=$s->fetch();if(!$batch)return null;$batch['rows']=json_decode($batch['payload_json'],true)?:[];$batch['report']=json_decode($batch['report_json'],true)?:[];return$batch;
    }
    public function commit(int$storeId,int$userId,string$token,callable$work):array
    {
        if(!preg_match('/^[a-f0-9]{64}$/',$token))throw new \DomainException('The import preview token is invalid.');$pdo=Database::connection();$pdo->beginTransaction();try{$s=$pdo->prepare("SELECT * FROM import_batches WHERE store_id=? AND created_by_user_id=? AND token_hash=? AND status='PREVIEW' AND expires_at>UTC_TIMESTAMP() FOR UPDATE");$s->execute([$storeId,$userId,hash('sha256',$token)]);$batch=$s->fetch();if(!$batch)throw new \DomainException('This import preview expired or was already committed.');$rows=json_decode($batch['payload_json'],true);if(!is_array($rows))throw new \DomainException('The import preview is invalid.');$result=$work($pdo,$rows);$u=$pdo->prepare("UPDATE import_batches SET status='COMMITTED',committed_at=UTC_TIMESTAMP(),updated_at=UTC_TIMESTAMP() WHERE id=? AND store_id=?");$u->execute([$batch['id'],$storeId]);$pdo->commit();return$result;}catch(\Throwable$e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}
    }
}
