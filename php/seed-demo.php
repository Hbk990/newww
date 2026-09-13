<?php
/**
 * Fills the shop with a realistic demo catalogue so you can click around before
 * entering your own stock.
 *
 * On a normal host just open it in the browser:
 *   your-domain.com/seed-demo.php            add the demo data
 *   your-domain.com/seed-demo.php?clear=1    remove it again
 *
 * Or from a command line:
 *   php seed-demo.php
 *   php seed-demo.php --clear
 *
 * Delete this file once you are done with it.
 *
 * Safe to run twice: every demo row has a fixed id, so a second run replaces
 * them instead of duplicating. Products you added yourself are left alone.
 */
declare(strict_types=1);
require __DIR__ . '/src/config.php';
require __DIR__ . '/src/model.php';
require __DIR__ . '/src/store.php';

$cli = PHP_SAPI === 'cli';
if (!$cli) header('Content-Type: text/plain; charset=utf-8');
$clear = $cli ? in_array('--clear', $argv ?? [], true) : isset($_GET['clear']);
$counter = 0;
$demoId = function () use (&$counter): string {
    return sprintf('d0000000-0000-4000-8000-%012d', ++$counter);
};
$isDemo = fn(array $row) => str_starts_with($row['id'] ?? '', 'd0000000-');
$now = time() * 1000;

/** @param array<int,array{0:string,1?:bool}|string> $names */
$flavours = function (array $names, string $strength = '') use ($demoId): array {
    $out = [];
    foreach ($names as $entry) {
        [$label, $available] = is_array($entry) ? [$entry[0], $entry[1]] : [$entry, true];
        $out[] = ['id' => $demoId(), 'label' => $label, 'strength' => $strength, 'available' => $available];
    }
    return $out;
};

$product = function (array $fields) use ($demoId, $now): array {
    return array_merge([
        'id' => $demoId(), 'brand' => '', 'bottleSize' => '', 'description' => '',
        'image' => '', 'featured' => false, 'updatedAt' => $now - random_int(0, 30) * 86400000,
    ], $fields);
};

