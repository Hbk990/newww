<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

const ROOT_DIR = __DIR__ . '/..';
define('STORAGE_DIR', (($externalStorage=getenv('DR_PHONE_STORAGE_DIR'))!==false&&$externalStorage!=='' ? rtrim($externalStorage,'/') : ROOT_DIR . '/storage'));
define('CATALOG_FILE', STORAGE_DIR . '/catalog.json');
define('SETTINGS_FILE', STORAGE_DIR . '/settings.json');
define('BACKUP_DIR', STORAGE_DIR . '/backups');
define('AUTH_ATTEMPTS_FILE', STORAGE_DIR . '/auth-attempts.json');
define('ACTIVITY_FILE', STORAGE_DIR . '/activity.json');
define('IMAGE_AUDIT_CACHE_FILE', STORAGE_DIR . '/image-audit-cache.json');
define('ORDERS_FILE', STORAGE_DIR . '/orders.json');
define('INSTALL_LOCK_FILE', STORAGE_DIR . '/installation.lock');
define('CATALOG_SUMMARY_FILE', STORAGE_DIR . '/catalog-summary.json');
const UPLOAD_DIR = ROOT_DIR . '/uploads/products';

define('CSP_NONCE', base64_encode(random_bytes(18)));
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
header("Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-".CSP_NONCE."'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'");

if (session_status() !== PHP_SESSION_ACTIVE) {
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_name('dr_phone_session');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();
}

foreach ([STORAGE_DIR, BACKUP_DIR, UPLOAD_DIR] as $directory) {
    if (!is_dir($directory)) @mkdir($directory, 0755, true);
}

function load_json(string $path, array $fallback = []): array {
    if (!is_file($path)) return $fallback;
    $decoded = json_decode((string) file_get_contents($path), true);
    return is_array($decoded) ? $decoded : $fallback;
}

// Hold across the entire order read/modify/write, not just the final rename.
// PHP closes this handle at request shutdown, including json_response exits.
function lock_order_updates() {
    $lock = fopen(ORDERS_FILE . '.transaction.lock', 'c');
    if ($lock === false || !flock($lock, LOCK_EX)) throw new RuntimeException('Could not lock orders.');
    return $lock;
}

function save_json(string $path, array $data): void {
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false) throw new RuntimeException('Could not encode data.');
    $lock=fopen($path.'.lock','c');
    if($lock===false||!flock($lock,LOCK_EX))throw new RuntimeException('Could not lock data for saving.');
    $temp=$path.'.'.bin2hex(random_bytes(6)).'.tmp';
    try {
        if(file_put_contents($temp,$json,LOCK_EX)===false||!rename($temp,$path))throw new RuntimeException('Could not save data. Check folder permissions.');
    } finally {
        @unlink($temp); flock($lock,LOCK_UN); fclose($lock);
    }
}

function settings(): array {
    return array_merge(['admin_username' => null, 'admin_password_hash' => null, 'customer_password_hash'=>CUSTOMER_PASSWORD_HASH, 'two_factor_enabled'=>false, 'two_factor_secret'=>'', 'two_factor_recovery_hashes'=>[], 'phone' => '+961 70 90 80 28', 'location' => 'DR PHONE Location', 'map_url' => 'https://maps.app.goo.gl/CBQFdge9XP2eM92y6', 'currency'=>'USD', 'minimum_order'=>0, 'payment_terms'=>'', 'delivery_terms'=>'', 'configured_at' => null], load_json(SETTINGS_FILE, []));
}

function catalog(): array { return load_json(CATALOG_FILE, []); }

function backup_catalog(): void {
    if (!is_file(CATALOG_FILE)) return;
    $target = BACKUP_DIR . '/catalog-' . gmdate('Ymd-His') . '-' . bin2hex(random_bytes(2)) . '.json';
    copy(CATALOG_FILE, $target);
    $files = glob(BACKUP_DIR . '/catalog-*.json') ?: [];
    rsort($files);
    foreach (array_slice($files, BACKUP_LIMIT) as $old) @unlink($old);
}

/* The public landing page states how many products and categories there are, and
 * the size of each group. Those figures have to stay true as the catalog is
 * edited, but the passcode page deliberately loads no catalog at all — a 968 KB
 * parse on every public hit is what would make it slow. So the totals are
 * written out once, here, at the single point every catalog change passes
 * through, and the gate reads a file of a few hundred bytes. */
