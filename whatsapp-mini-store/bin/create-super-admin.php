<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/bootstrap.php';

$name = trim((string) readline('Name: '));
$email = mb_strtolower(trim((string) readline('Email: ')));
fwrite(STDOUT, 'Password (input hidden): ');
if (PHP_OS_FAMILY !== 'Windows') shell_exec('stty -echo');
$password = trim((string) fgets(STDIN));
if (PHP_OS_FAMILY !== 'Windows') shell_exec('stty echo');
fwrite(STDOUT, PHP_EOL);
if (mb_strlen($name) < 2 || !filter_var($email, FILTER_VALIDATE_EMAIL) || ($error = App\Support\Validation::password($password))) {
    fwrite(STDERR, ($error ?? 'Invalid name or email.') . PHP_EOL); exit(1);
}
$hash = (new App\Services\PasswordHasher)->hash($password);
$stmt = App\Core\Database::connection()->prepare("INSERT INTO users (name,email,password_hash,platform_role,status,email_verified_at,created_at,updated_at) VALUES (?,?,?,'SUPER_ADMIN','ACTIVE',UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP())");
try { $stmt->execute([$name,$email,$hash]); echo "Super-admin created.\n"; }
catch (PDOException $e) { fwrite(STDERR, "Could not create super-admin. The email may already exist.\n"); exit(1); }