$products = [
    // Disposables / Shisha
    $product(['name' => 'HUQA Shisha Bar 10000', 'brand' => 'HUQA', 'category' => 'Disposables / Shisha', 'price' => 20.0, 'featured' => true,
        'description' => 'Our own shisha-flavour disposable. 10,000 puffs, rechargeable, and blended to the recipe our regulars kept asking for by name.',
        'variants' => $flavours(['Double Apple', 'Mint Storm', 'Grape & Berry', 'Watermelon Chill', 'Lemon Mint'])]),
    $product(['name' => 'Al Fakher Crown Bar 8000', 'brand' => 'Al Fakher', 'category' => 'Disposables / Shisha', 'price' => 18.0,
        'description' => 'The shisha house everyone knows, in a disposable.',
        'variants' => $flavours(['Two Apples', 'Mint', 'Grape Berry', 'Lemon Mint', ['Blueberry Mint', false]])]),
    $product(['name' => 'Tugboat Shisha 12000', 'brand' => 'Tugboat', 'category' => 'Disposables / Shisha', 'price' => 22.0,
        'variants' => $flavours(['Double Apple Ice', 'Grape Mint', 'Mixed Berries'])]),

    // Disposables / 50mg
    $product(['name' => 'Elf Bar BC5000', 'brand' => 'Elf Bar', 'category' => 'Disposables / 50mg', 'price' => 12.5, 'featured' => true,
        'description' => '5,000 puffs, rechargeable USB-C, mesh coil. The one that never sits on the shelf.',
        'variants' => $flavours(['Watermelon Ice', 'Blue Razz Ice', 'Strawberry Mango', ['Peach Ice', false], 'Kiwi Passion Guava'], '50mg')]),
    $product(['name' => 'Lost Mary OS5000', 'brand' => 'Lost Mary', 'category' => 'Disposables / 50mg', 'price' => 14.0,
        'description' => 'Softer draw than the Elf Bar, same battery life.',
        'variants' => $flavours(['Blue Trio', 'Watermelon Cherry', 'Pineapple Mango', 'Strawberry Ice'], '50mg')]),
    $product(['name' => 'Vozol Gear 10000', 'brand' => 'Vozol', 'category' => 'Disposables / 50mg', 'price' => 17.0,
        'variants' => $flavours(['Cool Mint', 'Strawberry Banana', 'Mango Ice', 'Grape Ice'], '50mg')]),
    $product(['name' => 'Geek Bar Pulse 15000', 'brand' => 'Geek Bar', 'category' => 'Disposables / 50mg', 'price' => 22.0, 'featured' => true,
        'description' => 'Screen on the side, two power modes, 15,000 puffs in normal mode.',
        'variants' => $flavours(['Miami Mint', 'Sour Apple Ice', 'Watermelon Ice', ['Strawberry Banana', false]], '50mg')]),

    // Disposables / 20mg
    $product(['name' => 'Elf Bar 600 V2', 'brand' => 'Elf Bar', 'category' => 'Disposables / 20mg', 'price' => 12.0,
        'description' => 'Lighter salt, 600 puffs. The one to start on.',
        'variants' => $flavours(['Watermelon', 'Mango', 'Mint', 'Cherry Cola'], '20mg')]),
    $product(['name' => 'Vozol Neon 800', 'brand' => 'Vozol', 'category' => 'Disposables / 20mg', 'price' => 13.0,
        'variants' => $flavours(['Blueberry', 'Peach Ice', ['Cola', false]], '20mg')]),

    // Machines
    $product(['name' => 'Voopoo Drag X2', 'brand' => 'Voopoo', 'category' => 'Machines', 'price' => 42.0, 'featured' => true,
        'description' => '80W single-battery mod with the PnP pod tank. Takes one 18650 (sold separately).',
        'variants' => $flavours(['Black', 'Silver', 'Red', ['Blue', false]])]),
    $product(['name' => 'Smok Nord 5', 'brand' => 'Smok', 'category' => 'Machines', 'price' => 32.0,
        'description' => '80W pod kit, 2000mAh built in.', 'variants' => $flavours(['Black', 'Green', 'Red', 'Gold'])]),
    $product(['name' => 'Vaporesso Xros 4', 'brand' => 'Vaporesso', 'category' => 'Machines', 'price' => 28.0,
        'description' => 'Small, quiet, and the easiest thing to carry.', 'variants' => $flavours(['Black', 'White', 'Blue', 'Pink'])]),
    $product(['name' => 'Geekvape Aegis Legend 3', 'brand' => 'Geekvape', 'category' => 'Machines', 'price' => 55.0,
        'description' => 'Shockproof, dustproof, water resistant. The one you buy once.', 'variants' => $flavours(['Black', 'Gunmetal', 'Green'])]),

    // Coils & pods
    $product(['name' => 'Voopoo PnP Coils (5-pack)', 'brand' => 'Voopoo', 'category' => 'Coils & accessories / Coils & pods', 'price' => 12.0,
        'variants' => $flavours(['PnP-VM1 0.3ohm', 'PnP-VM6 0.15ohm', ['PnP-TM2 0.8ohm', false]])]),
    $product(['name' => 'Voopoo ITO Pods (3-pack)', 'brand' => 'Voopoo', 'category' => 'Coils & accessories / Coils & pods', 'price' => 9.0,
        'variants' => $flavours(['0.7ohm', '1.0ohm'])]),
    $product(['name' => 'Smok RPM Coils (5-pack)', 'brand' => 'Smok', 'category' => 'Coils & accessories / Coils & pods', 'price' => 11.0,
        'variants' => $flavours(['RPM Mesh 0.4ohm', 'RPM Triple 0.6ohm'])]),
    $product(['name' => 'Smok Nord Pods (3-pack)', 'brand' => 'Smok', 'category' => 'Coils & accessories / Coils & pods', 'price' => 8.0,
        'variants' => $flavours(['0.6ohm Mesh', '0.8ohm Regular'])]),
    $product(['name' => 'Vaporesso Xros Pods (3-pack)', 'brand' => 'Vaporesso', 'category' => 'Coils & accessories / Coils & pods', 'price' => 9.0,
        'variants' => $flavours(['0.6ohm Mesh', '0.8ohm Mesh', '1.0ohm'])]),
    $product(['name' => 'Geekvape B Series Coils (5-pack)', 'brand' => 'Geekvape', 'category' => 'Coils & accessories / Coils & pods', 'price' => 13.0,
        'variants' => $flavours(['B 0.3ohm', 'B 0.4ohm', 'B 0.6ohm'])]),

    // Accessories
    $product(['name' => 'Sony VTC6 18650 Battery', 'brand' => 'Sony', 'category' => 'Coils & accessories / Accessories', 'price' => 9.0,
        'description' => '3000mAh, 15A continuous. Genuine cells only.', 'variants' => $flavours(['Single', 'Pair'])]),
    $product(['name' => 'Nitecore i2 Charger', 'brand' => 'Nitecore', 'category' => 'Coils & accessories / Accessories', 'price' => 17.0,
        'variants' => $flavours(['Two-bay'])]),
    $product(['name' => 'USB-C Fast Charging Cable', 'brand' => 'HUQA', 'category' => 'Coils & accessories / Accessories', 'price' => 4.0,
        'variants' => $flavours(['1m', '2m'])]),
    $product(['name' => 'Washable Shisha Hose', 'brand' => 'HUQA', 'category' => 'Coils & accessories / Accessories', 'price' => 12.0,
        'description' => 'Silicone hose with an aluminium handle — rinse it and it is new again.', 'variants' => $flavours(['Black', 'Blue', 'Red'])]),
    $product(['name' => 'Coal Tongs & Tray Set', 'brand' => 'HUQA', 'category' => 'Coils & accessories / Accessories', 'price' => 8.0,
        'variants' => $flavours(['Stainless'])]),
    $product(['name' => 'Universal Silicone Case', 'category' => 'Coils & accessories / Accessories', 'price' => 5.0,
        'variants' => $flavours(['Black', 'Clear', ['Blue', false]])]),

    // Liquids
    $product(['name' => 'Nasty Juice Shisha Series', 'brand' => 'Nasty Juice', 'category' => 'Liquids / 3mg', 'price' => 14.0, 'bottleSize' => '60ml',
        'description' => 'Shisha flavours in a bottle, freebase, made for direct-lung tanks.',
        'variants' => $flavours(['Double Apple', 'Mint', 'Grape'], '3mg')]),
    $product(['name' => 'Dinner Lady Desserts', 'brand' => 'Dinner Lady', 'category' => 'Liquids / 3mg', 'price' => 16.0, 'bottleSize' => '60ml',
        'variants' => $flavours(['Lemon Tart', 'Strawberry Macaroon', ['Blackberry Crumble', false]], '3mg')]),
    $product(['name' => 'Vampire Vape Heisenberg', 'brand' => 'Vampire Vape', 'category' => 'Liquids / 3mg', 'price' => 22.0, 'bottleSize' => '100ml', 'featured' => true,
        'description' => 'Mixed berries and a cold finish. The one people rebuy without reading the label.',
        'variants' => $flavours(['Heisenberg', 'Pinkman'], '3mg')]),
    $product(['name' => 'Nasty Juice Slow Blow', 'brand' => 'Nasty Juice', 'category' => 'Liquids / 12mg', 'price' => 10.0, 'bottleSize' => '30ml',
        'variants' => $flavours(['Pineapple Lemonade', 'Mango'], '12mg')]),
    $product(['name' => 'Twelve Monkeys Kanzi', 'brand' => 'Twelve Monkeys', 'category' => 'Liquids / 12mg', 'price' => 11.0, 'bottleSize' => '30ml',
        'variants' => $flavours(['Kanzi Watermelon', 'Tropika'], '12mg')]),
    $product(['name' => 'Nasty Juice Cush Man', 'brand' => 'Nasty Juice', 'category' => 'Liquids / 18mg', 'price' => 10.0, 'bottleSize' => '30ml',
        'variants' => $flavours(['Mango', 'Mango Grape', 'Mango Banana'], '18mg')]),
    $product(['name' => 'Elf Liq Salt', 'brand' => 'Elf Bar', 'category' => 'Liquids / 25mg', 'price' => 12.0, 'bottleSize' => '30ml',
        'variants' => $flavours(['Watermelon', 'Blue Razz', 'Mango', 'Cream Tobacco'], '25mg')]),
    $product(['name' => 'Lost Mary Salt', 'brand' => 'Lost Mary', 'category' => 'Liquids / 25mg', 'price' => 12.0, 'bottleSize' => '30ml',
        'variants' => $flavours(['Blue Trio', 'Triple Mango'], '25mg')]),
    $product(['name' => 'Elf Liq Salt Strong', 'brand' => 'Elf Bar', 'category' => 'Liquids / 50mg', 'price' => 13.0, 'bottleSize' => '30ml',
        'description' => 'Same flavours, salt nicotine, for pod systems only.',
        'variants' => $flavours(['Watermelon', 'Blue Razz', ['Mango', false]], '50mg')]),
    $product(['name' => 'Bad Drip Salt', 'brand' => 'Bad Drip', 'category' => 'Liquids / 50mg', 'price' => 13.0, 'bottleSize' => '30ml',
        'variants' => $flavours(["Farley's Gnarly Sauce", 'Cereal Trip'], '50mg')]),

    // Nicotine pouches: flavours across exactly two strengths
    $product(['name' => 'Velo Pouches', 'brand' => 'Velo', 'category' => 'Nicotine pouches', 'price' => 6.0, 'featured' => true,
        'description' => 'Slim, dry pouches. Nothing to light, nothing to charge.',
        'variants' => array_merge($flavours(['Polar Mint', 'Ruby Berry', 'Citrus'], '6mg'),
                                  $flavours(['Polar Mint', 'Ruby Berry', ['Citrus', false]], '10mg'))]),
    $product(['name' => 'Zyn Pouches', 'brand' => 'Zyn', 'category' => 'Nicotine pouches', 'price' => 7.0,
        'variants' => array_merge($flavours(['Cool Mint', 'Spearmint', 'Citrus'], '6mg'),
                                  $flavours(['Cool Mint', 'Spearmint', 'Citrus'], '9mg'))]),
    $product(['name' => 'Pablo Pouches', 'brand' => 'Pablo', 'category' => 'Nicotine pouches', 'price' => 8.0,
        'description' => 'Not a beginner pouch. You will know within a minute.',
        'variants' => array_merge($flavours(['Ice Cold', 'Exclusive'], '30mg'),
                                  $flavours(['Ice Cold', ['Exclusive', false]], '50mg'))]),
];

