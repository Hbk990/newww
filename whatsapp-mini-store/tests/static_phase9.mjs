import './static_phase8.mjs';
import fs from 'node:fs';
const read=(file)=>fs.readFileSync(file,'utf8');const assert=(condition,message)=>{if(!condition)throw new Error(message);};const pass=(message)=>process.stdout.write(`PASS ${message}\n`);

const migration=read('database/migrations/008_phase9_super_admin.sql');
for(const needle of ['status_before_suspension','suspended_at','idx_audit_created_at','idx_orders_placed_at','CREATE TABLE IF NOT EXISTS system_tasks','backup_database','backup_uploads'])assert(migration.includes(needle),`Phase 9 migration missing ${needle}`);
assert(!/DROP\s+(TABLE|COLUMN)/i.test(migration),'Phase 9 migration is destructive');pass('Phase 9 additive administration schema');

const routes=read('routes/web.php');
for(const route of ["'/sa/merchants'","'/sa/stores'","'/sa/plans'","'/sa/audit'","'/sa/system'"])assert(routes.includes(route),`admin route missing ${route}`);
assert(routes.indexOf("'/sa/stores'")<routes.indexOf("'/{storeSlug}'"),'admin routes are shadowed by storefront');pass('Super-admin route coverage and ordering');

const controllers=['SuperAdminController.php','SuperAdminMerchantController.php','SuperAdminStoreController.php','SuperAdminPlanController.php','SuperAdminSystemController.php'];
for(const file of controllers)assert(read('app/Controllers/'+file).includes('requireSuperAdmin'),`${file} lacks explicit super-admin authorization`);pass('Explicit super-admin authorization boundaries');

const merchantRepo=read('app/Repositories/AdminMerchantRepository.php');const actions=read('app/Services/SuperAdminActionService.php');const planRepo=read('app/Repositories/AdminPlanRepository.php');
assert(!merchantRepo.includes('password_hash')&&!merchantRepo.includes('token_hash'),'admin merchant reads expose credentials');
assert(actions.includes("platform_role='MERCHANT'")&&actions.includes('FOR UPDATE')&&actions.includes('AuditLogRepository'),'privileged mutations are not scoped, locked, and audited');
assert(actions.includes("$plan['code']==='FREE'")&&actions.includes('array_replace'),'plan configuration does not protect FREE or preserve future keys');assert(planRepo.includes('subscription_count'),'plan usage is missing');pass('Safe merchant and plan administration');

const storeRepo=read('app/Repositories/AdminStoreRepository.php');const storefront=read('app/Repositories/StorefrontRepository.php');
assert(storeRepo.includes('store_id=?')&&actions.includes('status_before_suspension'),'store inspection or suspension history is incomplete');assert(storefront.includes("status IN ('ACTIVE','SUSPENDED')"),'suspended public status regression');pass('Store inspection and suspension controls');

const system=read('app/Services/SystemStatusService.php');const lifecycle=read('bin/process-subscriptions.php');
for(const needle of ['schema_migrations','directoryStats','error_log','SystemTaskRepository'])assert(system.includes(needle),`system status missing ${needle}`);assert(lifecycle.includes("start('subscription_lifecycle')")&&lifecycle.includes("finish('subscription_lifecycle'"),'lifecycle heartbeat is missing');assert(!system.includes('getenv(')&&!system.includes('$_ENV'),'system page reads raw environment secrets');pass('Safe operational status and scheduled-task heartbeat');

const adminLayout=read('resources/views/layouts/admin.php');const dashboard=read('resources/views/super_admin/dashboard.php');const planEditor=read('resources/views/super_admin/plans/edit.php');const adminRepo=read('app/Repositories/AdminRepository.php');assert(adminLayout.includes('csrf_field()')&&adminLayout.includes('confirm-dialog'),'admin shell lacks CSRF logout or safe confirmations');assert(dashboard.includes('admin-health-strip')&&dashboard.includes("['storage']['uploads']"),'admin dashboard lacks system and storage summary');assert(planEditor.includes('$hasOld')&&planEditor.includes('$isPublic')&&planEditor.includes('$isActive'),'plan editor loses unchecked validation state');assert(adminRepo.includes("sub.status='ACTIVE'")&&!adminRepo.includes("sub.status IN ('ACTIVE','TRIAL') AND p.monthly_price"),'configured MRR includes trial entitlements');pass('Admin shell and dashboard controls');
