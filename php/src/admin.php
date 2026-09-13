<?php
declare(strict_types=1);

function admin_render(string $view, array $data = []): void {
    $data['admin'] = current_admin();
    $data['flash'] = flash();
    render($view, $data, 'admin-layout');
}

function admin_redirect(string $path, ?string $message = null): never {
    if ($message !== null) flash($message);
    header('Location: ' . url('/admin' . $path));
    exit;
}

function handle_admin(string $path, string $method): void {
    // ---------------------------------------------------------- signed out
    if (current_admin() === null) {
        if ($method === 'POST') {
            try {
                check_csrf();
                $action = (string)($_POST['action'] ?? '');
                if ($action === 'setup') {
                    $code = create_admin(trim((string)($_POST['username'] ?? '')), (string)($_POST['password'] ?? ''));
                    start_session();
                    $_SESSION['recovery'] = $code;
                    admin_redirect('/');
                }
                if ($action === 'recover') {
                    $code = recover_admin(
                        (string)($_POST['code'] ?? ''),
                        trim((string)($_POST['username'] ?? '')),
                        (string)($_POST['password'] ?? ''),
                    );
                    start_session();
                    $_SESSION['recovery'] = $code;
                    admin_redirect('/');
                }
                attempt_login(trim((string)($_POST['username'] ?? '')), (string)($_POST['password'] ?? ''));
                admin_redirect('/');
            } catch (Throwable $e) {
                render('admin-login', ['error' => $e->getMessage(), 'setup' => !admin_exists(),
                    'recover' => ($_POST['action'] ?? '') === 'recover', 'title' => 'Sign in'], 'bare');
                exit;
            }
        }
        render('admin-login', ['error' => null, 'setup' => !admin_exists(),
            'recover' => isset($_GET['recover']), 'title' => 'Sign in'], 'bare');
        exit;
    }

    // ---------------------------------------------------------- signed in
    if ($method === 'POST') {
        try {
            check_csrf();
            handle_admin_post($path);
        } catch (Throwable $e) {
            flash($e->getMessage());
            admin_redirect($_POST['_back'] ?? '/');
        }
    }

    $products = load_products();

    switch ($path) {
        case '/':
        case '/products':
            $query = trim((string)($_GET['q'] ?? ''));
            $category = (string)($_GET['category'] ?? '');
            $shown = array_values(array_filter($products, fn($p) =>
                ($category === '' || str_starts_with($p['category'], $category))
                && ($query === '' || text_matches(product_haystack($p), $query))));
            usort($shown, fn($a, $b) => ($b['updatedAt'] ?? 0) <=> ($a['updatedAt'] ?? 0));
            admin_render('admin-products', ['products' => $products, 'shown' => $shown,
                'query' => $query, 'category' => $category, 'bundles' => load_bundles(),
                'settings' => load_settings(), 'title' => 'Inventory', 'section' => 'products']);
            return;

        case '/product':
            $id = (string)($_GET['id'] ?? '');
            $product = $id === '' ? null : find_product($products, $id);
            if ($id !== '' && !$product) admin_redirect('/products', 'That product no longer exists.');
            admin_render('admin-product', ['product' => $product, 'products' => $products,
                'bundles' => load_bundles(), 'settings' => load_settings(),
                'title' => $product ? 'Edit product' : 'New product', 'section' => 'products']);
            return;

        case '/bundles':
            admin_render('admin-bundles', ['products' => $products, 'bundles' => load_bundles(),
                'settings' => load_settings(), 'title' => 'Offers', 'section' => 'bundles']);
            return;

        case '/bundle':
            $id = (string)($_GET['id'] ?? '');
            $bundles = load_bundles();
            $bundle = null;
            foreach ($bundles as $candidate) if ($candidate['id'] === $id) $bundle = $candidate;
            if ($id !== '' && !$bundle) admin_redirect('/bundles', 'That offer no longer exists.');
            admin_render('admin-bundle', ['bundle' => $bundle, 'products' => $products,
                'bundles' => $bundles, 'settings' => load_settings(),
                'title' => $bundle ? 'Edit offer' : 'New offer', 'section' => 'bundles']);
            return;

        case '/orders':
            $status = (string)($_GET['status'] ?? '');
            $query = trim((string)($_GET['q'] ?? ''));
            $orders = list_orders();
            $shown = array_values(array_filter($orders, function ($order) use ($status, $query) {
                if ($status !== '' && ($order['status'] ?? '') !== $status) return false;
                if ($query === '') return true;
                $hay = $order['ref'] . ' ' . $order['contact']['name'] . ' ' . $order['contact']['phone']
                    . ' ' . $order['contact']['area'] . ' ' . $order['contact']['address'];
                foreach ($order['lines'] as $line) $hay .= ' ' . $line['name'];
                return text_matches($hay, $query);
            }));
            admin_render('admin-orders', ['orders' => $orders, 'shown' => $shown, 'status' => $status,
                'query' => $query, 'products' => $products, 'bundles' => load_bundles(),
                'settings' => load_settings(), 'title' => 'Orders', 'section' => 'orders']);
            return;

        case '/order':
            $order = read_order((string)($_GET['file'] ?? ''));
            if (!$order) admin_redirect('/orders', 'That order could not be found.');
            admin_render('admin-order', ['order' => $order, 'products' => $products,
                'bundles' => load_bundles(), 'settings' => load_settings(),
                'title' => 'Order ' . $order['ref'], 'section' => 'orders']);
            return;

        case '/customers':
            $query = trim((string)($_GET['q'] ?? ''));
            $customers = list_customers();
            $shown = array_values(array_filter($customers, function ($customer) use ($query) {
                if ($query === '') return true;
                $hay = $customer['name'] . ' ' . $customer['phone'];
                foreach ($customer['addresses'] ?? [] as $address) $hay .= ' ' . $address['area'] . ' ' . $address['address'];
                return text_matches($hay, $query);
            }));
            admin_render('admin-customers', ['customers' => $customers, 'shown' => $shown, 'query' => $query,
                'products' => $products, 'bundles' => load_bundles(), 'settings' => load_settings(),
                'title' => 'Customers', 'section' => 'customers']);
            return;

        case '/customer':
            $customer = read_customer((string)($_GET['phone'] ?? ''));
            if (!$customer) admin_redirect('/customers', 'That customer file could not be found.');
            admin_render('admin-customer', ['customer' => $customer, 'products' => $products,
                'bundles' => load_bundles(), 'settings' => load_settings(),
                'title' => $customer['name'], 'section' => 'customers']);
            return;

        case '/settings':
            admin_render('admin-settings', ['products' => $products, 'bundles' => load_bundles(),
                'settings' => load_settings(), 'title' => 'Storefront', 'section' => 'settings']);
            return;

        case '/account':
            start_session();
            $recovery = $_SESSION['recovery'] ?? null;
            unset($_SESSION['recovery']);
            admin_render('admin-account', ['products' => $products, 'bundles' => load_bundles(),
                'settings' => load_settings(), 'recovery' => $recovery,
                'title' => 'Admin account', 'section' => 'account']);
            return;
    }

    admin_redirect('/', 'That admin page does not exist.');
}

