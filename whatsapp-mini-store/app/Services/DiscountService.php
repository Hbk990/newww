<?php
namespace App\Services;

use App\Repositories\DiscountCodeRepository;
use App\Support\Money;
use PDO;

final class DiscountService
{
    /**
     * Resolves and validates a discount code against an already server-computed cart.
     * Never trusts a client-submitted discount amount — everything here is derived
     * from the locked discount_codes row and the order's own line items.
     *
     * @param array<int,array{product_id:int,category_id:?int,line_total:string}> $items
     * @return array{code:array,discount_amount:string,free_delivery:bool}|null null when no code was supplied
     * @throws \DomainException when a code was supplied but is not valid or does not apply
     */
    public function resolve(PDO $pdo, int $storeId, ?string $rawCode, array $items, string $subtotal, ?int $customerId): ?array
    {
        $code = mb_strtoupper(trim((string) $rawCode));
        if ($code === '') return null;
        $repo = new DiscountCodeRepository;
        $discount = $repo->lockRedeemable($pdo, $storeId, $code);
        if (!$discount) throw new \DomainException('That discount code is invalid, inactive, or expired.');
        if ($discount['min_order_amount'] !== null && Money::minor($subtotal) < Money::minor($discount['min_order_amount'])) throw new \DomainException('That code requires a minimum order of ' . $discount['min_order_amount'] . '.');
        if ($discount['usage_limit_per_customer'] !== null) {
            $used = $customerId ? $repo->customerRedemptionCount($pdo, $storeId, (int) $discount['id'], $customerId) : 0;
            if ($used >= (int) $discount['usage_limit_per_customer']) throw new \DomainException('You have already used that discount code the maximum number of times.');
        }
        $freeDelivery = false; $discountMinor = 0;
        switch ($discount['type']) {
            case 'PERCENT_ORDER':
                $discountMinor = (int) round(Money::minor($subtotal) * ((float) $discount['value'] / 100));
                break;
            case 'FIXED_ORDER':
                $discountMinor = min(Money::minor((string) $discount['value']), Money::minor($subtotal));
                break;
            case 'PERCENT_PRODUCT':
                $matched = false;
                foreach ($items as $item) if ($item['product_id'] === (int) $discount['scope_product_id']) { $matched = true; $discountMinor += (int) round(Money::minor($item['line_total']) * ((float) $discount['value'] / 100)); }
                if (!$matched) throw new \DomainException('That discount code applies to a product that is not in your cart.');
                break;
            case 'PERCENT_CATEGORY':
                $matched = false;
                foreach ($items as $item) if ($item['category_id'] !== null && $item['category_id'] === (int) $discount['scope_category_id']) { $matched = true; $discountMinor += (int) round(Money::minor($item['line_total']) * ((float) $discount['value'] / 100)); }
                if (!$matched) throw new \DomainException('That discount code applies to a category that is not in your cart.');
                break;
            case 'FREE_DELIVERY':
                $freeDelivery = true;
                break;
            default:
                throw new \DomainException('That discount code is not supported.');
        }
        $discountMinor = max(0, min($discountMinor, Money::minor($subtotal)));
        return ['code' => $discount, 'discount_amount' => Money::fromMinor($discountMinor), 'free_delivery' => $freeDelivery];
    }
}
