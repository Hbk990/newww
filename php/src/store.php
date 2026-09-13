<?php
declare(strict_types=1);

function default_settings(): array {
    return [
        'storeName' => 'HUQA', 'tagline' => 'Arguileh & Vapes', 'whatsapp' => '96171392434',
        'instagram' => '', 'address' => '', 'hours' => '', 'announcement' => '',
        'deliveryFee' => 0.0, 'freeDeliveryOver' => 0.0, 'published' => false,
    ];
}

function load_settings(): array {
    $stored = read_json(PATH_SETTINGS, []);
    return is_array($stored) ? array_merge(default_settings(), $stored) : default_settings();
}

function save_settings(array $settings): void { write_json(PATH_SETTINGS, $settings); }

function load_products(): array {
    $rows = read_json(PATH_PRODUCTS, []);
    return is_array($rows) ? array_values($rows) : [];
}

function load_bundles(): array {
    $rows = read_json(PATH_BUNDLES, []);
    return is_array($rows) ? array_values($rows) : [];
}

function active_bundles(): array {
    return array_values(array_filter(load_bundles(), fn($b) => !empty($b['active'])));
}

function find_product(array $products, string $id): ?array {
    foreach ($products as $product) if (($product['id'] ?? '') === $id) return $product;
    return null;
}

function save_products(array $products): void { write_json(PATH_PRODUCTS, array_values($products)); }
function save_bundles(array $bundles): void { write_json(PATH_BUNDLES, array_values($bundles)); }

// ---------------------------------------------------------------- validation

function field(array $input, string $key, int $max, bool $required = false): string {
    $value = $input[$key] ?? '';
    if (!is_string($value)) throw new InvalidArgumentException("Invalid $key.");
    $value = trim($value);
    if (mb_strlen($value) > $max) throw new InvalidArgumentException(ucfirst($key) . " is too long (max $max characters).");
    if ($required && $value === '') throw new InvalidArgumentException('Please fill in the ' . $key . '.');
    return $value;
}

function cash(mixed $value, float $max, string $label): float {
    if (!is_numeric($value)) throw new InvalidArgumentException("Enter a valid amount for $label.");
    $number = round((float)$value, 2);
    if ($number < 0 || $number > $max) throw new InvalidArgumentException("Enter a valid amount for $label.");
    return $number;
}

/** Builds a clean product from submitted form data, or throws with a readable reason. */
function validate_product(array $input, ?array $existing): array {
    $category = (string)($input['category'] ?? '');
    if (!in_array($category, CATEGORIES, true) && !in_array($category, LEGACY_CATEGORIES, true)) {
        throw new InvalidArgumentException('Choose a category.');
    }
    $bottleSize = '';
    if (str_starts_with($category, 'Liquids / ')) {
        $bottleSize = (string)($input['bottleSize'] ?? '');
        if (!in_array($bottleSize, BOTTLE_SIZES, true)) {
            throw new InvalidArgumentException('Choose a bottle size: 30ml, 60ml, 100ml or 120ml.');
        }
    }
    $image = field($input, 'image', 200);
    if ($image !== '' && !preg_match('/^[a-f0-9-]{36}$/', $image)) {
        throw new InvalidArgumentException('That image reference is not valid.');
    }

    $rawVariants = $input['variants'] ?? [];
    if (!is_array($rawVariants)) $rawVariants = [];
    $variants = [];
    $seen = [];
    foreach ($rawVariants as $raw) {
        if (!is_array($raw)) continue;
        $label = trim((string)($raw['label'] ?? ''));
        if ($label === '') continue;                       // blank rows are dropped, not an error
        if (mb_strlen($label) > 120) throw new InvalidArgumentException('A flavour name is too long.');
        $strength = trim((string)($raw['strength'] ?? ''));
        if (mb_strlen($strength) > 30) throw new InvalidArgumentException('A strength is too long.');
        $key = mb_strtolower($label) . '|' . mb_strtolower($strength);
        if (isset($seen[$key])) {
            throw new InvalidArgumentException('The same flavour and strength cannot be repeated in one product.');
        }
        $seen[$key] = true;
        $id = (string)($raw['id'] ?? '');
        $variants[] = [
            'id' => preg_match('/^[a-f0-9-]{36}$/', $id) ? $id : uuid(),
            'label' => $label,
            'strength' => $strength,
            'available' => !empty($raw['available']),
        ];
    }
    if (!$variants) throw new InvalidArgumentException('Add at least one flavour or option.');
    if (count($variants) > 100) throw new InvalidArgumentException('That is more than 100 flavours.');
    if ($category === 'Nicotine pouches') {
        $strengths = array_unique(array_filter(array_column($variants, 'strength')));
        if (count($strengths) > 2) throw new InvalidArgumentException('Use at most two nicotine strengths per pouch model.');
    }

    return [
        'id' => $existing['id'] ?? uuid(),
        'name' => field($input, 'name', 150, true),
        'brand' => field($input, 'brand', 100),
        'category' => $category,
        'bottleSize' => $bottleSize,
        'price' => cash($input['price'] ?? '', 1000000, 'price'),
        'description' => field($input, 'description', 3000),
        'image' => $image,
        'featured' => !empty($input['featured']),
        'variants' => $variants,
        'updatedAt' => time() * 1000,
    ];
}

