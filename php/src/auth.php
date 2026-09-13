<?php
declare(strict_types=1);

function start_session(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    session_name(SESSION_NAME);
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => base_path() . '/',
        'httponly' => true,
        'samesite' => 'Lax',
        // Only ask for Secure when the visitor is actually on HTTPS, otherwise the
        // cookie is silently dropped while testing over plain http.
        'secure' => str_starts_with(base_url(), 'https://'),
    ]);
    session_start();
}

function admin_record(): array {
    $stored = read_json(PATH_ADMIN, []);
    return is_array($stored) ? $stored : [];
}

function admin_exists(): bool {
    $admin = admin_record();
    return ($admin['username'] ?? '') !== '' && ($admin['hash'] ?? '') !== '';
}

function check_credentials(string $username, string $password): void {
    if (!preg_match('/^[a-zA-Z0-9_.-]{3,40}$/', $username)) {
        throw new InvalidArgumentException('Use 3–40 letters, numbers, dots, underscores or hyphens for the username.');
    }
    if (strlen($password) < 12 || strlen($password) > 128) {
        throw new InvalidArgumentException('Use a password between 12 and 128 characters.');
    }
}

/** Creates the one admin account. Returns the recovery code, shown only once. */
function create_admin(string $username, string $password): string {
    if (admin_exists()) throw new RuntimeException('An admin account already exists.');
    check_credentials($username, $password);
    $recovery = strtoupper(bin2hex(random_bytes(12)));
    write_json(PATH_ADMIN, [
        'username' => $username,
        'hash' => password_hash($password, PASSWORD_DEFAULT),
        'recoveryHash' => password_hash($recovery, PASSWORD_DEFAULT),
        'failures' => 0,
        'lockedUntil' => 0,
    ]);
    sign_in($username);
    return $recovery;
}

function sign_in(string $username): void {
    start_session();
    session_regenerate_id(true);           // a fresh id, so a pre-set one cannot be reused
    $_SESSION['admin'] = $username;
    $_SESSION['expires'] = time() + SESSION_MINUTES * 60;
}

function sign_out(): void {
    start_session();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', ['expires' => time() - 3600] + $p);
    }
    session_destroy();
}

function current_admin(): ?string {
    start_session();
    if (($_SESSION['admin'] ?? '') === '') return null;
    if ((int)($_SESSION['expires'] ?? 0) < time()) { sign_out(); return null; }
    return (string)$_SESSION['admin'];
}

function require_admin(): string {
    $admin = current_admin();
    if ($admin === null) {
        header('Location: ' . url('/admin'));
        exit;
    }
    return $admin;
}

function lockout_remaining(array $admin): int {
    $until = (int)($admin['lockedUntil'] ?? 0);
    return $until > time() ? (int)ceil(($until - time()) / 60) : 0;
}

/** Records a wrong attempt and locks the account after too many. */
function note_failure(): void {
    with_lock('admin', function () {
        $admin = admin_record();
        $admin['failures'] = (int)($admin['failures'] ?? 0) + 1;
        if ($admin['failures'] >= LOCKOUT_TRIES) {
            $admin['lockedUntil'] = time() + LOCKOUT_MINUTES * 60;
            $admin['failures'] = 0;
        }
        write_json(PATH_ADMIN, $admin);
        return null;
    });
}

function clear_failures(): void {
    with_lock('admin', function () {
        $admin = admin_record();
        $admin['failures'] = 0;
        $admin['lockedUntil'] = 0;
        write_json(PATH_ADMIN, $admin);
        return null;
    });
}

function attempt_login(string $username, string $password): void {
    $admin = admin_record();
    $minutes = lockout_remaining($admin);
    if ($minutes > 0) {
        throw new RuntimeException("Too many attempts. Try again in $minutes minute" . ($minutes === 1 ? '' : 's') . '.');
    }
    $ok = hash_equals((string)($admin['username'] ?? ''), $username)
        && password_verify($password, (string)($admin['hash'] ?? ''));
    if (!$ok) {
        note_failure();
        throw new RuntimeException('Incorrect username or password.');
    }
    clear_failures();
    sign_in($username);
}

/** Resets the login with the recovery code and issues a fresh one. */
function recover_admin(string $code, string $username, string $password): string {
    $admin = admin_record();
    $minutes = lockout_remaining($admin);
    if ($minutes > 0) {
        throw new RuntimeException("Too many attempts. Try again in $minutes minute" . ($minutes === 1 ? '' : 's') . '.');
    }
    if (!password_verify(trim($code), (string)($admin['recoveryHash'] ?? ''))) {
        note_failure();
        throw new RuntimeException('That recovery code is not correct.');
    }
    check_credentials($username, $password);
    $recovery = strtoupper(bin2hex(random_bytes(12)));
    write_json(PATH_ADMIN, [
        'username' => $username,
        'hash' => password_hash($password, PASSWORD_DEFAULT),
        'recoveryHash' => password_hash($recovery, PASSWORD_DEFAULT),
        'failures' => 0,
        'lockedUntil' => 0,
    ]);
    sign_in($username);
    return $recovery;
}

function change_credentials(string $currentPassword, string $username, string $password): void {
    $admin = admin_record();
    if (!password_verify($currentPassword, (string)($admin['hash'] ?? ''))) {
        throw new RuntimeException('Your current password is not correct.');
    }
    check_credentials($username, $password);
    $admin['username'] = $username;
    $admin['hash'] = password_hash($password, PASSWORD_DEFAULT);
    write_json(PATH_ADMIN, $admin);
    sign_in($username);
}

// ---------------------------------------------------------------- CSRF

function csrf_token(): string {
    start_session();
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
    return (string)$_SESSION['csrf'];
}

function csrf_field(): string {
    return '<input type="hidden" name="_token" value="' . e(csrf_token()) . '">';
}

function check_csrf(): void {
    start_session();
    $sent = (string)($_POST['_token'] ?? '');
    if ($sent === '' || !hash_equals((string)($_SESSION['csrf'] ?? ''), $sent)) {
        throw new RuntimeException('This page expired. Go back, reload it and try again.');
    }
}

/** Public forms carry no session, so they are checked by origin instead. */
function check_origin(): void {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin === '') {
        $referer = $_SERVER['HTTP_REFERER'] ?? '';
        if ($referer !== '') {
            $parts = parse_url($referer);
            $origin = ($parts['scheme'] ?? '') . '://' . ($parts['host'] ?? '')
                . (isset($parts['port']) ? ':' . $parts['port'] : '');
        }
    }
    if ($origin === '' || rtrim($origin, '/') !== rtrim(base_url(), '/')) {
        throw new RuntimeException('That request did not come from this site.');
    }
}
