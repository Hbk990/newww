<?php
declare(strict_types=1);

const CATEGORIES = [
    'Disposables / Shisha', 'Disposables / 50mg', 'Disposables / 20mg',
    'Machines',
    'Coils & accessories / Coils & pods', 'Coils & accessories / Accessories',
    'Liquids / 3mg', 'Liquids / 12mg', 'Liquids / 18mg', 'Liquids / 25mg', 'Liquids / 50mg',
    'Nicotine pouches',
];
// Kept valid so anything already saved under it stays editable.
const LEGACY_CATEGORIES = ['Disposables / 0mg'];
const BOTTLE_SIZES = ['30ml', '60ml', '100ml', '120ml'];
const HUQA_BRAND = 'HUQA';

const DELIVERY_AREAS = [
    'Beirut', 'Mount Lebanon', 'North Lebanon', 'Akkar',
    'Bekaa', 'Baalbek-Hermel', 'South Lebanon', 'Nabatieh',
];

const ORDER_STATUSES = ['new', 'confirmed', 'delivered', 'cancelled'];

/**
 * The shelves. Both the shop and the admin read this, so they can never disagree
 * about where a product belongs. `facet` is the first choice a customer makes.
 */
function sections(): array {
    $liquids = array_values(array_filter(CATEGORIES, fn($c) => str_starts_with($c, 'Liquids / ')));
    $disposables = array_values(array_filter(CATEGORIES, fn($c) => str_starts_with($c, 'Disposables / ')));
    return [
        ['slug' => 'disposables', 'title' => 'Disposables', 'facet' => 'kind',
         'blurb' => 'Ready-to-vape devices — shisha flavours, 50mg and 20mg salt.',
         'categories' => array_merge($disposables, LEGACY_CATEGORIES)],
        ['slug' => 'liquids', 'title' => 'E-Liquids', 'facet' => 'strength',
         'blurb' => 'Pick your nicotine strength, then your brand and flavour.',
         'categories' => $liquids],
        ['slug' => 'machines', 'title' => 'Machines', 'facet' => 'none',
         'blurb' => 'Mods, kits and pod systems — every model in your colour.',
         'categories' => ['Machines']],
        ['slug' => 'coils', 'title' => 'Coils & Pods', 'facet' => 'brand',
         'blurb' => 'Replacement coils and pods, sorted by brand.',
         'categories' => ['Coils & accessories / Coils & pods']],
        ['slug' => 'accessories', 'title' => 'Accessories', 'facet' => 'none',
         'blurb' => 'Batteries, chargers, tanks, glass and everything else.',
         'categories' => ['Coils & accessories / Accessories']],
        ['slug' => 'pouches', 'title' => 'Nicotine Pouches', 'facet' => 'none',
         'blurb' => 'Every model, every flavour, in both strengths.',
         'categories' => ['Nicotine pouches']],
    ];
}

function section_by_slug(string $slug): ?array {
    foreach (sections() as $section) if ($section['slug'] === $slug) return $section;
    return null;
}

function section_for(string $category): ?array {
    foreach (sections() as $section) if (in_array($category, $section['categories'], true)) return $section;
    return null;
}

function group_of(string $category): string { return explode(' / ', $category)[0]; }
function sub_of(string $category): string { return explode(' / ', $category)[1] ?? ''; }

function category_groups(): array {
    return array_values(array_unique(array_map('group_of', CATEGORIES)));
}

function liquid_strengths(): array {
    return array_values(array_map('sub_of', array_filter(CATEGORIES, fn($c) => str_starts_with($c, 'Liquids / '))));
}

function disposable_kinds(): array {
    return array_values(array_map('sub_of', array_filter(CATEGORIES, fn($c) => str_starts_with($c, 'Disposables / '))));
}

function in_stock(array $product): bool {
    foreach ($product['variants'] ?? [] as $variant) if (!empty($variant['available'])) return true;
    return false;
}

function variant_label(array $product, array $variant): string {
    $parts = array_filter([$variant['label'] ?? '', $variant['strength'] ?? '', $product['bottleSize'] ?? '']);
    return implode(' · ', $parts);
}

/** "3 colours", "6 options", "5 flavours" — a word that pluralises. */
function variant_count(string $category, int $n): string {
    $word = $category === 'Machines' ? 'colour'
        : (str_starts_with($category, 'Coils & accessories') || $category === 'Nicotine pouches' ? 'option' : 'flavour');
    return $n . ' ' . $word . ($n === 1 ? '' : 's');
}

