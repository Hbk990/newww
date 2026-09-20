<?php
namespace App\Support;

final class Validation
{
    public static function password(string $password): ?string
    {
        if (mb_strlen($password) < config('security')['password_min_length']) return 'Use at least 12 characters.';
        if (!preg_match('/[a-z]/', $password) || !preg_match('/[A-Z]/', $password) || !preg_match('/\d/', $password)) return 'Include uppercase, lowercase, and a number.';
        return null;
    }

    public static function slug(string $value): bool { return (bool) preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $value); }
    public static function phone(string $value): bool { return (bool) preg_match('/^\+[1-9]\d{7,14}$/', $value); }
}
