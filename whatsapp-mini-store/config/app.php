<?php
$themeCatalog = [
    'modern' => ['name' => 'Modern', 'description' => 'Crisp and product-first'],
    'luxury' => ['name' => 'Luxury', 'description' => 'Editorial and refined'],
    'playful' => ['name' => 'Playful', 'description' => 'Bright and friendly'],
    'minimal' => ['name' => 'Minimal', 'description' => 'Quiet, airy, and focused'],
    'boutique' => ['name' => 'Boutique', 'description' => 'Soft and curated'],
    'bold' => ['name' => 'Bold', 'description' => 'Graphic and high-impact'],
    'editorial' => ['name' => 'Editorial', 'description' => 'Magazine-led storytelling'],
    'natural' => ['name' => 'Natural', 'description' => 'Warm and organic'],
    'tech' => ['name' => 'Tech', 'description' => 'Precise and futuristic'],
    'streetwear' => ['name' => 'Streetwear', 'description' => 'Raw and energetic'],
    'beauty' => ['name' => 'Beauty', 'description' => 'Polished and delicate'],
    'artisan' => ['name' => 'Artisan', 'description' => 'Handmade and tactile'],
    'classic' => ['name' => 'Classic', 'description' => 'Timeless and trustworthy'],
    'vibrant' => ['name' => 'Vibrant', 'description' => 'Colorful and expressive'],
    'monochrome' => ['name' => 'Monochrome', 'description' => 'Black, white, and sharp'],
];

return [
    'name' => App\Support\Env::get('APP_NAME', 'MiniStore'),
    'url' => rtrim(App\Support\Env::get('APP_URL', 'http://localhost'), '/'),
    'root_domain' => mb_strtolower(trim(App\Support\Env::get('APP_ROOT_DOMAIN', ''), " \t\n\r\0\x0B./")),
    'marketing_url' => rtrim(App\Support\Env::get('APP_MARKETING_URL', App\Support\Env::get('APP_URL', 'http://localhost')), '/'),
    'env' => App\Support\Env::get('APP_ENV', 'production'),
    'reserved_slugs' => [
        'admin', 'super-admin', 'login', 'logout', 'register', 'api', 'assets',
        'uploads', 'dashboard', 'checkout', 'cart', 'support', 'password',
        'email', 'onboarding', 'store', 'stores', 'storefront', 'merchant', 'sa', 'product', 'products', 'robots', 'sitemap',
    ],
    'themes' => array_keys($themeCatalog),
    'theme_catalog' => $themeCatalog,
    'fonts' => ['system' => 'Clean Sans', 'editorial' => 'Editorial Serif', 'rounded' => 'Friendly Rounded'],
    'currencies' => ['USD', 'LBP', 'EUR', 'GBP'],
    'countries' => ['LB' => 'Lebanon', 'US' => 'United States', 'GB' => 'United Kingdom', 'FR' => 'France', 'AE' => 'United Arab Emirates'],
];