function variant_word(string $category): string {
    return $category === 'Machines' ? 'Colour'
        : (str_starts_with($category, 'Coils & accessories') ? 'Option'
        : ($category === 'Nicotine pouches' ? 'Flavour & strength' : 'Flavour'));
}

function is_huqa_brand(array $product): bool {
    return normalize_text(trim((string)($product['brand'] ?? ''))) === normalize_text(HUQA_BRAND);
}

// ---------------------------------------------------------------- searching

function normalize_text(string $value): string {
    $value = mb_strtolower($value, 'UTF-8');
    $stripped = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value);
    return $stripped === false ? $value : $stripped;
}

function squash_text(string $value): string {
    return preg_replace('/[^a-z0-9]/', '', normalize_text($value)) ?? '';
}

/**
 * Shoppers type "elfbar" for "Elf Bar" and misspell the rest, so a word matches
 * on a plain substring, on the space-stripped form, or within one or two edits
 * of any word in the text.
 */
function text_matches(string $value, string $query): bool {
    $query = trim($query);
    if ($query === '') return true;
    $hay = normalize_text($value);
    $tight = squash_text($value);
    $words = array_filter(preg_split('/[^a-z0-9]+/', $hay) ?: []);
    foreach (preg_split('/\s+/', normalize_text($query)) ?: [] as $term) {
        if ($term === '') continue;
        if (str_contains($hay, $term)) continue;
        $packed = squash_text($term);
        if (strlen($packed) >= 3 && $packed !== '' && str_contains($tight, $packed)) continue;
        $limit = strlen($term) >= 5 ? 2 : 1;
        $close = false;
        if (strlen($term) >= 3) {
            foreach ($words as $word) {
                if (levenshtein($word, $term) <= $limit) { $close = true; break; }
            }
        }
        if (!$close) return false;
    }
    return true;
}

function product_haystack(array $product): string {
    $bits = [$product['name'] ?? '', $product['brand'] ?? '', $product['category'] ?? '', $product['description'] ?? ''];
    foreach ($product['variants'] ?? [] as $variant) {
        $bits[] = ($variant['label'] ?? '') . ' ' . ($variant['strength'] ?? '');
    }
    return implode(' ', $bits);
}

function search_products(array $products, string $query): array {
    if (trim($query) === '') return [];
    return array_values(array_filter($products, fn($p) => text_matches(product_haystack($p), $query)));
}

function search_bundles(array $bundles, string $query): array {
    if (trim($query) === '') return [];
    return array_values(array_filter($bundles, fn($b) =>
        text_matches(($b['name'] ?? '') . ' ' . ($b['badge'] ?? '') . ' ' . ($b['description'] ?? ''), $query)));
}

/** Adjacent words are also stored joined up, so "elfbr" can be corrected to "elfbar". */
function search_vocabulary(array $products): array {
    $terms = [];
    foreach ($products as $product) {
        $sources = [$product['name'] ?? '', $product['brand'] ?? ''];
        foreach ($product['variants'] ?? [] as $variant) $sources[] = $variant['label'] ?? '';
        foreach ($sources as $source) {
            $parts = array_values(array_filter(preg_split('/[^a-z0-9]+/', normalize_text($source)) ?: [],
                fn($w) => strlen($w) > 2));
            foreach ($parts as $i => $word) {
                $terms[$word] = true;
                if ($i > 0) $terms[$parts[$i - 1] . $word] = true;
            }
        }
    }
    // PHP turns array keys that look numeric into integers, so "5000" would come
    // back as an int and break the string comparisons below.
    return array_map('strval', array_keys($terms));
}

/** Swaps a misspelt word for the closest catalogue term, or null if it is already fine. */
function correct_query(string $query, array $terms): ?string {
    $parts = preg_split('/\s+/', trim($query)) ?: [];
    $fixed = [];
    foreach ($parts as $part) {
        $q = normalize_text($part);
        $known = false;
        foreach ($terms as $term) if (str_contains($term, $q)) { $known = true; break; }
        if (strlen($q) < 3 || $known) { $fixed[] = $part; continue; }
        $limit = strlen($q) >= 5 ? 2 : 1;
        $best = null; $bestScore = $limit + 1;
        foreach ($terms as $term) {
            $d = levenshtein($q, $term);
            if ($d < $bestScore) { $bestScore = $d; $best = $term; }
        }
        $fixed[] = $best ?? $part;
    }
    $corrected = implode(' ', $fixed);
    return mb_strtolower($corrected) === mb_strtolower(trim($query)) ? null : $corrected;
}

