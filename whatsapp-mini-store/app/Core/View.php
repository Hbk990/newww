<?php
namespace App\Core;

final class View
{
    public static function render(string $view, array $data = [], string $layout = 'app'): void
    {
        $file = BASE_PATH . '/resources/views/' . $view . '.php';
        if (!is_file($file)) throw new \RuntimeException('View not found');
        extract($data, EXTR_SKIP);
        ob_start();
        require $file;
        $content = ob_get_clean();
        require BASE_PATH . '/resources/views/layouts/' . $layout . '.php';
    }
}
