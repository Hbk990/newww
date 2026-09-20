<?php
namespace App\Services;

final class RateLimiter
{
    public function tooMany(string $action, string $identity, int $max, int $window): bool
    {
        $file = BASE_PATH . '/storage/cache/rate-limits/' . hash('sha256', $action . '|' . $identity) . '.json';
        $handle = fopen($file, 'c+');
        if (!$handle) return true;
        try {
            if (!flock($handle, LOCK_EX)) return true;
            $raw = stream_get_contents($handle);
            $state = $raw ? json_decode($raw, true) : null;
            $now = time();
            if (!is_array($state) || ($state['reset_at'] ?? 0) <= $now) $state = ['count' => 0, 'reset_at' => $now + $window];
            $blocked = $state['count'] >= $max;
            if (!$blocked) $state['count']++;
            ftruncate($handle, 0); rewind($handle); fwrite($handle, json_encode($state)); fflush($handle);
            return $blocked;
        } finally { flock($handle, LOCK_UN); fclose($handle); }
    }

    public function clear(string $action, string $identity): void
    {
        $file = BASE_PATH . '/storage/cache/rate-limits/' . hash('sha256', $action . '|' . $identity) . '.json';
        if (is_file($file)) unlink($file);
    }
}
