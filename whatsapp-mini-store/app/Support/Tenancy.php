<?php
namespace App\Support;

/**
 * Per-request holder for the store slug detected from a wildcard subdomain (storename.example.com),
 * set once by Request::capture(). Views and controllers use this to decide whether an internal
 * link needs the /{slug} path prefix (path-based mode) or not (subdomain mode) without needing the
 * raw Request threaded everywhere — the same pattern this codebase already uses for Session/Auth/Csrf.
 */
final class Tenancy
{
    private static ?string $subdomainSlug = null;

    public static function setSubdomainSlug(?string $slug): void { self::$subdomainSlug = $slug; }
    public static function subdomainSlug(): ?string { return self::$subdomainSlug; }
    public static function isSubdomain(): bool { return self::$subdomainSlug !== null; }
}