function write_catalog_summary(array $data): void {
    $groups = []; $products = 0;
    foreach ($data as $category) {
        $count = count($category['products'] ?? []);
        $products += $count;
        $group = (string)($category['group'] ?? 'Other');
        $groups[$group] = ($groups[$group] ?? 0) + $count;
    }
    arsort($groups);
    save_json(CATALOG_SUMMARY_FILE, [
        'products' => $products,
        'categories' => count($data),
        'groups' => $groups,
        'built' => gmdate('c'),
    ]);
}

/* Returns [] when the file has never been written, and the landing page then
 * omits the figures entirely rather than printing stale ones. */
function catalog_summary(): array {
    $summary = load_json(CATALOG_SUMMARY_FILE, []);
    return isset($summary['products'], $summary['categories']) ? $summary : [];
}

function save_catalog(array $data): void { backup_catalog(); save_json(CATALOG_FILE, $data); write_catalog_summary($data); }
function log_activity(string $action, string $detail=''): void {
    $items=load_json(ACTIVITY_FILE,[]);
    array_unshift($items,['time'=>gmdate('c'),'admin'=>(string)(settings()['admin_username']??'admin'),'ip'=>clean_text(client_ip(),64),'action'=>$action,'detail'=>clean_text($detail,300)]);
    save_json(ACTIVITY_FILE,array_slice($items,0,250));
}
function catalog_backups(): array {
    $files=glob(BACKUP_DIR.'/catalog-*.json')?:[]; rsort($files);
    return array_map(fn($file)=>['name'=>basename($file),'time'=>gmdate('c',(int)filemtime($file)),'size'=>(int)filesize($file)],$files);
}
function restore_catalog_backup(string $name): array {
    if(!preg_match('/^catalog-[A-Za-z0-9.-]+\.json$/',$name))throw new RuntimeException('Invalid backup.');
    $path=BACKUP_DIR.'/'.$name; if(!is_file($path))throw new RuntimeException('Backup not found.');
    $data=load_json($path,[]); if(!$data)throw new RuntimeException('Backup is empty or invalid.');
    save_catalog($data); log_activity('Catalog restored',$name); return $data;
}
/* Measuring 1157 images with getimagesize() costs ~1.4s of blocking disk I/O, and
   this used to run on every admin GET — including the reload after every save.
   Results are cached per file and only recomputed when the file's mtime changes. */
function image_audit(array $data): array {
    $cache=load_json(IMAGE_AUDIT_CACHE_FILE,[]); $dirty=false; $seen=[]; $issues=[];
    foreach($data as $category)foreach(($category['products']??[]) as $product){
        $image=(string)($product['image']??''); $reason='';
        if($image===''){
            $reason='Missing image';
        }elseif(str_starts_with($image,'uploads/')){
            $full=ROOT_DIR.'/'.$image;
            if(!is_file($full)){
                $reason='Image file not found';
            }else{
                $seen[$image]=true;
                $mtime=(int)@filemtime($full);
                $entry=$cache[$image]??null;
                if(!is_array($entry)||(int)($entry['mtime']??-1)!==$mtime){
                    $size=@getimagesize($full);
                    $entry=['mtime'=>$mtime,'width'=>$size?(int)$size[0]:0,'height'=>$size?(int)$size[1]:0];
                    $cache[$image]=$entry; $dirty=true;
                }
                if(!$entry['width']||!$entry['height'])$reason='Unreadable image';
                elseif($entry['width']<500||$entry['height']<500)$reason='Low resolution ('.$entry['width'].'×'.$entry['height'].')';
            }
        }
        if($reason!=='')$issues[]=['id'=>(int)$product['id'],'name'=>(string)$product['name'],'category'=>(string)($category['name']??''),'reason'=>$reason];
    }
    // Drop entries for images the catalog no longer references.
    foreach(array_keys($cache) as $path)if(!isset($seen[$path])){unset($cache[$path]);$dirty=true;}
    if($dirty){try{save_json(IMAGE_AUDIT_CACHE_FILE,$cache);}catch(Throwable $e){/* cache is an optimisation, never fatal */}}
    return $issues;
}