$pick = function (string $name, string $label) use ($products): array {
    foreach ($products as $product) {
        if ($product['name'] !== $name) continue;
        foreach ($product['variants'] as $variant) {
            if ($variant['label'] === $label) return ['productId' => $product['id'], 'variantId' => $variant['id']];
        }
        return ['productId' => $product['id'], 'variantId' => $product['variants'][0]['id']];
    }
    throw new RuntimeException("Demo product not found: $name");
};

$bundles = [
    ['id' => $demoId(), 'name' => 'Two bars, one free', 'badge' => 'BUY 2 GET 1 FREE', 'active' => true,
     'mode' => 'items', 'value' => 0.0, 'image' => '', 'updatedAt' => $now,
     'description' => 'Take two Elf Bars and a Lost Mary goes in the bag for nothing.',
     'items' => [$pick('Elf Bar BC5000', 'Watermelon Ice') + ['quantity' => 2, 'free' => false],
                 $pick('Lost Mary OS5000', 'Blue Trio') + ['quantity' => 1, 'free' => true]]],
    ['id' => $demoId(), 'name' => 'Starter kit — everything to begin', 'badge' => '15% OFF', 'active' => true,
     'mode' => 'percent', 'value' => 15.0, 'image' => '', 'updatedAt' => $now,
     'description' => 'A mod, a pack of coils and a bottle of liquid. Walk out ready.',
     'items' => [$pick('Voopoo Drag X2', 'Black') + ['quantity' => 1, 'free' => false],
                 $pick('Voopoo PnP Coils (5-pack)', 'PnP-VM1 0.3ohm') + ['quantity' => 1, 'free' => false],
                 $pick('Nasty Juice Shisha Series', 'Double Apple') + ['quantity' => 1, 'free' => false]]],
    ['id' => $demoId(), 'name' => 'Shisha night pack', 'badge' => 'SET PRICE $30', 'active' => true,
     'mode' => 'fixed', 'value' => 30.0, 'image' => '', 'updatedAt' => $now,
     'description' => 'One HUQA bar, a washable hose and the tongs. Enough for a long evening.',
     'items' => [$pick('HUQA Shisha Bar 10000', 'Double Apple') + ['quantity' => 1, 'free' => false],
                 $pick('Washable Shisha Hose', 'Black') + ['quantity' => 1, 'free' => false],
                 $pick('Coal Tongs & Tray Set', 'Stainless') + ['quantity' => 1, 'free' => false]]],
];

