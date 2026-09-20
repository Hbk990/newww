<?php
namespace App\Repositories;

use App\Core\Database;
use PDO;

final class UserRepository
{
    public function findById(int $id): ?array
    {
        $s = Database::connection()->prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1');
        $s->execute([$id]);
        return $s->fetch() ?: null;
    }

    public function findByEmail(string $email): ?array
    {
        $s = Database::connection()->prepare('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1');
        $s->execute([mb_strtolower(trim($email))]);
        return $s->fetch() ?: null;
    }

    public function createMerchant(string $name, string $email, string $passwordHash): int
    {
        $s = Database::connection()->prepare(
            'INSERT INTO users (name,email,password_hash,platform_role,status,created_at,updated_at) VALUES (?,?,?,\'MERCHANT\',\'ACTIVE\',UTC_TIMESTAMP(),UTC_TIMESTAMP())'
        );
        $s->execute([$name, mb_strtolower(trim($email)), $passwordHash]);
        return (int) Database::connection()->lastInsertId();
    }

    public function verifyEmail(int $id): void
    {
        $s = Database::connection()->prepare('UPDATE users SET email_verified_at=COALESCE(email_verified_at,UTC_TIMESTAMP()),updated_at=UTC_TIMESTAMP() WHERE id=?');
        $s->execute([$id]);
    }

    public function updatePassword(int $id, string $hash): void
    {
        $s = Database::connection()->prepare('UPDATE users SET password_hash=?,password_changed_at=UTC_TIMESTAMP(),updated_at=UTC_TIMESTAMP() WHERE id=?');
        $s->execute([$hash, $id]);
    }

    public function recordLogin(int $id): void
    {
        $s = Database::connection()->prepare('UPDATE users SET last_login_at=UTC_TIMESTAMP(),updated_at=UTC_TIMESTAMP() WHERE id=?');
        $s->execute([$id]);
    }
}