/* Counts for the dashboard Overview. Cheap: no disk access beyond the audit cache. */
function catalog_stats(array $data): array {
    $products=0;$low=0;$out=0;$unreviewed=0;$noImage=0;$draft=0;$published=0;$hidden=0;$perCategory=[];
    foreach($data as $category){
        $items=$category['products']??[]; $perCategory[]=['name'=>(string)($category['name']??''),'slug'=>(string)($category['slug']??''),'group'=>(string)($category['group']??'Other'),'count'=>count($items)];
        foreach($items as $product){
            $products++;
            $stock=(string)($product['stock']??'in-stock'); $quantity=(int)($product['stock_quantity']??0);
            if($stock==='out-of-stock')$out++; elseif($stock==='low-stock'||($quantity>0&&$quantity<=5))$low++;
            if(empty($product['stock_updated_at']))$unreviewed++;
            if(empty($product['image']))$noImage++;
            $visibility=(string)($product['visibility']??'published');
            if($visibility==='draft')$draft++; elseif($visibility==='hidden')$hidden++; else $published++;
        }
    }
    return ['products'=>$products,'categories'=>count($data),'low'=>$low,'out'=>$out,'in_stock'=>max(0,$products-$low-$out),
        'unreviewed'=>$unreviewed,'no_image'=>$noImage,'published'=>$published,'draft'=>$draft,'hidden'=>$hidden,'per_category'=>$perCategory];
}
function backup_settings(): void {
    if(!is_file(SETTINGS_FILE))return;
    $target=BACKUP_DIR.'/settings-'.gmdate('Ymd-His').'-'.bin2hex(random_bytes(2)).'.json'; copy(SETTINGS_FILE,$target);
    $files=glob(BACKUP_DIR.'/settings-*.json')?:[]; rsort($files); foreach(array_slice($files,BACKUP_LIMIT) as $old)@unlink($old);
}
function is_admin(): bool {
    if (empty($_SESSION['admin_authenticated'])) return false;
    if (!empty($_SESSION['admin_last_seen']) && time()-(int)$_SESSION['admin_last_seen']>1800) {
        unset($_SESSION['admin_authenticated'],$_SESSION['admin_last_seen']); return false;
    }
    $_SESSION['admin_last_seen']=time(); return true;
}
function is_customer(): bool { return is_admin() || !empty($_SESSION['customer_authenticated']); }

/* A forwarded-for header is attacker-controlled unless the request demonstrably
   came through a proxy we trust, so it is only honoured when REMOTE_ADDR is in
   TRUSTED_PROXIES (empty by default — see inc/config.php). Without this, anyone
   could spoof an address and sidestep the throttle entirely. */
function client_ip(): string {
    $remote=(string)($_SERVER['REMOTE_ADDR']??'unknown');
    $trusted=defined('TRUSTED_PROXIES')?(array)TRUSTED_PROXIES:[];
    if(!$trusted||!in_array($remote,$trusted,true))return $remote;
    foreach(['HTTP_CF_CONNECTING_IP','HTTP_X_FORWARDED_FOR','HTTP_X_REAL_IP'] as $header){
        $value=trim((string)($_SERVER[$header]??''));
        if($value==='')continue;
        $first=trim(explode(',',$value)[0]);
        if(filter_var($first,FILTER_VALIDATE_IP))return $first;
    }
    return $remote;
}

/* Two counters per scope. The IP counter is the outer bound; the session counter
   stops one browser after a handful of tries. Behind a CDN every customer shares
   one address, so an IP-only limit of 5 let a single bad actor lock out the whole
   customer base — the session counter is what keeps the per-browser limit tight
   while the IP limit can be loosened. A fresh session resets its own counter,
   which is exactly why the IP bound has to stay. */
