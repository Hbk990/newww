<?php
namespace App\Services;

use App\Repositories\TokenRepository;

final class TokenService
{
    public function issue(string $type, int $userId, int $minutes): string
    {
        $token = bin2hex(random_bytes(32));
        (new TokenRepository)->create($type, $userId, hash('sha256', $token), $minutes);
        return $token;
    }
    public function consume(string $type, string $token): ?int
    {
        if (!preg_match('/^[a-f0-9]{64}$/', $token)) return null;
        return (new TokenRepository)->consume($type, hash('sha256', $token));
    }
    public function owner(string$type,string$token):?int{if(!preg_match('/^[a-f0-9]{64}$/',$token))return null;return(new TokenRepository)->owner($type,hash('sha256',$token));}
}
