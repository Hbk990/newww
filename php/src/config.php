<?php
declare(strict_types=1);

// Everything the shop keeps lives under this folder. Move it above public_html
// on a real host if you can; the .htaccess inside blocks web access either way.
const DATA_DIR = __DIR__ . '/../data';

const PATH_PRODUCTS  = DATA_DIR . '/products.json';
const PATH_BUNDLES   = DATA_DIR . '/bundles.json';
const PATH_SETTINGS  = DATA_DIR . '/settings.json';
const PATH_ADMIN     = DATA_DIR . '/admin.json';
const DIR_ORDERS     = DATA_DIR . '/orders';
const DIR_CUSTOMERS  = DATA_DIR . '/customers';
const DIR_IMAGES     = DATA_DIR . '/images';

const SESSION_NAME    = 'huqa_admin';
const SESSION_MINUTES = 480;
const LOCKOUT_TRIES   = 5;
const LOCKOUT_MINUTES = 15;
const MAX_IMAGE_BYTES = 5_000_000;

function data_dirs(): void {
    foreach ([DATA_DIR, DIR_ORDERS, DIR_CUSTOMERS, DIR_IMAGES] as $dir) {
        if (!is_dir($dir) && !@mkdir($dir, 0770, true) && !is_dir($dir)) {
            throw new RuntimeException("Could not create $dir. Check the folder permissions.");
        }
    }
    // Belt and braces: even if the data folder ends up inside public_html, the
    // web server refuses to serve anything out of it.
    $guard = DATA_DIR . '/.htaccess';
    if (!is_file($guard)) {
        @file_put_contents($guard, "Require all denied\n<IfModule !mod_authz_core.c>\n  Deny from all\n</IfModule>\n");
    }
}

/** Reads a JSON file, returning $fallback when it is missing or unreadable. */
function read_json(string $file, mixed $fallback = null): mixed {
    if (!is_file($file)) return $fallback;
    $raw = @file_get_contents($file);
    if ($raw === false || $raw === '') return $fallback;
    try {
        return json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        return $fallback;
    }
}

/**
 * Writes JSON by filling a temporary file and renaming it over the target, so a
 * crash or a full disk can never leave a half-written catalogue behind.
 */
function write_json(string $file, mixed $value): void {
    data_dirs();
    $dir = dirname($file);
    if (!is_dir($dir) && !@mkdir($dir, 0770, true) && !is_dir($dir)) {
        throw new RuntimeException("Could not create $dir.");
    }
    $json = json_encode($value, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    $temp = $dir . '/.tmp-' . bin2hex(random_bytes(6));
    if (@file_put_contents($temp, $json, LOCK_EX) === false || !@rename($temp, $file)) {
        @unlink($temp);
        throw new RuntimeException("Could not save $file. Check the folder permissions.");
    }
    @chmod($file, 0660);
}

/** Runs $work while holding an exclusive lock, so two admins cannot clobber each other. */
function with_lock(string $name, callable $work): mixed {
    data_dirs();
    $handle = fopen(DATA_DIR . "/.lock-$name", 'c');
    if ($handle === false) throw new RuntimeException('Could not open the lock file.');
    try {
        if (!flock($handle, LOCK_EX)) throw new RuntimeException('Could not lock the data file.');
        return $work();
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function uuid(): string {
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}

function e(?string $value): string {
    return htmlspecialchars($value ?? '', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function money(float $value): string {
    return '$' . number_format($value, 2);
}

function base_url(): string {
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
        || (int)($_SERVER['SERVER_PORT'] ?? 80) === 443;
    $host = $_SERVER['HTTP_X_FORWARDED_HOST'] ?? $_SERVER['HTTP_HOST'] ?? 'localhost';
    $host = explode(',', $host)[0];
    return ($https ? 'https://' : 'http://') . trim($host);
}

/**
 * The shop lives at the site root unless it was uploaded into a subfolder.
 * Worked out from where these files actually sit inside the document root, which
 * holds for every page. Deriving it from SCRIPT_NAME does not: PHP's built-in
 * server reports the requested path there, so /shop/liquids would look as though
 * it lived in a "shop" folder.
 */
function base_path(): string {
    static $base = null;
    if ($base !== null) return $base;

    $appDir = str_replace('\\', '/', (string)realpath(dirname(__DIR__)));
    $docRoot = str_replace('\\', '/', (string)realpath((string)($_SERVER['DOCUMENT_ROOT'] ?? '')));
    if ($appDir !== '' && $docRoot !== '' && str_starts_with($appDir . '/', $docRoot . '/')) {
        return $base = rtrim(substr($appDir, strlen($docRoot)), '/');
    }

    $script = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/'));
    return $base = ($script === '/' || $script === '.' ? '' : rtrim($script, '/'));
}

function url(string $path = '/'): string {
    return base_path() . $path;
}