function auth_limits(string $scope): array {
    return $scope==='admin'?['ip'=>5,'session'=>5]:['ip'=>20,'session'=>5];
}
function auth_attempt_key(string $scope): string { return $scope.':'.hash('sha256',client_ip()); }
function auth_attempts(string $scope): array {
    $all=load_json(AUTH_ATTEMPTS_FILE,[]); $key=auth_attempt_key($scope); $cutoff=time()-900;
    return array_values(array_filter($all[$key]??[],fn($time)=>(int)$time>$cutoff));
}
function auth_session_attempts(string $scope): array {
    $cutoff=time()-900;
    return array_values(array_filter((array)($_SESSION['auth_failures'][$scope]??[]),fn($time)=>(int)$time>$cutoff));
}
function auth_allowed(string $scope): bool {
    $limits=auth_limits($scope);
    return count(auth_attempts($scope))<$limits['ip'] && count(auth_session_attempts($scope))<$limits['session'];
}
function auth_record_failure(string $scope): void {
    $all=load_json(AUTH_ATTEMPTS_FILE,[]); $key=auth_attempt_key($scope);
    $all[$key]=array_slice(array_merge(auth_attempts($scope),[time()]),-30);
    // Old buckets would otherwise accumulate one entry per attacking address forever.
    $cutoff=time()-900;
    foreach($all as $bucket=>$times){ $kept=array_filter((array)$times,fn($t)=>(int)$t>$cutoff); if(!$kept)unset($all[$bucket]); else $all[$bucket]=array_values($kept); }
    save_json(AUTH_ATTEMPTS_FILE,$all);
    $_SESSION['auth_failures'][$scope]=array_slice(array_merge(auth_session_attempts($scope),[time()]),-10);
}
function auth_clear_failures(string $scope): void {
    $all=load_json(AUTH_ATTEMPTS_FILE,[]); unset($all[auth_attempt_key($scope)]); save_json(AUTH_ATTEMPTS_FILE,$all);
    unset($_SESSION['auth_failures'][$scope]);
}

function csrf_token(): string {
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(24));
    return $_SESSION['csrf'];
}

