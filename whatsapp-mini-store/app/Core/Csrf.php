<?php
namespace App\Core;

final class Csrf
{
    public static function token(): string
    {
        $token = Session::get('_csrf');
        if (!is_string($token)) {
            $token = bin2hex(random_bytes(32));
            Session::put('_csrf', $token);
        }
        return $token;
    }

    public static function verify(string $token): bool
    {
        $stored = Session::get('_csrf');
        return is_string($stored) && $token !== '' && hash_equals($stored, $token);
    }
}
