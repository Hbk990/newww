<?php
namespace App\Support;

final class Slug
{
    public static function make(string $value): string
    {
        $value = trim(mb_strtolower($value));
        $ascii = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value);
        $value = $ascii === false ? $value : $ascii;
        $value = preg_replace('/[^a-z0-9]+/', '-', $value) ?? '';
        return trim(mb_substr($value, 0, 80), '-');
    }
}
