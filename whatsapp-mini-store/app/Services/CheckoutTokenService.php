<?php
namespace App\Services;

use App\Core\Session;

final class CheckoutTokenService
{
    private const SESSION_KEY = '_checkout_tokens';
    private const TTL = 7200;

    public function issue(int $storeId): string
    {
        $tokens = $this->validTokens();
        $token = bin2hex(random_bytes(32));
        $tokens[hash('sha256', $token)] = ['store_id' => $storeId, 'created_at' => time()];
        Session::put(self::SESSION_KEY, array_slice($tokens, -20, null, true));
        return $token;
    }

    public function validForStore(string $token, int $storeId): bool
    {
        if (!preg_match('/^[a-f0-9]{64}$/', $token)) return false;
        $tokens = $this->validTokens();
        Session::put(self::SESSION_KEY, $tokens);
        $entry = $tokens[hash('sha256', $token)] ?? null;
        return is_array($entry) && (int) ($entry['store_id'] ?? 0) === $storeId;
    }

    private function validTokens(): array
    {
        $now = time();
        return array_filter((array) Session::get(self::SESSION_KEY, []), static fn($entry): bool => is_array($entry) && (int) ($entry['created_at'] ?? 0) >= $now - self::TTL);
    }
}
