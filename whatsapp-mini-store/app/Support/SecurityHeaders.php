<?php
namespace App\Support;

final class SecurityHeaders
{
    private static ?string $nonce = null;

    public static function send(): void
    {
        if (headers_sent()) return;
        $nonce = self::nonce();
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: DENY');
        header('Referrer-Policy: strict-origin-when-cross-origin');
        header('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()');
        header("Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'nonce-{$nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; manifest-src 'self'");
        header('Cross-Origin-Opener-Policy: same-origin');
        header('X-Permitted-Cross-Domain-Policies: none');
        header('X-Request-ID: '.self::requestId());
        if (config('app')['env']==='production' && Http::isHttps()) header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
    }

    public static function nonce(): string { return self::$nonce ??= base64_encode(random_bytes(18)); }
    public static function requestId(): string { static $id; return $id ??= bin2hex(random_bytes(12)); }
}
