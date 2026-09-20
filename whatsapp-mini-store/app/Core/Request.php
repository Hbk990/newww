<?php
namespace App\Core;

use App\Support\Http;

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
        return new self(strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET'), '/' . trim($path, '/'), $_POST, $_GET, $_SERVER, $_FILES);
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
