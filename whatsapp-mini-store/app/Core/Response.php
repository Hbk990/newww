<?php
namespace App\Core;

final class Response
{
    public static function redirect(string $path, int $status = 302): never
    {
        if (!self::isSafeRedirectTarget($path)) $path = '/';
        header('Location: ' . $path, true, $status);
        exit;
    }

    /**
     * A root-relative path is always safe. An absolute URL is only safe when it targets a host
     * this application itself controls — the configured APP_URL host, or the configured wildcard
     * root domain (or one of its subdomains) — never an attacker-supplied external host. This is
     * what lets a store's old-slug redirect point at a different subdomain (slug.root) while still
     * closing off open-redirect vectors for every other call site.
     */
    private static function isSafeRedirectTarget(string $path): bool
    {
        if (str_starts_with($path, '/') && !str_starts_with($path, '//') && !str_starts_with($path, '/\\')) return true;
        $host = mb_strtolower((string) parse_url($path, PHP_URL_HOST));
        if ($host === '') return false;
        if ($host === mb_strtolower((string) parse_url(config('app')['url'], PHP_URL_HOST))) return true;
        $root = config('app')['root_domain'];
        return $root !== '' && ($host === $root || str_ends_with($host, '.' . $root));
    }

    public static function abort(int $status): never
    {
        http_response_code($status);
        $file = BASE_PATH . "/resources/views/errors/{$status}.php";
        is_file($file) ? require $file : print 'Request failed';
        exit;
    }
}