function validate_bundle(array $input, ?array $existing, array $products): array {
    $mode = (string)($input['mode'] ?? 'items');
    if (!in_array($mode, ['items', 'fixed', 'percent'], true)) {
        throw new InvalidArgumentException('Choose how the offer is priced.');
    }
    $items = [];
    $rawItems = is_array($input['items'] ?? null) ? $input['items'] : [];
    foreach ($rawItems as $raw) {
        if (!is_array($raw)) continue;
        $productId = (string)($raw['productId'] ?? '');
        $variantId = (string)($raw['variantId'] ?? '');
        if ($productId === '' || $variantId === '') continue;
        $product = find_product($products, $productId);
        if (!$product) throw new InvalidArgumentException('One of the products in this offer no longer exists.');
        $known = false;
        foreach ($product['variants'] as $variant) if ($variant['id'] === $variantId) { $known = true; break; }
        if (!$known) throw new InvalidArgumentException('One of the flavours in this offer no longer exists.');
        $quantity = (int)($raw['quantity'] ?? 1);
        if ($quantity < 1 || $quantity > 99) throw new InvalidArgumentException('Quantities must be between 1 and 99.');
        $items[] = ['productId' => $productId, 'variantId' => $variantId, 'quantity' => $quantity, 'free' => !empty($raw['free'])];
    }
    if (count($items) < 2) throw new InvalidArgumentException('An offer needs at least two items.');
    if (count($items) > 20) throw new InvalidArgumentException('An offer can hold at most 20 items.');

    $free = array_filter($items, fn($i) => $i['free']);
    if ($mode === 'items' && !$free) throw new InvalidArgumentException('Mark at least one item free, or price the offer another way.');
    if ($mode === 'items' && count($free) === count($items)) throw new InvalidArgumentException('At least one item has to be paid for.');

    $value = 0.0;
    if ($mode === 'percent') {
        $value = cash($input['value'] ?? '', 100, 'discount');
        if ($value <= 0) throw new InvalidArgumentException('Enter a discount between 0 and 100 percent.');
    } elseif ($mode === 'fixed') {
        $value = cash($input['value'] ?? '', 1000000, 'bundle price');
    }

    $image = field($input, 'image', 200);
    if ($image !== '' && !preg_match('/^[a-f0-9-]{36}$/', $image)) {
        throw new InvalidArgumentException('That image reference is not valid.');
    }

    return [
        'id' => $existing['id'] ?? uuid(),
        'name' => field($input, 'name', 120, true),
        'badge' => field($input, 'badge', 40),
        'description' => field($input, 'description', 1000),
        'image' => $image,
        'items' => $items,
        'mode' => $mode,
        'value' => $value,
        'active' => !empty($input['active']),
        'updatedAt' => time() * 1000,
    ];
}

