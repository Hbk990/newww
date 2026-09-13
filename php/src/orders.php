<?php
declare(strict_types=1);

// Orders are files, not table rows. The key carries an inverted timestamp so a
// plain directory listing already reads newest first.
const FAR_FUTURE = 9999999999999;
const REF_ALPHABET = 'ACDEFGHJKLMNPQRTUVWXY3456789';

function order_ref(): string {
    $ref = 'HQ-';
    for ($i = 0; $i < 6; $i++) $ref .= REF_ALPHABET[random_int(0, strlen(REF_ALPHABET) - 1)];
    return $ref;
}

function order_filename(int $createdAt, string $ref): string {
    return str_pad((string)(FAR_FUTURE - $createdAt), 13, '0', STR_PAD_LEFT) . '-' . $ref . '.json';
}

function validate_contact(array $input): array {
    $name = field($input, 'name', 80, true);
    if (mb_strlen($name) < 2) throw new InvalidArgumentException('Please enter your full name.');
    $phone = lebanese_phone(field($input, 'phone', 24, true));
    $area = field($input, 'area', 40, true);
    if (!in_array($area, DELIVERY_AREAS, true)) throw new InvalidArgumentException('Choose your delivery area.');
    $address = field($input, 'address', 400, true);
    if (mb_strlen($address) < 10) {
        throw new InvalidArgumentException('Please give a detailed address — building, street and a landmark.');
    }
    return ['name' => $name, 'phone' => $phone, 'area' => $area, 'address' => $address,
            'note' => field($input, 'note', 500)];
}

/**
 * Prices the cart from the catalogue. Whatever the browser claims a thing costs
 * is ignored; only the id and the quantity are taken from it.
 */
function build_order(array $cart, array $contact, array $settings, array $products, array $bundles): array {
    if (!$cart) throw new InvalidArgumentException('Your cart is empty.');
    if (count($cart) > 40) throw new InvalidArgumentException('That is too many different items for one order.');

    $lines = [];
    foreach ($cart as $entry) {
        $quantity = (int)($entry['quantity'] ?? 0);
        if ($quantity < 1 || $quantity > 99) throw new InvalidArgumentException('Choose a quantity between 1 and 99.');
        $kind = (string)($entry['kind'] ?? '');

        if ($kind === 'bundle') {
            $bundle = null;
            foreach ($bundles as $candidate) {
                if (($candidate['id'] ?? '') === ($entry['bundleId'] ?? '') && !empty($candidate['active'])) {
                    $bundle = $candidate; break;
                }
            }
            $priced = $bundle ? price_bundle($bundle, $products) : null;
            if (!$priced) throw new InvalidArgumentException('One of the offers in your cart is no longer available. Please refresh.');
            if (!bundle_in_stock($priced)) {
                throw new InvalidArgumentException('"' . $priced['name'] . '" is out of stock. Please remove it and try again.');
            }
            $contents = [];
            foreach ($priced['lines'] as $line) {
                $contents[] = $line['product']['name'] . ' — ' . variant_label($line['product'], $line['variant'])
                    . ' × ' . $line['quantity'] . ($line['free'] ? ' (free)' : '');
            }
            $lines[] = [
                'kind' => 'bundle', 'name' => $priced['name'], 'detail' => $priced['badge'],
                'quantity' => $quantity, 'unitPrice' => $priced['price'],
                'total' => round($priced['price'] * $quantity, 2), 'contents' => $contents,
            ];
            continue;
        }

        if ($kind !== 'product') throw new InvalidArgumentException('Your cart could not be read. Please rebuild it.');
        $product = find_product($products, (string)($entry['productId'] ?? ''));
        $variant = null;
        if ($product) {
            foreach ($product['variants'] as $candidate) {
                if ($candidate['id'] === ($entry['variantId'] ?? '')) { $variant = $candidate; break; }
            }
        }
        if (!$product || !$variant) throw new InvalidArgumentException('An item in your cart is no longer available. Please refresh.');
        if (empty($variant['available'])) {
            throw new InvalidArgumentException('"' . $product['name'] . ' — ' . variant_label($product, $variant)
                . '" is out of stock. Please remove it and try again.');
        }
        $unit = (float)($product['price'] ?? 0);
        $lines[] = [
            'kind' => 'product', 'name' => $product['name'], 'detail' => variant_label($product, $variant),
            'quantity' => $quantity, 'unitPrice' => $unit, 'total' => round($unit * $quantity, 2), 'contents' => [],
        ];
    }

    $subtotal = round(array_sum(array_column($lines, 'total')), 2);
    $delivery = delivery_cost($settings, $subtotal);
    return [
        'ref' => order_ref(),
        'createdAt' => time() * 1000,
        'status' => 'new',
        'contact' => $contact,
        'lines' => $lines,
        'subtotal' => $subtotal,
        'deliveryFee' => $delivery,
        'total' => round($subtotal + $delivery, 2),
        'ip' => client_ip(),
    ];
}

