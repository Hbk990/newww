<?php
declare(strict_types=1);

define('BASE_PATH', __DIR__);
require BASE_PATH . '/app/Support/functions.php';

spl_autoload_register(static function (string $class): void {
    $prefix = 'App\\';
    if (!str_starts_with($class, $prefix)) return;
    $file = BASE_PATH . '/app/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
    if (is_file($file)) require $file;
});

App\Support\Env::load(BASE_PATH . '/.env');
date_default_timezone_set(App\Support\Env::get('APP_TIMEZONE', 'UTC'));

$debug = App\Support\Env::bool('APP_DEBUG', false);
ini_set('display_errors', $debug ? '1' : '0');
ini_set('log_errors', '0');
error_reporting(E_ALL);

App\Support\SecurityHeaders::send();

set_exception_handler(static function (Throwable $e) use ($debug): void {
    App\Support\Logger::error('Unhandled exception', $e);
    while (ob_get_level() > 0) ob_end_clean();
    http_response_code(500);
    if ($debug) {
        echo '<pre>' . htmlspecialchars((string) $e, ENT_QUOTES, 'UTF-8') . '</pre>';
        return;
    }
    $view = BASE_PATH . '/resources/views/errors/500.php';
    is_file($view) ? require $view : print 'Server error';
});

register_shutdown_function(static function () use ($debug): void {
    $error=error_get_last();
    if(!$error||!in_array($error['type'],[E_ERROR,E_PARSE,E_CORE_ERROR,E_COMPILE_ERROR],true))return;
    App\Support\Logger::fatal('Fatal PHP error',$error);
    if(headers_sent()||$debug)return;
    while(ob_get_level()>0)ob_end_clean();
    http_response_code(500);$view=BASE_PATH.'/resources/views/errors/500.php';is_file($view)?require$view:print'Server error';
});

if (App\Support\Env::get('APP_ENV', 'production') === 'production') {
    $appKey=App\Support\Env::get('APP_KEY');if(strlen($appKey)<32||in_array($appKey,['replace-with-a-random-64-character-secret','testing-key-not-for-production'],true))throw new RuntimeException('APP_KEY must contain at least 32 random characters in production.');
    if($debug)throw new RuntimeException('APP_DEBUG must be false in production.');
    if(!App\Support\Env::bool('SESSION_SECURE',true))throw new RuntimeException('SESSION_SECURE must be true in production.');
    $appUrl=App\Support\Env::get('APP_URL');$appHost=mb_strtolower((string)parse_url($appUrl,PHP_URL_HOST));if(!filter_var($appUrl,FILTER_VALIDATE_URL)||parse_url($appUrl,PHP_URL_SCHEME)!=='https'||in_array($appHost,['example.com','www.example.com'],true))throw new RuntimeException('APP_URL must be a valid HTTPS URL in production.');
    if(!in_array(App\Support\Env::get('MAIL_DRIVER','log'),['mail','smtp'],true))throw new RuntimeException('MAIL_DRIVER must be mail or smtp in production.');
    if(!filter_var(App\Support\Env::get('MAIL_FROM'),FILTER_VALIDATE_EMAIL))throw new RuntimeException('MAIL_FROM must be a valid address in production.');
    foreach(['DB_DATABASE','DB_USERNAME','DB_PASSWORD']as$key)if(App\Support\Env::get($key)===''||($key==='DB_PASSWORD'&&App\Support\Env::get($key)==='change-me'))throw new RuntimeException($key.' must be configured in production.');
}

App\Core\Session::start();
