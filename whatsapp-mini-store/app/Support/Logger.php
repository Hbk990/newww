<?php
namespace App\Support;

use Throwable;

final class Logger
{
    public static function error(string $message, ?Throwable $exception = null): void
    {
        $context=$exception?' '.get_class($exception).': '.$exception->getMessage():'';
        self::write($message.$context);
    }

    public static function fatal(string$message,array$error):void{self::write($message.' type='.(int)($error['type']??0).' file='.basename((string)($error['file']??'unknown')).' line='.(int)($error['line']??0));}

    private static function write(string$message):void
    {
        $clean=preg_replace('/[\x00-\x1F\x7F]+/u',' ',mb_substr($message,0,3000))??'Log message unavailable';
        $line=sprintf("[%s] request=%s %s\n",gmdate('c'),SecurityHeaders::requestId(),$clean);$path=BASE_PATH.'/storage/logs/app.log';error_log($line,3,$path);if(is_file($path))@chmod($path,0640);
    }
}