function client_ip(): string {
    foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR'] as $key) {
        $value = $_SERVER[$key] ?? '';
        if ($value !== '') return trim(explode(',', $value)[0]);
    }
    return '';
}

function customer_file(string $phone): string {
    return DIR_CUSTOMERS . '/' . preg_replace('/\D/', '', $phone) . '.json';
}

/** Writes the order, then folds it into the customer's own file. */
function record_order(array $order): string {
    data_dirs();
    $file = DIR_ORDERS . '/' . order_filename($order['createdAt'], $order['ref']);
    $phone = $order['contact']['phone'];

    return with_lock('orders', function () use ($order, $file, $phone) {
        $customer = read_json(customer_file($phone), null);
        $recent = 0;
        foreach ($customer['orders'] ?? [] as $past) {
            if ($order['createdAt'] - (int)$past['createdAt'] < 3600000) $recent++;
        }
        if ($recent >= 10) {
            throw new RuntimeException('That is a lot of orders in one hour. Please message us on WhatsApp instead.');
        }

        write_json($file, $order);

        $addresses = [['area' => $order['contact']['area'], 'address' => $order['contact']['address'],
                       'lastUsed' => $order['createdAt']]];
        foreach ($customer['addresses'] ?? [] as $address) {
            if (($address['address'] ?? '') !== $order['contact']['address']) $addresses[] = $address;
        }
        $history = array_merge(
            [['ref' => $order['ref'], 'createdAt' => $order['createdAt'], 'total' => $order['total'],
              'file' => basename($file)]],
            $customer['orders'] ?? [],
        );
        write_json(customer_file($phone), [
            'phone' => $phone,
            'name' => $order['contact']['name'],
            'addresses' => array_slice($addresses, 0, 10),
            'firstOrderAt' => $customer['firstOrderAt'] ?? $order['createdAt'],
            'lastOrderAt' => $order['createdAt'],
            'orderCount' => (int)($customer['orderCount'] ?? 0) + 1,
            'totalSpent' => round((float)($customer['totalSpent'] ?? 0) + $order['total'], 2),
            'orders' => array_slice($history, 0, 500),
            'lastIp' => $order['ip'],
        ]);
        return basename($file);
    });
}

function list_orders(): array {
    data_dirs();
    $files = glob(DIR_ORDERS . '/*.json') ?: [];
    sort($files);                                   // inverted timestamps: newest first
    $orders = [];
    foreach ($files as $file) {
        $order = read_json($file, null);
        if (is_array($order)) $orders[] = $order + ['file' => basename($file)];
    }
    return $orders;
}

function read_order(string $filename): ?array {
    if (!preg_match('/^[0-9]{13}-HQ-[A-Z0-9]{6}\.json$/', $filename)) return null;
    $order = read_json(DIR_ORDERS . '/' . $filename, null);
    return is_array($order) ? $order + ['file' => $filename] : null;
}

function set_order_status(string $filename, string $status): array {
    if (!in_array($status, ORDER_STATUSES, true)) throw new InvalidArgumentException('Unknown status.');
    $order = read_order($filename);
    if (!$order) throw new InvalidArgumentException('That order could not be found.');
    $order['status'] = $status;
    unset($order['file']);
    write_json(DIR_ORDERS . '/' . $filename, $order);
    return $order;
}

function list_customers(): array {
    data_dirs();
    $customers = [];
    foreach (glob(DIR_CUSTOMERS . '/*.json') ?: [] as $file) {
        $customer = read_json($file, null);
        if (is_array($customer)) $customers[] = $customer;
    }
    usort($customers, fn($a, $b) => ($b['lastOrderAt'] ?? 0) <=> ($a['lastOrderAt'] ?? 0));
    return $customers;
}

function read_customer(string $phone): ?array {
    $digits = preg_replace('/\D/', '', $phone) ?? '';
    if ($digits === '') return null;
    $customer = read_json(DIR_CUSTOMERS . '/' . $digits . '.json', null);
    return is_array($customer) ? $customer : null;
}
