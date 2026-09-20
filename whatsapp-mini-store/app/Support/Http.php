<?php
namespace App\Support;

final class Http
{
    public static function clientIp(?array $server = null): string
    {
        $server ??= $_SERVER;
        $remote = self::validIp((string)($server['REMOTE_ADDR'] ?? ''));
        if (!$remote) return 'unknown';
        if (!self::trusted($remote)) return $remote;
        $forwarded = array_map('trim', explode(',', (string)($server['HTTP_X_FORWARDED_FOR'] ?? '')));
        $chain = array_values(array_filter(array_map([self::class,'validIp'], $forwarded)));
        $chain[] = $remote;
        for ($i=count($chain)-1;$i>=0;$i--) if (!self::trusted($chain[$i])) return $chain[$i];
        return $remote;
    }

    public static function isHttps(?array $server = null): bool
    {
        $server ??= $_SERVER;
        if (!empty($server['HTTPS']) && strtolower((string)$server['HTTPS']) !== 'off') return true;
        $remote = self::validIp((string)($server['REMOTE_ADDR'] ?? ''));
        if (!$remote || !self::trusted($remote)) return false;
        $values = array_map('trim', explode(',', strtolower((string)($server['HTTP_X_FORWARDED_PROTO'] ?? ''))));
        return ($values[count($values)-1] ?? '') === 'https';
    }

    private static function trusted(string $ip): bool
    {
        $configured = array_filter(array_map('trim', explode(',', Env::get('TRUSTED_PROXY_IPS',''))));
        return in_array($ip, $configured, true);
    }

    private static function validIp(string $ip): ?string
    {
        $ip = trim($ip);
        return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : null;
    }
}