// ---------------------------------------------------------------- demo orders
$line = fn(string $name, string $detail, int $quantity, float $unit, array $contents = []) => [
    'kind' => $contents ? 'bundle' : 'product', 'name' => $name, 'detail' => $detail,
    'quantity' => $quantity, 'unitPrice' => $unit, 'total' => round($unit * $quantity, 2), 'contents' => $contents,
];
$demoOrder = function (string $ref, int $agoMs, string $status, array $contact, array $lines) use ($now): array {
    $subtotal = round(array_sum(array_column($lines, 'total')), 2);
    $delivery = $subtotal >= 50 ? 0.0 : 3.0;
    return ['ref' => $ref, 'createdAt' => $now - $agoMs, 'status' => $status, 'contact' => $contact,
            'lines' => $lines, 'subtotal' => $subtotal, 'deliveryFee' => $delivery,
            'total' => round($subtotal + $delivery, 2), 'ip' => '192.0.2.' . (10 + $agoMs % 40)];
};
$day = 86400000;
$orders = [
    $demoOrder('HQ-DEMO01', 2 * 3600000, 'new',
        ['name' => 'Sami Khoury', 'phone' => '96171234567', 'area' => 'Beirut',
         'address' => "Hamra, Jeanne d'Arc street, Yamout building, 3rd floor, next to the pharmacy", 'note' => 'After 6pm please'],
        [$line('Elf Bar BC5000', 'Watermelon Ice · 50mg', 2, 12.5), $line('Velo Pouches', 'Polar Mint · 6mg', 1, 6.0)]),
    $demoOrder('HQ-DEMO02', 26 * 3600000, 'confirmed',
        ['name' => 'Rana Haddad', 'phone' => '96176445588', 'area' => 'Mount Lebanon',
         'address' => 'Jounieh, Sarba highway, Centre Mazloum, block B, 5th floor', 'note' => ''],
        [$line('Two bars, one free', 'BUY 2 GET 1 FREE', 1, 25.0,
            ['Elf Bar BC5000 — Watermelon Ice · 50mg × 2', 'Lost Mary OS5000 — Blue Trio · 50mg × 1 (free)']),
         $line('Nasty Juice Cush Man', 'Mango · 18mg · 30ml', 1, 10.0)]),
    $demoOrder('HQ-DEMO03', 4 * $day, 'delivered',
        ['name' => 'Elie Nassar', 'phone' => '96103998877', 'area' => 'North Lebanon',
         'address' => 'Tripoli, Azmi street, above the Byblos Bank branch, 2nd floor', 'note' => 'Call before coming up'],
        [$line('Voopoo Drag X2', 'Black', 1, 42.0), $line('Voopoo PnP Coils (5-pack)', 'PnP-VM1 0.3ohm', 2, 12.0)]),
    $demoOrder('HQ-DEMO04', 9 * $day, 'delivered',
        ['name' => 'Sami Khoury', 'phone' => '96171234567', 'area' => 'Beirut',
         'address' => "Hamra, Jeanne d'Arc street, Yamout building, 3rd floor, next to the pharmacy", 'note' => ''],
        [$line('HUQA Shisha Bar 10000', 'Double Apple', 1, 20.0), $line('Washable Shisha Hose', 'Black', 1, 12.0)]),
    $demoOrder('HQ-DEMO05', 12 * $day, 'cancelled',
        ['name' => 'Karim Mansour', 'phone' => '96181556677', 'area' => 'South Lebanon',
         'address' => 'Saida, Riad Solh street, Hammoud building, ground floor shop', 'note' => 'Changed his mind'],
        [$line('Geek Bar Pulse 15000', 'Miami Mint · 50mg', 1, 22.0)]),
];

