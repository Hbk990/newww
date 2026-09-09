<?php
declare(strict_types=1);
require_once __DIR__ . '/../inc/bootstrap.php';

/* Lightweight order log.
 *
 * Records what was ordered — reference, timestamp, line items and total — plus
 * the customer's NAME, and nothing else about them. The name is stored because
 * the shop's receipt is filed under it: "Hassan Bitar · DR-20260907-4002" is how
 * an order is found again months later.
 *
 * The phone number, business name and order notes are still deliberately NOT
 * stored. They are collected in the browser and go into the WhatsApp message
 * only, so the order log never becomes a list of contactable customers.
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
if (!preg_match('/^DR-[0-9]{8}-(?:[0-9]{4}|[a-f0-9]{32})$/', $reference)) json_response(['ok' => false, 'error' => 'Invalid reference.'], 400);

// Free text typed by the customer, so it is cleaned and capped like any other.
// It is only ever echoed back to the dashboard, which escapes it.
$customerName = clean_text($payload['customer_name'] ?? '', 80);

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
$orderLock = lock_order_updates();
$orders = load_json(ORDERS_FILE, []);

// Existing receipt snapshots are immutable. A repeated request is idempotent.
$owner = order_owner_fingerprint();
$requestHash = hash('sha256', json_encode([$customerName, $lines]));
foreach ($orders as $existing) {
    if ((string)($existing['reference'] ?? '') !== $reference) continue;
    if (hash_equals((string)($existing['owner'] ?? ''), $owner) &&
        hash_equals((string)($existing['request_hash'] ?? ''), $requestHash)) {
        json_response(['ok' => true, 'reference' => $reference, 'total' => $existing['total'], 'status' => order_status($existing)]);
    }
    json_response(['ok' => false, 'error' => 'Reference already used. Refresh the catalog and submit a new order.'], 409);
}
array_unshift($orders, [
    'reference' => $reference,
    'time' => gmdate('c'),
    'currency' => (string)($settings['currency'] ?? 'USD'),
    'customer' => $customerName,
    'status' => 'unconfirmed',
    'owner' => $owner,
    'request_hash' => $requestHash,
    'items' => $items,
    'item_count' => count($items),
    'pieces' => $pieces,
    'total' => round($total, 2),
]);

save_json(ORDERS_FILE, array_slice($orders, 0, 2000));
json_response(['ok' => true, 'reference' => $reference, 'total' => round($total, 2), 'status' => 'unconfirmed']);
