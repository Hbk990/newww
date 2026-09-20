<?php
namespace App\Core;

final class Response
{
    public static function redirect(string $path, int $status = 302): never
    {
        if (!str_starts_with($path, '/')) $path = '/';
        header('Location: ' . $path, true, $status);
        exit;
    }

    public static function abort(int $status): never
    {
        http_response_code($status);
        $file = BASE_PATH . "/resources/views/errors/{$status}.php";
        is_file($file) ? require $file : print 'Request failed';
        exit;
    }
}
