<?php
namespace App\Services;

use App\Repositories\{ProductRepository,StoreRepository};

final class LowStockAlertService
{
    /**
     * Sends a low-stock digest email when the store currently has any tracked variant at or
     * below its threshold. Throttled to at most one email per store per day (regardless of how
     * many orders touch stock in that window) so a busy checkout period never turns into a spam
     * storm — this is a digest of everything currently low, not a per-item crossing event.
     * Never allowed to break order placement: any failure here is swallowed by the caller.
     */
    public function maybeNotify(int $storeId): void
    {
        $storeRepo = new StoreRepository;
        $store = $storeRepo->find($storeId);
        if (!$store) return;
        $threshold = (int) $store['low_stock_threshold'];
        $items = (new ProductRepository)->lowStock($storeId, $threshold);
        if (!$items) return;
        $to = $store['contact_email'] ?: $storeRepo->ownerEmail($storeId);
        if (!$to || !filter_var($to, FILTER_VALIDATE_EMAIL)) return;
        if ((new RateLimiter)->tooMany('low_stock_alert', (string) $storeId, 1, 86400)) return;
        $lines = array_map(static fn(array $item): string => '- ' . $item['product_name'] . ' (' . $item['label'] . '): ' . ((int) $item['stock_quantity'] === 0 ? 'out of stock' : $item['stock_quantity'] . ' left'), $items);
        $body = "The following items at {$store['name']} are at or below your low-stock threshold of {$threshold}:\n\n" . implode("\n", $lines) . "\n\nManage stock: " . config('app')['url'] . '/products';
        (new Mailer)->send($to, 'Low stock alert — ' . $store['name'], $body);
    }
}
