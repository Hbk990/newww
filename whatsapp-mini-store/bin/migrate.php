<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/bootstrap.php';

$pdo = App\Core\Database::connection();
$lock=$pdo->query("SELECT GET_LOCK('ministore_schema_migrations',30)")->fetchColumn();if((int)$lock!==1){fwrite(STDERR,"Could not acquire the migration lock.\n");exit(1);}register_shutdown_function(static function()use($pdo):void{try{$pdo->query("SELECT RELEASE_LOCK('ministore_schema_migrations')");}catch(Throwable){}});
$pdo->exec("CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(100) PRIMARY KEY, applied_at DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
$applied = $pdo->query('SELECT version FROM schema_migrations')->fetchAll(PDO::FETCH_COLUMN);
foreach (glob(BASE_PATH . '/database/migrations/*.sql') ?: [] as $file) {
    $version = basename($file, '.sql');
    if (in_array($version, $applied, true)) continue;
    try {
        $sql = (string) file_get_contents($file);
        foreach (preg_split('/;\s*(?:\R|$)/', $sql) ?: [] as $statement) {
            if (trim($statement) !== '') $pdo->exec($statement);
        }
        $stmt = $pdo->prepare('INSERT INTO schema_migrations (version,applied_at) VALUES (?,UTC_TIMESTAMP())');
        $stmt->execute([$version]);
        echo "Applied {$version}\n";
    } catch (Throwable $e) {
        fwrite(STDERR, "Migration {$version} failed: {$e->getMessage()}\n"); exit(1);
    }
}
echo "Migrations complete.\n";
