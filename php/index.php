<?php
declare(strict_types=1);

// Everything enters here. The .htaccess next to this file sends every URL to it,
// and PATH_INFO is the fallback when a host will not rewrite.
// PHP's built-in server (`php -S`) runs this router for every request, including
// the stylesheet and script. Hand real files straight back to it; a real host
// does the same through .htaccess and never reaches this.
if (PHP_SAPI === 'cli-server') {
    $requested = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $candidate = realpath(__DIR__ . '/' . ltrim(rawurldecode($requested), '/'));
    $inside = $candidate !== false && str_starts_with($candidate, __DIR__ . DIRECTORY_SEPARATOR);
    $private = $inside && preg_match('#^' . preg_quote(__DIR__ . DIRECTORY_SEPARATOR, '#') . '(src|data)#', $candidate);
    if ($inside && !$private && is_file($candidate) && basename($candidate) !== 'index.php') {
        return false;
    }
}

require __DIR__ . '/src/config.php';
require __DIR__ . '/src/model.php';
require __DIR__ . '/src/store.php';
require __DIR__ . '/src/auth.php';
require __DIR__ . '/src/orders.php';

mb_internal_encoding('UTF-8');
date_default_timezone_set('Asia/Beirut');

function current_path(): string {
    $path = $_GET['_route'] ?? $_SERVER['PATH_INFO'] ?? null;
    if ($path === null) {
        $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        $base = base_path();
        $path = $base !== '' && str_starts_with($uri, $base) ? substr($uri, strlen($base)) : $uri;
    }
    $path = '/' . trim((string)$path, '/');
    return $path === '/' ? '/' : rtrim($path, '/');
}

function render(string $view, array $data = [], string $layout = 'layout'): void {
    extract($data, EXTR_SKIP);
    ob_start();
    require __DIR__ . "/src/views/$view.php";
    $content = ob_get_clean();
    require __DIR__ . "/src/views/$layout.php";
}

function redirect(string $path): never {
    header('Location: ' . url($path));
    exit;
}

function not_found(string $message = 'That page does not exist.'): never {
    http_response_code(404);
    render('message', ['settings' => load_settings(), 'title' => 'Not found', 'message' => $message]);
    exit;
}

/** The shop hides behind a coming-soon page until it is switched live. */
function require_published(array $settings): void {
    if (empty($settings['published'])) {
        http_response_code(503);
        render('coming-soon', ['settings' => $settings], 'bare');
        exit;
    }
}

function flash(?string $message = null): ?string {
    start_session();
    if ($message !== null) { $_SESSION['flash'] = $message; return null; }
    $value = $_SESSION['flash'] ?? null;
    unset($_SESSION['flash']);
    return $value;
}

