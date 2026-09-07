<?php
declare(strict_types=1);
require_once __DIR__ . '/../inc/bootstrap.php';

/* Lets a customer say whether they actually sent the WhatsApp message.
 *
 * order.php records an order the moment the WhatsApp button is tapped, which is
 * before the message exists. When the customer comes back to the catalog tab the
 * storefront asks whether they sent it; the answer lands here.
 *
 * Only two answers are accepted, and only for an order this session actually
 * placed — proven by the owner fingerprint on the row, not by the reference,
 * which is four guessable digits chosen by the browser. Nothing here stores or
 * reads personal data.
 */

if (!is_customer()) json_response(['ok' => false, 'error' => 'Authentication required.'], 401);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['ok' => false, 'error' => 'POST required.'], 405);

$raw = file_get_contents('php://input');
if ($raw === false || strlen($raw) > 4096) json_response(['ok' => false, 'error' => 'Payload too large.'], 413);
$payload = json_decode((string)$raw, true);
if (!is_array($payload)) json_response(['ok' => false, 'error' => 'Invalid payload.'], 400);

if (!hash_equals((string)($_SESSION['csrf'] ?? ''), (string)($payload['csrf'] ?? ''))) {
    json_response(['ok' => false, 'error' => 'Security token expired.'], 419);
}

$reference = clean_text($payload['reference'] ?? '', 60);
if (!preg_match('/^DR-[0-9]{8}-[0-9]{4}(-[0-9]{1,2})?$/', $reference)) {
    json_response(['ok' => false, 'error' => 'Invalid reference.'], 400);
}

$status = (string)($payload['status'] ?? '');
if (!in_array($status, ['confirmed', 'cancelled'], true)) {
    json_response(['ok' => false, 'error' => 'Unknown status.'], 400);
}

/* Authorisation is the recorded owner, not the reference and not a list held in
 * the session. A caller who merely knows a reference cannot reach this: they
 * would have to hold the session secret the row was written with. */
$orders = load_json(ORDERS_FILE, []);
$found = false;
foreach ($orders as &$order) {
    if ((string)($order['reference'] ?? '') !== $reference) continue;
    if (!order_owned_by_session($order)) {
        json_response(['ok' => false, 'error' => 'That order does not belong to this session.'], 403);
    }
    $order['status'] = $status;
    $order['status_by'] = 'customer';
    $order['status_at'] = gmdate('c');
    $found = true;
    break;
}
unset($order);

if (!$found) json_response(['ok' => false, 'error' => 'Order not found.'], 404);

save_json(ORDERS_FILE, $orders);
json_response(['ok' => true, 'reference' => $reference, 'status' => $status]);