function validate_settings(array $input): array {
    $whatsapp = preg_replace('/[\s()+-]/', '', field($input, 'whatsapp', 24, true)) ?? '';
    $whatsapp = preg_replace('/^00/', '', $whatsapp) ?? '';
    if (!preg_match('/^[0-9]{8,15}$/', $whatsapp)) {
        throw new InvalidArgumentException('Enter the WhatsApp number in international format — for example 96171392434.');
    }
    $instagram = ltrim(field($input, 'instagram', 60), '@');
    if ($instagram !== '' && !preg_match('/^[A-Za-z0-9._]{1,30}$/', $instagram)) {
        throw new InvalidArgumentException('Enter a valid Instagram handle.');
    }
    return [
        'storeName' => field($input, 'storeName', 80, true),
        'tagline' => field($input, 'tagline', 160),
        'whatsapp' => $whatsapp,
        'instagram' => $instagram,
        'address' => field($input, 'address', 200),
        'hours' => field($input, 'hours', 120),
        'announcement' => field($input, 'announcement', 200),
        'deliveryFee' => cash($input['deliveryFee'] ?? 0, 1000, 'delivery fee'),
        'freeDeliveryOver' => cash($input['freeDeliveryOver'] ?? 0, 100000, 'free delivery threshold'),
        'published' => !empty($input['published']),
    ];
}

// ---------------------------------------------------------------- images

/** Only images a product or offer actually points at are public. */
function image_is_public(string $id): bool {
    $settings = load_settings();
    if (empty($settings['published'])) return false;
    foreach (load_products() as $product) if (($product['image'] ?? '') === $id) return true;
    foreach (load_bundles() as $bundle) if (($bundle['image'] ?? '') === $id) return true;
    return false;
}

function image_path(string $id): ?string {
    if (!preg_match('/^[a-f0-9-]{36}$/', $id)) return null;
    foreach (['png', 'jpg', 'webp'] as $extension) {
        $file = DIR_IMAGES . "/$id.$extension";
        if (is_file($file)) return $file;
    }
    return null;
}

/** Sniffs the real bytes rather than trusting what the upload claims to be. */
function store_uploaded_image(array $file): string {
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        throw new InvalidArgumentException('That image did not upload. Try a smaller file.');
    }
    if (($file['size'] ?? 0) > MAX_IMAGE_BYTES) {
        throw new InvalidArgumentException('Choose an image under 5 MB.');
    }
    $tmp = $file['tmp_name'] ?? '';
    if ($tmp === '' || !is_readable($tmp)) throw new InvalidArgumentException('That image could not be read.');

    $head = (string)file_get_contents($tmp, false, null, 0, 16);
    $png  = str_starts_with($head, "\x89PNG\r\n\x1a\n");
    $jpeg = str_starts_with($head, "\xFF\xD8\xFF");
    $webp = str_starts_with($head, 'RIFF') && substr($head, 8, 4) === 'WEBP';
    $extension = $png ? 'png' : ($jpeg ? 'jpg' : ($webp ? 'webp' : null));
    if ($extension === null) {
        throw new InvalidArgumentException('Only PNG, JPEG and WebP images are supported.');
    }

    data_dirs();
    $id = uuid();
    $target = DIR_IMAGES . "/$id.$extension";
    $moved = is_uploaded_file($tmp) ? @move_uploaded_file($tmp, $target) : @rename($tmp, $target);
    if (!$moved) throw new RuntimeException('Could not save the image. Check the folder permissions.');
    @chmod($target, 0660);
    return $id;
}

function delete_image(string $id): void {
    $file = image_path($id);
    if ($file !== null) @unlink($file);
}

function image_mime(string $file): string {
    return match (strtolower(pathinfo($file, PATHINFO_EXTENSION))) {
        'png' => 'image/png',
        'webp' => 'image/webp',
        default => 'image/jpeg',
    };
}
