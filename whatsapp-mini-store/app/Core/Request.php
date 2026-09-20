<?php
namespace App\Core;

use App\Support\{Http, Tenancy, Validation};

final class Request
{
    public function __construct(
        public readonly string $method,
        public readonly string $path,
        private array $input,
        private array $query,
        private array $server,
        private array $files = [],
        private array $routeParams = []
    ) {}

    public static function capture(): self
    {
        $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        $path = '/' . trim($path, '/');
        $slug = self::subdomainSlug((string) ($_SERVER['HTTP_HOST'] ?? ''));
        if ($slug !== null) {
            Tenancy::setSubdomainSlug($slug);
            $path = $path === '/' ? '/' . $slug : '/' . $slug . $path;
        }
        return new self(strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET'), $path, $_POST, $_GET, $_SERVER, $_FILES);
    }

    /** Returns the store slug implied by the Host header when it is a wildcard subdomain of the configured root domain, else null. */
    private static function subdomainSlug(string $hostHeader): ?string
    {
        $root = config('app')['root_domain'];
        if ($root === '') return null;
        $host = mb_strtolower((string) preg_replace('/:\d+$/', '', $hostHeader));
        if ($host === '' || $host === $root || $host === 'www.' . $root || !str_ends_with($host, '.' . $root)) return null;
        $slug = substr($host, 0, -(mb_strlen($root) + 1));
        if ($slug === '' || str_contains($slug, '.') || !Validation::slug($slug)) return null;
        return $slug;
    }

    public function input(string $key, mixed $default = null): mixed { return $this->input[$key] ?? $default; }
    public function all(): array { return $this->input; }
    public function query(string $key, mixed $default = null): mixed { return $this->query[$key] ?? $default; }
    public function file(string $key): ?array { return isset($this->files[$key]) && is_array($this->files[$key]) ? $this->files[$key] : null; }
    public function setRouteParams(array $params): void { $this->routeParams = $params; }
    public function route(string $key, mixed $default = null): mixed { return $this->routeParams[$key] ?? $default; }
    public function ip(): string { return Http::clientIp($this->server); }
    public function userAgent(): string { return mb_substr((string) ($this->server['HTTP_USER_AGENT'] ?? ''), 0, 500); }
}
