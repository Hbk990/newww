<?php
namespace App\Repositories;

use App\Core\Database;

final class TokenRepository
{
    public function create(string $table, int $userId, string $tokenHash, int $minutes): void
    {
        $table = $this->allowed($table);
        $pdo = Database::connection();
        $pdo->prepare("DELETE FROM {$table} WHERE user_id=?")->execute([$userId]);
        $s = $pdo->prepare("INSERT INTO {$table} (user_id,token_hash,expires_at,created_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? MINUTE),UTC_TIMESTAMP())");
        $s->execute([$userId, $tokenHash, $minutes]);
    }

    public function consume(string $table, string $tokenHash): ?int
    {
        $table = $this->allowed($table);
        $pdo = Database::connection();
        $pdo->beginTransaction();
        try {
            $s = $pdo->prepare("SELECT id,user_id FROM {$table} WHERE token_hash=? AND consumed_at IS NULL AND expires_at>UTC_TIMESTAMP() FOR UPDATE");
            $s->execute([$tokenHash]);
            $row = $s->fetch();
            if (!$row) { $pdo->rollBack(); return null; }
            $pdo->prepare("UPDATE {$table} SET consumed_at=UTC_TIMESTAMP() WHERE id=?")->execute([$row['id']]);
            $pdo->commit();
            return (int) $row['user_id'];
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    }

    public function owner(string$table,string$tokenHash):?int{$table=$this->allowed($table);$s=Database::connection()->prepare("SELECT user_id FROM {$table} WHERE token_hash=? AND consumed_at IS NULL AND expires_at>UTC_TIMESTAMP() LIMIT 1");$s->execute([$tokenHash]);$id=$s->fetchColumn();return$id===false?null:(int)$id;}

    private function allowed(string $table): string
    {
        if (!in_array($table, ['password_resets', 'email_verifications'], true)) throw new \InvalidArgumentException('Invalid token table');
        return $table;
    }
}
