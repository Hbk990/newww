import './static_phase9.mjs';
import fs from 'node:fs';
const read=(file)=>fs.readFileSync(file,'utf8');const assert=(condition,message)=>{if(!condition)throw new Error(message);};const pass=(message)=>process.stdout.write(`PASS ${message}\n`);

const migration=read('database/migrations/009_phase10_production_hardening.sql');
for(const needle of ['idx_orders_store_date','idx_products_public_catalog',"'maintenance'"])assert(migration.includes(needle),`Phase 10 migration missing ${needle}`);
assert(!/DROP\s+(TABLE|COLUMN)/i.test(migration),'Phase 10 migration is destructive');pass('Phase 10 additive performance schema');

const headers=read('app/Support/SecurityHeaders.php');const bootstrap=read('bootstrap.php');const http=read('app/Support/Http.php');
for(const needle of ['Content-Security-Policy','Strict-Transport-Security','frame-ancestors','X-Request-ID','Cross-Origin-Opener-Policy'])assert(headers.includes(needle),`security headers missing ${needle}`);
assert(headers.includes('Http::isHttps()')&&http.includes('TRUSTED_PROXY_IPS')&&http.includes('trusted($remote)'),'forwarded HTTPS/IP values are not restricted to trusted proxies');
assert(bootstrap.includes('APP_DEBUG must be false')&&bootstrap.includes('APP_URL must be a valid HTTPS URL')&&bootstrap.includes('register_shutdown_function'),'production fail-closed checks are missing');pass('Production headers, proxy trust, and failure handling');

const auth=read('app/Core/Auth.php');const authController=read('app/Controllers/AuthController.php');const tokens=read('app/Repositories/TokenRepository.php');
assert(auth.includes('_authenticated_at')&&auth.includes('password_changed_at')&&auth.includes('clearSession'),'password changes do not invalidate old sessions');
assert(authController.includes("tooMany('login_ip'")&&authController.includes("tooMany('reset_ip'"),'credential spraying is not rate-limited per IP');
assert(authController.indexOf("owner('email_verifications'")<authController.indexOf("consume('email_verifications'"),'email verification token is consumed before account boundary check');assert(tokens.includes('FOR UPDATE'),'single-use token consumption lost its row lock');pass('Authentication and token abuse hardening');

const upload=read('app/Services/ImageUploadService.php');const uploadConfig=read('config/uploads.php');const uploadRules=read('public/uploads/.htaccess');
assert(uploadConfig.includes("'max_pixels'")&&upload.includes("$config['max_pixels']")&&upload.includes('12000000'),'image decompression limits are missing');
for(const needle of ['RemoveHandler','RemoveType','Options -ExecCGI'])assert(uploadRules.includes(needle),`upload execution protection missing ${needle}`);pass('Upload content and execution hardening');

const orders=read('app/Services/OrderService.php');const storefront=read('app/Repositories/StorefrontRepository.php');const status=read('app/Services/SystemStatusService.php');
assert(orders.includes('usort($lines'),'order locks are not acquired deterministically');
assert(storefront.includes('valuesByOption')&&!storefront.includes("foreach($product['options']as&$option){$values=Database"),'product options still use N+1 queries');
assert(status.includes('system-storage.json')&&status.includes('time()-300'),'storage traversal is not cached');pass('Concurrency and query performance hardening');

const maintenance=read('bin/maintenance.php');const production=read('bin/production-check.php');
for(const needle of ["PHP_SAPI!=='cli'",'ANALYTICS_RETENTION_DAYS',"status='EXPIRED'",'password_resets','maintenance.lock'])assert(maintenance.includes(needle),`maintenance task missing ${needle}`);
for(const needle of ['pdo_mysql','APP_KEY','Upload execution protection','Database migrations'])assert(production.includes(needle),`production check missing ${needle}`);assert(read('bin/migrate.php').includes('GET_LOCK')&&read('bin/migrate.php').includes('RELEASE_LOCK'),'migration runner lacks concurrency lock');pass('Operational maintenance and readiness checks');

const layouts=['app.php','merchant.php','admin.php'].map(file=>read('resources/views/layouts/'+file));for(const layout of layouts)assert(layout.includes('Cache-Control: no-store'),'private layout lacks no-store caching');
for(const file of ['resources/views/layouts/storefront.php','resources/views/storefront/product.php','resources/views/storefront/reorder.php'])assert(read(file).includes('SecurityHeaders::nonce()'),`${file} inline data lacks a CSP nonce`);pass('Private caching and CSP nonce coverage');

const source=[...fs.readdirSync('app/Controllers').map(f=>'app/Controllers/'+f),...fs.readdirSync('app/Repositories').map(f=>'app/Repositories/'+f)].map(read).join('\n');assert(!source.includes("input('store_id')")&&!source.includes('query(\'store_id\')'),'client-supplied store_id authorization found');pass('Tenant identity remains server-derived');