function handle_admin_post(string $path): never {
    $products = load_products();

    switch ($path) {
        case '/logout':
            sign_out();
            header('Location: ' . url('/admin'));
            exit;

        case '/product/save':
            $id = (string)($_POST['id'] ?? '');
            $existing = $id === '' ? null : find_product($products, $id);
            if ($id !== '' && !$existing) admin_redirect('/products', 'That product no longer exists.');
            $input = $_POST;
            // A new upload replaces whatever image the product had.
            if (!empty($_FILES['photo']['name'])) {
                $input['image'] = store_uploaded_image($_FILES['photo']);
                if ($existing && ($existing['image'] ?? '') !== '') delete_image($existing['image']);
            } elseif (!empty($_POST['removeImage'])) {
                if ($existing && ($existing['image'] ?? '') !== '') delete_image($existing['image']);
                $input['image'] = '';
            } else {
                $input['image'] = $existing['image'] ?? '';
            }
            $product = validate_product($input, $existing);
            with_lock('products', function () use ($product, $existing) {
                $all = load_products();
                if ($existing) {
                    foreach ($all as $i => $row) if ($row['id'] === $product['id']) { $all[$i] = $product; break; }
                } else {
                    $all[] = $product;
                }
                save_products($all);
                return null;
            });
            admin_redirect('/products', 'Saved “' . $product['name'] . '”.');

        case '/product/delete':
            $id = (string)($_POST['id'] ?? '');
            foreach (load_bundles() as $bundle) {
                foreach ($bundle['items'] as $item) {
                    if ($item['productId'] === $id) {
                        admin_redirect('/products', '“' . $bundle['name'] . '” includes this product. Remove it from that offer first.');
                    }
                }
            }
            with_lock('products', function () use ($id) {
                $all = load_products();
                foreach ($all as $row) if ($row['id'] === $id && ($row['image'] ?? '') !== '') delete_image($row['image']);
                save_products(array_filter($all, fn($row) => $row['id'] !== $id));
                return null;
            });
            admin_redirect('/products', 'Product deleted.');

        case '/bundle/save':
            $id = (string)($_POST['id'] ?? '');
            $bundles = load_bundles();
            $existing = null;
            foreach ($bundles as $candidate) if ($candidate['id'] === $id) $existing = $candidate;
            $input = $_POST;
            $input['items'] = json_decode((string)($_POST['items'] ?? '[]'), true) ?: [];
            if (!empty($_FILES['photo']['name'])) {
                $input['image'] = store_uploaded_image($_FILES['photo']);
                if ($existing && ($existing['image'] ?? '') !== '') delete_image($existing['image']);
            } elseif (!empty($_POST['removeImage'])) {
                if ($existing && ($existing['image'] ?? '') !== '') delete_image($existing['image']);
                $input['image'] = '';
            } else {
                $input['image'] = $existing['image'] ?? '';
            }
            $bundle = validate_bundle($input, $existing, $products);
            with_lock('bundles', function () use ($bundle, $existing) {
                $all = load_bundles();
                if ($existing) {
                    foreach ($all as $i => $row) if ($row['id'] === $bundle['id']) { $all[$i] = $bundle; break; }
                } else {
                    $all[] = $bundle;
                }
                save_bundles($all);
                return null;
            });
            admin_redirect('/bundles', 'Saved “' . $bundle['name'] . '”.');

        case '/bundle/delete':
            $id = (string)($_POST['id'] ?? '');
            with_lock('bundles', function () use ($id) {
                $all = load_bundles();
                foreach ($all as $row) if ($row['id'] === $id && ($row['image'] ?? '') !== '') delete_image($row['image']);
                save_bundles(array_filter($all, fn($row) => $row['id'] !== $id));
                return null;
            });
            admin_redirect('/bundles', 'Offer deleted.');

        case '/order/status':
            $order = set_order_status((string)($_POST['file'] ?? ''), (string)($_POST['status'] ?? ''));
            admin_redirect('/order?file=' . rawurlencode((string)$_POST['file']), 'Order ' . $order['ref'] . ' marked ' . $order['status'] . '.');

        case '/settings/save':
            save_settings(validate_settings($_POST));
            admin_redirect('/settings', 'Storefront saved.');

        case '/account/save':
            change_credentials(
                (string)($_POST['currentPassword'] ?? ''),
                trim((string)($_POST['username'] ?? '')),
                (string)($_POST['password'] ?? ''),
            );
            admin_redirect('/account', 'Your login has been updated.');
    }

    admin_redirect('/', 'Unknown action.');
}
