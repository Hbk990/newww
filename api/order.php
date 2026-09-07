<?php
declare(strict_types=1);
require_once __DIR__ . '/../inc/bootstrap.php';

/* Lightweight order log.
 *
 * Records ONLY what was ordered: reference, timestamp, line items and total.
 * The customer's name, phone, business and notes are deliberately NOT stored —
 * they are collected in the browser and go into the WhatsApp message only, so no
 * personal data lands on the server.
 *
 * Prices and totals are recomputed here from catalog.json. Everything the client
 * sends except product ids, variants and quantities is treated as untrusted; a
 * forged price in the request body has no effect on what is recorded.
 */

if (!is_customer()) json_response(['ok' => false, 'error' => 'Authentication required.'], 401);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['ok' => false, 'error' => 'POST required.'], 405);

// sendBeacon posts a Blob, so read the raw body rather than $_POST.
$raw = file_get_contents('php://input');
if ($raw === false || strlen($raw) > 262144) json_response(['ok' => false, 'error' => 'Payload too large.'], 413);
$payload = json_decode((string)$raw, true);
if (!is_array($payload)) json_response(['ok' => false, 'error' => 'Invalid payload.'], 400);

if (!hash_equals((string)($_SESSION['csrf'] ?? ''), (string)($payload['csrf'] ?? ''))) {
    json_response(['ok' => false, 'error' => 'Security token expired.'], 419);
}

$reference = clean_text($payload['reference'] ?? '', 60);
if (!preg_match('/^DR-[0-9]{8}-[0-9]{4}$/', $reference)) json_response(['ok' => false, 'error' => 'Invalid reference.'], 400);

$lines = $payload['lines'] ?? [];
if (!is_array($lines) || !$lines) json_response(['ok' => false, 'error' => 'No items.'], 400);
if (count($lines) > 200) json_response(['ok' => false, 'error' => 'Too many lines.'], 400);

/* Index the catalog by product id so each line can be priced from the source. */
$catalog = catalog(); $index = [];
foreach ($catalog as $category) {
    foreach (($category['products'] ?? []) as $product) $index[(int)$product['id']] = $product;
}

function order_unit_price(array $product, int $optionIndex, int $quantity): float {
    $options = is_array($product['options'] ?? null) ? $product['options'] : [];
    if ($options) {
        $option = $options[$optionIndex] ?? $options[0];
        $base = (float)($option['price'] ?? 0);
    } else {
        $base = is_numeric($product['price'] ?? null) ? (float)$product['price'] : 0.0;
    }
    foreach ((array)($product['tiers'] ?? []) as $tier) {
        if (is_numeric($tier['min'] ?? null) && $quantity >= (int)$tier['min'] && is_numeric($tier['price'] ?? null)) {
            $base = (float)$tier['price'];
        }
    }
    return round($base, 2);
}

$items = []; $total = 0.0; $pieces = 0;
foreach ($lines as $line) {
    if (!is_array($line)) continue;
    $id = (int)($line['productId'] ?? 0);
    if (!isset($index[$id])) continue;                       // deleted or hidden product
    $product = $index[$id];
    if ((string)($product['visibility'] ?? 'published') !== 'published') continue;

    $quantity = (int)($line['quantity'] ?? 0);
    if ($quantity < 1) continue;
    $quantity = min(999, $quantity);

    $optionIndex = max(0, (int)($line['option'] ?? 0));
    $options = is_array($product['options'] ?? null) ? $product['options'] : [];
    $optionName = $options ? (string)($options[$optionIndex]['name'] ?? ($options[0]['name'] ?? '')) : '';

    // Variant labels are echoed back into the log, so they are validated against
    // the product rather than trusted as free text.
    $color = clean_text($line['color'] ?? '', 100);
    if ($color !== '' && !in_array($color, array_map('strval', (array)($product['colors'] ?? [])), true)) $color = '';
    $flavor = clean_text($line['flavor'] ?? '', 180);
    if ($flavor !== '' && !in_array($flavor, array_map('strval', (array)($product['flavors'] ?? [])), true)) $flavor = '';

    $unit = order_unit_price($product, $optionIndex, $quantity);
    $lineTotal = round($unit * $quantity, 2);
    $total += $lineTotal; $pieces += $quantity;

    $items[] = [
        // The dashboard's restock report joins these lines back to the catalog.
        // SKU is editable and not guaranteed unique, so record the id as well.
        'id' => (int)($product['id'] ?? 0),
        'sku' => (string)($product['sku'] ?? ''),
        'name' => (string)($product['name'] ?? ''),
        'option' => $optionName,
        'color' => $color,
        'flavor' => $flavor,
        'quantity' => $quantity,
        'unit_price' => $unit,
        'line_total' => $lineTotal,
    ];
}

if (!$items) json_response(['ok' => false, 'error' => 'No valid items.'], 400);

$settings = settings();
$orders = load_json(ORDERS_FILE, []);

/* This runs when the customer taps WhatsApp, which is BEFORE the message is
 * composed, let alone sent. WhatsApp tells the site nothing, so the server can
 * never learn whether it was really sent, deleted or cancelled. The row is
 * therefore recorded as "unconfirmed" and only counts towards the sales and
 * reorder figures once the customer says they sent it (on returning to the tab)
 * or the administrator confirms it in the dashboard. */

/* The reference is chosen by the browser and is only four random digits, so it
 * must never be treated as proof of identity. Ownership is this session's secret
 * instead: a row may only be replaced, or later confirmed and cancelled, by the
 * session that wrote it. Without this, one customer could post an order under
 * another customer's reference — which both destroyed that order and handed the
 * attacker the right to cancel it. */
$owner = order_owner_fingerprint();

$existingStatus = 'unconfirmed';
$existingIndex = null;
foreach ($orders as $index => $existing) {
    if ((string)($existing['reference'] ?? '') !== $reference) continue;
    $existingIndex = $index;
    $existingStatus = order_status($existing);
    break;
}

if ($existingIndex !== null && !hash_equals((string)($orders[$existingIndex]['owner'] ?? ''), $owner)) {
    /* Someone else's row — or one written before ownership was recorded. Leave it
     * completely alone and file this order under the next free reference. Two
     * browsers can pick the same four digits on the same day by chance, so this
     * has to keep both orders rather than reject the second. The suffix keeps the
     * customer's quoted reference a prefix of it, so searching still finds it. */
    for ($suffix = 2; $suffix <= 99; $suffix++) {
        $candidate = $reference . '-' . $suffix;
        $taken = false;
        foreach ($orders as $existing) {
            if ((string)($existing['reference'] ?? '') === $candidate) { $taken = true; break; }
        }
        if (!$taken) { $reference = $candidate; break; }
    }
    $existingIndex = null;
    $existingStatus = 'unconfirmed';
}

// One reference is one order: re-sending replaces rather than duplicates. An
// already-confirmed or cancelled order keeps the decision that was made about it.
if ($existingIndex !== null) {
    array_splice($orders, $existingIndex, 1);
}
array_unshift($orders, [
    'reference' => $reference,
    'time' => gmdate('c'),
    'currency' => (string)($settings['currency'] ?? 'USD'),
    'status' => $existingStatus,
    'owner' => $owner,
    'items' => $items,
    'item_count' => count($items),
    'pieces' => $pieces,
    'total' => round($total, 2),
]);

save_json(ORDERS_FILE, array_slice($orders, 0, 2000));
json_response(['ok' => true, 'reference' => $reference, 'total' => round($total, 2), 'status' => $existingStatus]);
