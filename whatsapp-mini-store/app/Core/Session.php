<?php
namespace App\Core;

final class Session
{
    public static function start(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) return;
        $security = config('security');
        session_name($security['session_name']);
        session_save_path(BASE_PATH . '/storage/sessions');
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'secure' => $security['session_secure'],
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.cookie_httponly', '1');
        ini_set('session.cookie_samesite','Lax');
        ini_set('session.sid_length','48');
        ini_set('session.sid_bits_per_character','6');
        session_start();
        self::enforceIdleTimeout($security['session_lifetime'] * 60);
    }

    private static function enforceIdleTimeout(int $seconds): void
    {
        $last = (int) ($_SESSION['_last_activity'] ?? time());
        if (time() - $last > $seconds) {
            $_SESSION = [];
            session_regenerate_id(true);
        }
        $_SESSION['_last_activity'] = time();
    }

    public static function get(string $key, mixed $default = null): mixed { return $_SESSION[$key] ?? $default; }
    public static function put(string $key, mixed $value): void { $_SESSION[$key] = $value; }
    public static function forget(string $key): void { unset($_SESSION[$key]); }
    public static function flash(string $key, mixed $value): void { $_SESSION['_flash'][$key] = $value; }
    public static function pullFlash(string $key, mixed $default = null): mixed
    {
        $value = $_SESSION['_flash'][$key] ?? $default;
        unset($_SESSION['_flash'][$key]);
        return $value;
    }
    public static function regenerate(): void { session_regenerate_id(true); }
    public static function destroy(): void
    {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'] ?? '', $p['secure'], $p['httponly']);
        }
        session_destroy();
    }
}
