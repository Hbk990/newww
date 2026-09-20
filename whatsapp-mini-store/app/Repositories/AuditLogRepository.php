<?php
namespace App\Repositories;

use App\Core\Database;
use App\Support\Http;

final class AuditLogRepository
{
    public function record(?int $actorId, string $event, ?string $targetType = null, ?int $targetId = null, array $metadata = []): void
    {
        $s = Database::connection()->prepare('INSERT INTO audit_logs (actor_user_id,event,target_type,target_id,ip_address,user_agent,metadata,created_at) VALUES (?,?,?,?,?,?,?,UTC_TIMESTAMP())');
        $ip=Http::clientIp();$s->execute([$actorId, $event, $targetType, $targetId, $ip==='unknown'?null:$ip, mb_substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 500), json_encode($metadata, JSON_UNESCAPED_SLASHES)]);
    }
}
