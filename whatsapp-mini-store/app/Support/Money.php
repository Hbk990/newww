<?php
namespace App\Support;

final class Money
{
    public static function add(string $amount,string $adjustment):string
    {
        $minor=self::minor($amount)+self::minor($adjustment);$negative=$minor<0;$minor=abs($minor);
        return($negative?'-':'').intdiv($minor,100).'.'.str_pad((string)($minor%100),2,'0',STR_PAD_LEFT);
    }
    public static function minor(string $value):int{$negative=str_starts_with($value,'-');$value=ltrim($value,'-');[$whole,$decimal]=array_pad(explode('.',$value,2),2,'');$minor=((int)$whole*100)+(int)str_pad(substr($decimal,0,2),2,'0');return$negative?-$minor:$minor;}
    public static function fromMinor(int $minor):string{$negative=$minor<0;$minor=abs($minor);return($negative?'-':'').intdiv($minor,100).'.'.str_pad((string)($minor%100),2,'0',STR_PAD_LEFT);}
}
