<?php
namespace App\Support;

final class Color
{
    public static function safeHex(?string$value,string$fallback='#2F5BFF'):string{return is_string($value)&&preg_match('/^#[0-9A-Fa-f]{6}$/',$value)?strtoupper($value):$fallback;}
    public static function contrastText(string$hex):string{$hex=ltrim(self::safeHex($hex),'#');$values=[];foreach([0,2,4]as$offset){$channel=hexdec(substr($hex,$offset,2))/255;$values[]=$channel<=.03928?$channel/12.92:(($channel+.055)/1.055)**2.4;}$luminance=.2126*$values[0]+.7152*$values[1]+.0722*$values[2];$white=1.05/($luminance+.05);$black=($luminance+.05)/.05;return$white>=$black?'#FFFFFF':'#111111';}
}
