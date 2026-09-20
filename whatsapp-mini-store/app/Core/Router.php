<?php
namespace App\Core;

final class Router
{
    private array $routes = [];

    public function get(string $path, callable|array $handler): void { $this->add('GET', $path, $handler); }
    public function post(string $path, callable|array $handler): void { $this->add('POST', $path, $handler); }
    private function add(string $method, string $path, callable|array $handler): void
    {
        $this->routes[$method]['/' . trim($path, '/')] = $handler;
    }

    public function dispatch(Request $request): void
    {
        $handler = $this->routes[$request->method][$request->path] ?? null;
        if (!$handler) {
            foreach ($this->routes[$request->method] ?? [] as $route => $candidate) {
                if (!str_contains($route, '{')) continue;
                $pattern = preg_quote($route, '#');
                $pattern = preg_replace_callback('/\\\\\{([a-zA-Z_][a-zA-Z0-9_]*)\\\\\}/', static function (array $match): string {
                    $numeric = $match[1] === 'id' || str_ends_with(strtolower($match[1]), 'id');
                    return '(?P<' . $match[1] . '>' . ($numeric ? '[0-9]+' : '[a-zA-Z0-9_-]+') . ')';
                }, $pattern);
                if ($pattern && preg_match('#^' . $pattern . '$#', $request->path, $matches)) {
                    $request->setRouteParams(array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY));
                    $handler = $candidate;
                    break;
                }
            }
        }
        if (!$handler) Response::abort(404);
        if ($request->method === 'POST' && !Csrf::verify((string) $request->input('_token'))) Response::abort(419);
        is_array($handler) ? (new $handler[0])->{$handler[1]}($request) : $handler($request);
        Session::forget('_old');
    }
}