// ---------------------------------------------------------------- bundles

/**
 * A bundle prices three ways: `items` charges only the lines not marked free
 * (buy two, get one free), `fixed` sets an outright price, `percent` discounts
 * the full total. Returns null when a product it points at has been deleted.
 */
function price_bundle(array $bundle, array $products): ?array {
    $byId = [];
    foreach ($products as $product) $byId[$product['id']] = $product;
    $lines = [];
    $full = 0.0;
    $paid = 0.0;
    foreach ($bundle['items'] ?? [] as $item) {
        $product = $byId[$item['productId']] ?? null;
        if (!$product) return null;
        $variant = null;
        foreach ($product['variants'] as $candidate) {
            if ($candidate['id'] === $item['variantId']) { $variant = $candidate; break; }
        }
        if (!$variant) return null;
        $quantity = (int)$item['quantity'];
        $lineTotal = (float)($product['price'] ?? 0) * $quantity;
        $full += $lineTotal;
        if (empty($item['free'])) $paid += $lineTotal;
        $lines[] = ['product' => $product, 'variant' => $variant, 'quantity' => $quantity, 'free' => !empty($item['free'])];
    }
    $mode = $bundle['mode'] ?? 'items';
    $value = (float)($bundle['value'] ?? 0);
    $price = match ($mode) {
        'fixed' => $value,
        'percent' => $full * (1 - $value / 100),
        default => $paid,
    };
    return $bundle + [
        'lines' => $lines,
        'fullPrice' => round($full, 2),
        'price' => round(max(0, $price), 2),
    ];
}

function bundle_in_stock(array $priced): bool {
    foreach ($priced['lines'] as $line) if (empty($line['variant']['available'])) return false;
    return true;
}

// ---------------------------------------------------------------- phone & WhatsApp

function lebanese_phone(string $raw): string {
    $digits = preg_replace('/\D/', '', $raw) ?? '';
    $digits = preg_replace('/^00/', '', $digits) ?? '';
    $local = str_starts_with($digits, '961') ? substr($digits, 3) : preg_replace('/^0/', '', $digits);
    if (!preg_match('/^[0-9]{7,8}$/', (string)$local)) {
        throw new InvalidArgumentException('Enter a Lebanese mobile number, for example 71 392 434.');
    }
    return '961' . $local;
}

function display_phone(string $e164): string {
    if (!str_starts_with($e164, '961')) return '+' . $e164;
    return '+961 ' . preg_replace('/(\d{2})(\d{3})(\d+)/', '$1 $2 $3', substr($e164, 3));
}

function whatsapp_link(string $number, string $message): string {
    return 'https://wa.me/' . preg_replace('/\D/', '', $number) . '?text=' . rawurlencode($message);
}

function delivery_cost(array $settings, float $subtotal): float {
    $free = (float)($settings['freeDeliveryOver'] ?? 0);
    return $free > 0 && $subtotal >= $free ? 0.0 : (float)($settings['deliveryFee'] ?? 0);
}

function order_message(array $settings, array $order): string {
    $lines = [];
    foreach ($order['lines'] as $i => $line) {
        $detail = $line['detail'] !== '' ? ' — ' . $line['detail'] : '';
        $lines[] = sprintf('%d. %s%s × %d — %s', $i + 1, $line['name'], $detail, $line['quantity'], money($line['total']));
        foreach ($line['contents'] ?? [] as $content) $lines[] = '    • ' . $content;
    }
    $c = $order['contact'];
    $out = array_merge(
        ["Hello {$settings['storeName']}! I would like to place order {$order['ref']}:", ''],
        $lines,
        ['', 'Subtotal: ' . money($order['subtotal']),
         'Delivery: ' . ($order['deliveryFee'] > 0 ? money($order['deliveryFee']) : 'Free'),
         'Total: ' . money($order['total']), '',
         'Name: ' . $c['name'], 'Phone: ' . display_phone($c['phone']),
         'Area: ' . $c['area'], 'Address: ' . $c['address']],
    );
    if (($c['note'] ?? '') !== '') $out[] = 'Note: ' . $c['note'];
    return implode("\n", $out);
}
