<?php
function e(mixed $value): string { return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function config(string $file): array { static $cache = []; return $cache[$file] ??= require BASE_PATH . '/config/' . $file . '.php'; }
function old(string $key, string $default = ''): string { return (string) (App\Core\Session::get('_old')[$key] ?? $default); }
function csrf_field(): string { return '<input type="hidden" name="_token" value="' . e(App\Core\Csrf::token()) . '">'; }

/** The root-relative URL prefix for links within a store's storefront: empty on that store's own subdomain (so ${prefix}/x never double-slashes), or /{slug} in path-based mode. Exposed to client-side JS via data-store-base for the same reason. */
function store_url_prefix(array $store): string
{
    if (App\Support\Tenancy::isSubdomain() && App\Support\Tenancy::subdomainSlug() === $store['slug']) return '';
    return '/' . $store['slug'];
}

/** A root-relative link to somewhere within a store's storefront, correct whether the current request arrived via a path (/{slug}/...) or a wildcard subdomain (slug.root/...). */
function store_url(array $store, string $path = ''): string
{
    $path = ltrim($path, '/');
    $prefix = store_url_prefix($store);
    if ($path === '') return $prefix === '' ? '/' : $prefix;
    return $prefix . '/' . $path;
}

/** The fully-qualified, canonical public URL for somewhere in a store's storefront — always the subdomain form once APP_ROOT_DOMAIN is configured, regardless of how the current request arrived. For meta tags, sitemaps, share links, and QR codes. */
function store_absolute_url(array $store, string $path = ''): string
{
    $path = ltrim($path, '/');
    $root = config('app')['root_domain'];
    if ($root !== '') {
        $scheme = parse_url(config('app')['url'], PHP_URL_SCHEME) ?: 'https';
        $base = $scheme . '://' . $store['slug'] . '.' . $root;
    } else {
        $base = config('app')['url'] . '/' . $store['slug'];
    }
    return $path === '' ? $base : $base . '/' . $path;
}