function verify_csrf(): void {
    $token = (string) ($_POST['csrf'] ?? $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if (!hash_equals((string) ($_SESSION['csrf'] ?? ''), $token)) {
        json_response(['ok' => false, 'error' => 'Security token expired. Refresh and try again.'], 419);
    }
}

function require_admin(): void {
    if (!is_admin()) json_response(['ok' => false, 'error' => 'Authentication required.'], 401);
}

function json_response(array $payload, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function slugify(string $value): string {
    $value = strtolower(trim($value));
    $value = preg_replace('/[^a-z0-9]+/', '-', $value) ?? '';
    return trim($value, '-') ?: 'category';
}

function clean_text(mixed $value, int $max = 250): string {
    $text = trim(preg_replace('/\s+/', ' ', (string) $value) ?? '');
    return function_exists('mb_substr') ? mb_substr($text, 0, $max) : substr($text, 0, $max);
}

function clean_lines(mixed $value, int $maxLines = 100, int $maxLength = 180): array {
    $lines=preg_split('/\R+/',(string)$value)?:[]; $result=[];
    foreach(array_slice($lines,0,$maxLines) as $line){$clean=clean_text($line,$maxLength);if($clean!==''&&!in_array($clean,$result,true))$result[]=$clean;}
    return $result;
}

function clean_options(mixed $value): array {
    $lines=preg_split('/\R+/',(string)$value)?:[]; $result=[];
    foreach(array_slice($lines,0,50) as $line){
        $parts=array_map('trim',explode('|',$line,2));
        if(count($parts)!==2||$parts[0]===''||!is_numeric($parts[1]))continue;
        $result[]=['name'=>clean_text($parts[0],100),'price'=>max(0,(float)$parts[1])];
    }
    return $result;
}

/* Order lifecycle: unconfirmed -> confirmed | cancelled.
 *
 * Records written before confirmation existed carry no status field. They are
 * read as "confirmed" rather than "unconfirmed": they pre-date the idea, and
 * treating them as unconfirmed would silently wipe the shop's sales history the
 * moment this version is installed. Only order.php writes "unconfirmed", and it
 * writes it explicitly. */
const ORDER_STATUSES = ['unconfirmed', 'confirmed', 'cancelled'];

function order_status(array $order): string {
    $status = (string)($order['status'] ?? '');
    return in_array($status, ORDER_STATUSES, true) ? $status : 'confirmed';
}

/* Who owns an order row.
 *
 * The order reference is generated by the browser and is only four random
 * digits, so it identifies an order but proves nothing about who placed it.
 * Each session gets an unguessable secret instead; what goes on the row is a
 * hash of it, so the value is safe to hand to the dashboard while still being
 * impossible to forge without the session that created it. */
function order_owner_fingerprint(): string {
    if (empty($_SESSION['order_owner_secret']) || !is_string($_SESSION['order_owner_secret'])) {
        $_SESSION['order_owner_secret'] = bin2hex(random_bytes(32));
    }
    return hash('sha256', 'dr-phone-order-owner|' . $_SESSION['order_owner_secret']);
}

/* A row written before ownership existed has no owner and can never be matched,
 * which is deliberate: it means nobody can claim someone else's old order. */
function order_owned_by_session(array $order): bool {
    $recorded = (string)($order['owner'] ?? '');
    return $recorded !== '' && hash_equals($recorded, order_owner_fingerprint());
}

function clean_tiers(mixed $value): array {
    $result=[]; $lines=preg_split('/\R+/',(string)$value)?:[];
    foreach(array_slice($lines,0,20) as $line){$parts=array_map('trim',explode('|',$line,2));if(count($parts)!==2||!ctype_digit($parts[0])||!is_numeric($parts[1]))continue;$result[]=['min'=>max(1,(int)$parts[0]),'price'=>max(0,(float)$parts[1])];}
    usort($result,fn($a,$b)=>$a['min']<=>$b['min']); return $result;
}

function generate_totp_secret(int $length=20): string {
    $alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; $bytes=random_bytes($length); $secret='';
    for($i=0;$i<$length;$i++)$secret.=$alphabet[ord($bytes[$i])%32]; return $secret;
}
function base32_decode_secret(string $secret): string {
    $alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; $bits=''; $output='';
    foreach(str_split(strtoupper(preg_replace('/[^A-Z2-7]/i','',$secret)??'')) as $char){$value=strpos($alphabet,$char);if($value===false)continue;$bits.=str_pad(decbin($value),5,'0',STR_PAD_LEFT);}
    foreach(str_split($bits,8) as $byte)if(strlen($byte)===8)$output.=chr(bindec($byte)); return $output;
}
function verify_totp(string $secret,string $code): bool {
    if(!preg_match('/^\d{6}$/',$code))return false; $key=base32_decode_secret($secret); $step=(int)floor(time()/30);
    for($offset=-1;$offset<=1;$offset++){$counter=pack('N*',0,$step+$offset);$hash=hash_hmac('sha1',$counter,$key,true);$position=ord($hash[19])&15;$value=((ord($hash[$position])&127)<<24)|((ord($hash[$position+1])&255)<<16)|((ord($hash[$position+2])&255)<<8)|(ord($hash[$position+3])&255);if(hash_equals(str_pad((string)($value%1000000),6,'0',STR_PAD_LEFT),$code))return true;}return false;
}

function generate_recovery_codes(int $count=8): array {
    $alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';$plain=[];$hashes=[];
    for($n=0;$n<$count;$n++){$raw='';for($i=0;$i<8;$i++)$raw.=$alphabet[random_int(0,strlen($alphabet)-1)];$code=substr($raw,0,4).'-'.substr($raw,4);$plain[]=$code;$hashes[]=password_hash($raw,PASSWORD_DEFAULT);}
    return ['plain'=>$plain,'hashes'=>$hashes];
}

function use_recovery_code(array &$siteSettings,string $code): bool {
    $normalized=strtoupper(preg_replace('/[^A-Z0-9]/i','',$code)??'');if(strlen($normalized)!==8)return false;
    foreach(($siteSettings['two_factor_recovery_hashes']??[]) as $index=>$hash){if(password_verify($normalized,(string)$hash)){unset($siteSettings['two_factor_recovery_hashes'][$index]);$siteSettings['two_factor_recovery_hashes']=array_values($siteSettings['two_factor_recovery_hashes']);backup_settings();save_json(SETTINGS_FILE,$siteSettings);return true;}}
    return false;
}

function clean_variant_stock(mixed $value): array {
    $result=[]; $lines=preg_split('/\R+/',(string)$value)?:[];
    foreach(array_slice($lines,0,250) as $line){
        $parts=array_map('trim',explode('|',$line,2)); if(count($parts)!==2)continue;
        $key=clean_text($parts[0],220); $status=strtolower($parts[1]);
        if($key!==''&&in_array($status,['in-stock','low-stock','out-of-stock'],true))$result[$key]=$status;
    }
    return $result;
}

function clean_variant_quantity(mixed $value): array {
    $result=[]; $lines=preg_split('/\R+/',(string)$value)?:[];
    foreach(array_slice($lines,0,250) as $line){
        $parts=array_map('trim',explode('|',$line,2)); if(count($parts)!==2||!is_numeric($parts[1]))continue;
        $key=clean_text($parts[0],220); if($key!=='')$result[$key]=min(999999,max(0,(int)$parts[1]));
    }
    return $result;
}

function csv_json_array(mixed $value): array {
    $decoded=json_decode(trim((string)$value),true);
    return is_array($decoded)&&array_is_list($decoded)?$decoded:[];
}

/* Whether the cell IS a JSON list, as opposed to holding one that happens to be
   empty. csv_list needs the difference: "[]" means no colours, not a colour
   named "[]". */
function csv_is_json_list(mixed $value): bool {
    $decoded=json_decode(trim((string)$value),true);
    return is_array($decoded)&&array_is_list($decoded);
}

function csv_list(mixed $value,int $maxLines,int $maxLength): array {
    // Testing the decoded array for truth treats an empty list as "not JSON" and
    // falls through to the plain-text branch below, which turned the exported
    // "[]" into a single item spelled "[]" — on every product with no flavours.
    if(csv_is_json_list($value)){
        $result=[];
        foreach(array_slice(csv_json_array($value),0,$maxLines) as $item){$clean=clean_text($item,$maxLength);if($clean!==''&&!in_array($clean,$result,true))$result[]=$clean;}
        return $result;
    }
    return clean_lines(str_replace(';',"\n",(string)$value),$maxLines,$maxLength);
}

function csv_options(mixed $value): array {
    $decoded=csv_json_array($value);$result=[];
    foreach(array_slice($decoded,0,50) as $item){if(!is_array($item)||trim((string)($item['name']??''))===''||!is_numeric($item['price']??null))continue;$result[]=['name'=>clean_text($item['name'],100),'price'=>max(0,(float)$item['price'])];}
    return $result;
}

function csv_tiers(mixed $value): array {
    $decoded=csv_json_array($value);$result=[];
    foreach(array_slice($decoded,0,20) as $item){if(!is_array($item)||!is_numeric($item['min']??null)||!is_numeric($item['price']??null))continue;$result[]=['min'=>max(1,(int)$item['min']),'price'=>max(0,(float)$item['price'])];}
    usort($result,fn($a,$b)=>$a['min']<=>$b['min']);return $result;
}

function csv_variant_stock(mixed $value): array {
    $decoded=json_decode(trim((string)$value),true);$result=[];
    if(!is_array($decoded))return $result;
    foreach(array_slice($decoded,0,250,true) as $key=>$status){$cleanKey=clean_text($key,220);$cleanStatus=strtolower((string)$status);if($cleanKey!==''&&in_array($cleanStatus,['in-stock','low-stock','out-of-stock'],true))$result[$cleanKey]=$cleanStatus;}
    return $result;
}

function csv_variant_quantity(mixed $value): array {
    $decoded=json_decode(trim((string)$value),true);$result=[];
    if(!is_array($decoded))return $result;
    foreach(array_slice($decoded,0,250,true) as $key=>$quantity){$cleanKey=clean_text($key,220);if($cleanKey!==''&&is_numeric($quantity))$result[$cleanKey]=min(999999,max(0,(int)$quantity));}
    return $result;
}

function csv_image_reference(mixed $value): ?string {
    $path=trim((string)$value);
    if($path===''||!preg_match('#^uploads/products/[A-Za-z0-9._-]+$#',$path))return null;
    return is_file(ROOT_DIR.'/'.$path)?$path:null;
}

function save_uploaded_image(string $field): ?string {
    if (empty($_FILES[$field]) || $_FILES[$field]['error'] === UPLOAD_ERR_NO_FILE) return null;
    return store_uploaded_image($_FILES[$field]);
}

function store_uploaded_image(array $file): string {
    $error=(int)($file['error']??UPLOAD_ERR_NO_FILE);
    $size=(int)($file['size']??0);
    $temporary=(string)($file['tmp_name']??'');
    if($error!==UPLOAD_ERR_OK)throw new RuntimeException('Image upload failed (code '.$error.').');
    if($size<=0||$size>MAX_IMAGE_BYTES)throw new RuntimeException('Image is empty or exceeds 5 MB.');
    if($temporary===''||!is_uploaded_file($temporary))throw new RuntimeException('The uploaded image could not be verified.');
    $mime=(new finfo(FILEINFO_MIME_TYPE))->file($temporary);
    $extensions=['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp'];
    $dimensions=@getimagesize($temporary);
    if(!isset($extensions[$mime])||$dimensions===false)throw new RuntimeException('Only valid JPG, PNG and WEBP images are allowed.');
    $base=gmdate('YmdHis').'-'.bin2hex(random_bytes(8));
    $loaders=['image/jpeg'=>'imagecreatefromjpeg','image/png'=>'imagecreatefrompng','image/webp'=>'imagecreatefromwebp'];
    if(function_exists('imagewebp')&&function_exists($loaders[$mime])){
        $source=@call_user_func($loaders[$mime],$temporary);
        if($source!==false){
            $width=(int)$dimensions[0];$height=(int)$dimensions[1];$maximum=1400;$scale=min(1,$maximum/max($width,$height));$targetWidth=max(1,(int)round($width*$scale));$targetHeight=max(1,(int)round($height*$scale));
            $target=imagecreatetruecolor($targetWidth,$targetHeight);
            imagealphablending($target,false);imagesavealpha($target,true);$transparent=imagecolorallocatealpha($target,0,0,0,127);imagefilledrectangle($target,0,0,$targetWidth,$targetHeight,$transparent);
            imagecopyresampled($target,$source,0,0,0,0,$targetWidth,$targetHeight,$width,$height);$name=$base.'.webp';$saved=@imagewebp($target,UPLOAD_DIR.'/'.$name,82);imagedestroy($target);imagedestroy($source);
            if($saved)return 'uploads/products/'.$name;
        }
    }
    $name=$base.'.'.$extensions[$mime];
    if(!move_uploaded_file($temporary,UPLOAD_DIR.'/'.$name))throw new RuntimeException('Could not store uploaded image.');
    return 'uploads/products/'.$name;
}

function catalog_image_references(array $data): array {
    $references=[];
    foreach($data as $category)foreach(($category['products']??[]) as $product){
        foreach(array_merge([(string)($product['image']??'')],(array)($product['images']??[])) as $path)if(is_string($path)&&str_starts_with($path,'uploads/products/'))$references[$path]=true;
    }
    return $references;
}

function delete_unreferenced_product_images(array $data, array $candidates): int {
    $references=catalog_image_references($data);$deleted=0;
    foreach(array_unique($candidates) as $path){$path=(string)$path;if(!preg_match('#^uploads/products/[A-Za-z0-9._-]+$#',$path)||isset($references[$path]))continue;$full=ROOT_DIR.'/'.$path;if(is_file($full)&&@unlink($full))$deleted++;}
    return $deleted;
}

function prune_orphan_product_images(array $data): int {
    $references=catalog_image_references($data);$deleted=0;
    foreach(glob(UPLOAD_DIR.'/*')?:[] as $full){if(!is_file($full))continue;$path='uploads/products/'.basename($full);if(!isset($references[$path])&&@unlink($full))$deleted++;}
    return $deleted;
}

function save_uploaded_images(string $field, int $limit = 5): array {
    if (empty($_FILES[$field]) || !is_array($_FILES[$field]['name'] ?? null)) return [];
    $saved=[]; $count=min($limit,count($_FILES[$field]['name']));
    for($i=0;$i<$count;$i++){
        if(($_FILES[$field]['error'][$i]??UPLOAD_ERR_NO_FILE)===UPLOAD_ERR_NO_FILE)continue;
        $file=['name'=>$_FILES[$field]['name'][$i]??'','type'=>$_FILES[$field]['type'][$i]??'','tmp_name'=>$_FILES[$field]['tmp_name'][$i]??'','error'=>$_FILES[$field]['error'][$i]??UPLOAD_ERR_NO_FILE,'size'=>$_FILES[$field]['size'][$i]??0];
        $saved[]=store_uploaded_image($file);
    }
    return $saved;
}