$path = current_path();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    data_dirs();

    // ------------------------------------------------------------ images
    if ($path === '/image') {
        $id = (string)($_GET['id'] ?? '');
        $file = image_path($id);
        if ($file === null) not_found('That image does not exist.');
        $public = image_is_public($id);
        if (!$public && current_admin() === null) {
            http_response_code(403);
            exit('Not available.');
        }
        header('Content-Type: ' . image_mime($file));
        header('Content-Length: ' . (string)filesize($file));
        header('X-Content-Type-Options: nosniff');
        // The id never changes for a given file, so it can be cached hard.
        header($public ? 'Cache-Control: public, max-age=31536000, immutable' : 'Cache-Control: private, no-store');
        readfile($file);
        exit;
    }

    // ------------------------------------------------------------ admin
    if ($path === '/admin' || str_starts_with($path, '/admin/')) {
        require __DIR__ . '/src/admin.php';
        handle_admin(substr($path, 6) ?: '/', $method);
        exit;
    }

    // ------------------------------------------------------------ shop
    $settings = load_settings();

    if ($path === '/') {
        require_published($settings);
        $products = load_products();
        $bundles = active_bundles();
        $featured = array_values(array_filter($products, fn($p) => !empty($p['featured']) && in_stock($p)));
        $newest = $products;
        usort($newest, fn($a, $b) => ($b['updatedAt'] ?? 0) <=> ($a['updatedAt'] ?? 0));
        render('home', [
            'settings' => $settings, 'products' => $products, 'bundles' => $bundles,
            'shelf' => array_slice(count($featured) >= 4 ? $featured : $newest, 0, 8),
            'shelfTitle' => count($featured) >= 4 ? 'Picked for you' : 'Just added',
            'huqa' => array_values(array_filter($products, 'is_huqa_brand')),
            'title' => $settings['storeName'] . ' — ' . $settings['tagline'],
        ]);
        exit;
    }

    if (preg_match('#^/shop/([a-z-]+)$#', $path, $m)) {
        require_published($settings);
        $section = section_by_slug($m[1]);
        if (!$section) not_found('That part of the shop does not exist.');
        render('section', [
            'settings' => $settings, 'products' => load_products(), 'bundles' => active_bundles(),
            'section' => $section, 'facet' => (string)($_GET['f'] ?? ''),
            'title' => $section['title'],
        ]);
        exit;
    }

    if (preg_match('#^/product/([a-f0-9-]{36})$#', $path, $m)) {
        require_published($settings);
        $products = load_products();
        $product = find_product($products, $m[1]);
        if (!$product) not_found('That product is no longer in the shop.');
        $related = array_values(array_filter($products, fn($p) =>
            $p['id'] !== $product['id'] && $p['category'] === $product['category']));
        render('product', [
            'settings' => $settings, 'products' => $products, 'bundles' => active_bundles(),
            'product' => $product, 'related' => array_slice($related, 0, 4),
            'title' => $product['name'],
        ]);
        exit;
    }

    if ($path === '/bundles') {
        require_published($settings);
        render('bundles', [
            'settings' => $settings, 'products' => load_products(), 'bundles' => active_bundles(),
            'title' => 'Bundles & Offers',
        ]);
        exit;
    }

    if ($path === '/huqa') {
        require_published($settings);
        $products = load_products();
        render('huqa', [
            'settings' => $settings, 'products' => $products, 'bundles' => active_bundles(),
            'mine' => array_values(array_filter($products, 'is_huqa_brand')),
            'title' => 'HUQA Shisha',
        ]);
        exit;
    }

    if ($path === '/search') {
        require_published($settings);
        $products = load_products();
        $bundles = active_bundles();
        $query = mb_substr(trim((string)($_GET['q'] ?? '')), 0, 80);
        $direct = search_products($products, $query);
        $suggestion = $direct || $query === '' ? null : correct_query($query, search_vocabulary($products));
        $forced = ($_GET['exact'] ?? '') === '1';
        $effective = (!$direct && $suggestion !== null && !$forced) ? $suggestion : $query;
        render('search', [
            'settings' => $settings, 'products' => $products, 'bundles' => $bundles,
            'query' => $query, 'effective' => $effective,
            'results' => $effective === $query ? $direct : search_products($products, $effective),
            'offers' => search_bundles($bundles, $effective),
            'title' => 'Search',
        ]);
        exit;
    }

    if ($path === '/checkout') {
        require_published($settings);
        if ($method === 'POST') {
            check_origin();
            $cart = json_decode((string)($_POST['cart'] ?? '[]'), true);
            if (!is_array($cart)) $cart = [];
            try {
                $contact = validate_contact($_POST);
                $order = build_order($cart, $contact, $settings, load_products(), active_bundles());
                record_order($order);
                start_session();
                $_SESSION['placed'] = $order;
                redirect('/checkout?done=' . $order['ref']);
            } catch (Throwable $e) {
                render('checkout', [
                    'settings' => $settings, 'products' => load_products(), 'bundles' => active_bundles(),
                    'error' => $e->getMessage(), 'old' => $_POST, 'title' => 'Checkout',
                ]);
                exit;
            }
        }
        start_session();
        if (isset($_GET['done']) && !empty($_SESSION['placed'])) {
            $order = $_SESSION['placed'];
            unset($_SESSION['placed']);
            render('placed', [
                'settings' => $settings, 'products' => load_products(), 'bundles' => active_bundles(),
                'order' => $order,
                'whatsapp' => whatsapp_link($settings['whatsapp'], order_message($settings, $order)),
                'title' => 'Order ' . $order['ref'],
            ]);
            exit;
        }
        render('checkout', [
            'settings' => $settings, 'products' => load_products(), 'bundles' => active_bundles(),
            'error' => null, 'old' => [], 'title' => 'Checkout',
        ]);
        exit;
    }

    not_found();
} catch (Throwable $e) {
    error_log('HUQA: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    http_response_code(500);
    render('message', [
        'settings' => load_settings(),
        'title' => 'Something went wrong',
        'message' => 'Something went wrong on our side. Please try again in a moment.',
    ]);
}
