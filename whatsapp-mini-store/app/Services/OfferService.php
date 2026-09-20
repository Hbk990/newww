<?php
namespace App\Services;

use App\Repositories\OfferRepository;
use App\Support\Money;
use PDO;

final class OfferService
{
    /**
     * Automatically matches the cart against every currently-active offer and returns
     * the combined discount. Offers never require a code — they apply on their own
     * whenever the cart qualifies. Never trusts anything from the client: everything
     * here is derived from locked/queried offer rows and the order's own server-computed
     * line items.
     *
     * When an offer could apply to more units than it needs (e.g. 5 shirts bought against
     * a "buy 2 get 1 free" offer), the cheapest qualifying units are always the ones
     * discounted — this protects merchant margin the same way a "buy 2 get 1" deal
     * would in a physical store.
     *
     * @param array<int,array{product_id:int,category_id:?int,unit_price:string,quantity:int}> $items
     * @return array{discount_amount:string,snapshot:?string,applied:array<int,array{offer_id:int,discount_amount:string}>}
     */
    public function resolve(PDO $pdo, int $storeId, array $items, string $subtotal): array
    {
        $offers = (new OfferRepository)->activeForStore($storeId);
        if (!$offers) return ['discount_amount' => '0.00', 'snapshot' => null, 'applied' => []];

        $pool = [];
        foreach ($items as $item) {
            for ($i = 0; $i < $item['quantity']; $i++) {
                $pool[] = ['product_id' => $item['product_id'], 'category_id' => $item['category_id'], 'unit_minor' => Money::minor($item['unit_price']), 'consumed' => false];
            }
        }

        usort($offers, static fn(array $a, array $b): int => self::priority($a['type']) <=> self::priority($b['type']));

        $totalDiscountMinor = 0; $applied = []; $labels = [];
        foreach ($offers as $offer) {
            $discountMinor = match ($offer['type']) {
                'FIXED_BUNDLE' => $this->applyFixedBundle($offer, $pool),
                'BUY_X_GET_Y' => $this->applyGroupDeal($offer, $pool, 'product_id', (int) $offer['scope_product_id']),
                'CATEGORY_BUY_N_GET_M' => $this->applyGroupDeal($offer, $pool, 'category_id', (int) $offer['scope_category_id']),
                default => 0,
            };
            if ($discountMinor > 0) {
                $totalDiscountMinor += $discountMinor;
                $applied[] = ['offer_id' => (int) $offer['id'], 'discount_amount' => Money::fromMinor($discountMinor)];
                $labels[] = $offer['name'] . ' (-' . Money::fromMinor($discountMinor) . ')';
            }
        }

        $totalDiscountMinor = max(0, min($totalDiscountMinor, Money::minor($subtotal)));
        return ['discount_amount' => Money::fromMinor($totalDiscountMinor), 'snapshot' => $labels ? implode('; ', $labels) : null, 'applied' => $applied];
    }

    private static function priority(string $type): int
    {
        return match ($type) { 'FIXED_BUNDLE' => 0, 'BUY_X_GET_Y' => 1, default => 2 };
    }

    /** Shared engine for BUY_X_GET_Y (scoped to a product) and CATEGORY_BUY_N_GET_M (scoped to a category). */
    private function applyGroupDeal(array $offer, array &$pool, string $scopeField, int $scopeId): int
    {
        $groupSize = (int) $offer['buy_quantity'] + (int) $offer['get_quantity'];
        if ($groupSize <= 0 || $scopeId <= 0) return 0;
        $keys = [];
        foreach ($pool as $k => $unit) if (!$unit['consumed'] && $unit[$scopeField] === $scopeId) $keys[] = $k;
        $groups = intdiv(count($keys), $groupSize);
        if ($groups <= 0) return 0;
        usort($keys, static fn(int $a, int $b): int => $pool[$a]['unit_minor'] <=> $pool[$b]['unit_minor']);
        $freeCount = $groups * (int) $offer['get_quantity'];
        $consumeCount = $groups * $groupSize;
        $discount = 0;
        foreach (array_slice($keys, 0, $consumeCount) as $i => $k) {
            $pool[$k]['consumed'] = true;
            if ($i < $freeCount) $discount += $offer['get_discount_type'] === 'FREE' ? $pool[$k]['unit_minor'] : (int) round($pool[$k]['unit_minor'] * ((float) $offer['get_discount_value'] / 100));
        }
        return $discount;
    }

    private function applyFixedBundle(array $offer, array &$pool): int
    {
        $items = $offer['items'] ?? [];
        if (!$items) return 0;
        $instances = null;
        foreach ($items as $bundleItem) {
            $need = (int) $bundleItem['quantity'];
            if ($need <= 0) return 0;
            $available = 0;
            foreach ($pool as $unit) if (!$unit['consumed'] && $unit['product_id'] === (int) $bundleItem['product_id']) $available++;
            $possible = intdiv($available, $need);
            $instances = $instances === null ? $possible : min($instances, $possible);
        }
        if (!$instances) return 0;
        $bundlePriceMinor = Money::minor((string) $offer['bundle_price']);
        $totalDiscount = 0;
        for ($n = 0; $n < $instances; $n++) {
            $instanceMinor = 0;
            foreach ($items as $bundleItem) {
                $need = (int) $bundleItem['quantity'];
                $keys = [];
                foreach ($pool as $k => $unit) if (!$unit['consumed'] && $unit['product_id'] === (int) $bundleItem['product_id']) $keys[] = $k;
                usort($keys, static fn(int $a, int $b): int => $pool[$a]['unit_minor'] <=> $pool[$b]['unit_minor']);
                foreach (array_slice($keys, 0, $need) as $k) { $pool[$k]['consumed'] = true; $instanceMinor += $pool[$k]['unit_minor']; }
            }
            $totalDiscount += max(0, $instanceMinor - $bundlePriceMinor);
        }
        return $totalDiscount;
    }
}
