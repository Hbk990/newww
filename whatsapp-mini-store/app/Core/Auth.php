<?php
namespace App\Core;

use App\Repositories\UserRepository;

final class Auth
{
    private static ?array $user = null;

    public static function id(): ?int { $id = Session::get('user_id'); return is_int($id) ? $id : null; }
    public static function user(): ?array
    {
        if (self::$user) return self::$user;
        $id = self::id();
        if(!$id)return null;$user=(new UserRepository)->findById($id);if(!$user){self::clearSession();return null;}$authenticatedAt=(int)Session::get('_authenticated_at',0);$passwordVersion=(string)Session::get('_password_changed_at','');if($authenticatedAt<=0||$passwordVersion!==(string)($user['password_changed_at']??'')){self::clearSession();return null;}return self::$user=$user;
    }
    public static function login(array $user): void
    {
        Session::regenerate();
        Session::forget('_csrf');
        Session::put('user_id', (int) $user['id']);
        Session::put('_authenticated_at',time());
        Session::put('_password_changed_at',(string)($user['password_changed_at']??''));
        self::$user = $user;
    }
    public static function logout(): void { self::$user = null; Session::destroy(); }
    private static function clearSession():void{self::$user=null;Session::forget('user_id');Session::forget('_authenticated_at');Session::forget('_password_changed_at');Session::forget('active_store_id');Session::regenerate();}
    public static function requireMerchant(): array
    {
        $user = self::user();
        if (!$user) Response::redirect('/login');
        if ($user['platform_role'] !== 'MERCHANT' || $user['status'] !== 'ACTIVE') Response::abort(403);
        return $user;
    }
    public static function requireSuperAdmin(): array
    {
        $user = self::user();
        if (!$user) Response::redirect('/sa/login');
        if ($user['platform_role'] !== 'SUPER_ADMIN' || $user['status'] !== 'ACTIVE') Response::abort(403);
        return $user;
    }
}