// ---------------------------------------------------------------- write
data_dirs();

$keptProducts = array_values(array_filter(load_products(), fn($p) => !$isDemo($p)));
$keptBundles = array_values(array_filter(load_bundles(), fn($b) => !$isDemo($b)));

foreach ($orders as $order) {
    $file = DIR_ORDERS . '/' . order_filename_demo($order['createdAt'], $order['ref']);
    if ($clear) { @unlink($file); continue; }
    write_json($file, $order);
}

$customers = [];
$sorted = $orders;
usort($sorted, fn($a, $b) => $a['createdAt'] <=> $b['createdAt']);
foreach ($sorted as $order) {
    $phone = $order['contact']['phone'];
    $existing = $customers[$phone] ?? ['addresses' => [], 'orders' => [], 'orderCount' => 0, 'totalSpent' => 0.0,
                                       'firstOrderAt' => $order['createdAt']];
    $addresses = array_merge(
        [['area' => $order['contact']['area'], 'address' => $order['contact']['address'], 'lastUsed' => $order['createdAt']]],
        array_values(array_filter($existing['addresses'], fn($a) => $a['address'] !== $order['contact']['address'])),
    );
    $customers[$phone] = [
        'phone' => $phone, 'name' => $order['contact']['name'], 'addresses' => $addresses,
        'firstOrderAt' => $existing['firstOrderAt'], 'lastOrderAt' => $order['createdAt'],
        'orderCount' => $existing['orderCount'] + 1,
        'totalSpent' => round($existing['totalSpent'] + $order['total'], 2),
        'orders' => array_merge([['ref' => $order['ref'], 'createdAt' => $order['createdAt'], 'total' => $order['total'],
                                  'file' => order_filename_demo($order['createdAt'], $order['ref'])]], $existing['orders']),
        'lastIp' => $order['ip'],
    ];
}
foreach ($customers as $phone => $customer) {
    $file = DIR_CUSTOMERS . '/' . $phone . '.json';
    if ($clear) { @unlink($file); continue; }
    write_json($file, $customer);
}

