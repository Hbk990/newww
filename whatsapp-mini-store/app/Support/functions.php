<?php
function e(mixed $value): string { return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function config(string $file): array { static $cache = []; return $cache[$file] ??= require BASE_PATH . '/config/' . $file . '.php'; }
function old(string $key, string $default = ''): string { return (string) (App\Core\Session::get('_old')[$key] ?? $default); }
function csrf_field(): string { return '<input type="hidden" name="_token" value="' . e(App\Core\Csrf::token()) . '">'; }