if ($clear) {
    save_products($keptProducts);
    save_bundles($keptBundles);
    echo "Demo data removed. Your own products and orders were left alone.\n";
    exit;
}

save_products(array_merge($keptProducts, $products));
save_bundles(array_merge($keptBundles, $bundles));

// Only write settings when none exist, so a configured shop is never overwritten.
if (!is_file(PATH_SETTINGS)) {
    save_settings(array_merge(default_settings(), [
        'storeName' => 'HUQA', 'tagline' => 'Arguileh & Vapes', 'whatsapp' => '96171392434',
        'instagram' => 'huqa.lb', 'address' => 'Beirut, Lebanon', 'hours' => 'Every day, 10:00 – 23:00',
        'announcement' => 'Free delivery on orders over $50', 'deliveryFee' => 3.0,
        'freeDeliveryOver' => 50.0, 'published' => true,
    ]));
}

$variantCount = array_sum(array_map(fn($p) => count($p['variants']), $products));
printf("Seeded %d products (%d flavours/options), %d offers, %d orders and %d customer files.\n",
    count($products), $variantCount, count($bundles), count($orders), count($customers));
echo "\nOpen the shop, then /admin to create your username and password.\n";
echo $cli
    ? "Remove all of this again with: php seed-demo.php --clear\n"
    : "Remove all of this again with: seed-demo.php?clear=1\n\nDelete seed-demo.php when you are finished with it.\n";

function order_filename_demo(int $createdAt, string $ref): string {
    return str_pad((string)(9999999999999 - $createdAt), 13, '0', STR_PAD_LEFT) . '-' . $ref . '.json';
}
