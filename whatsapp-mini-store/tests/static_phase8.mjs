import './static_phase7.mjs';
import fs from 'node:fs';

const read=(file)=>fs.readFileSync(file,'utf8');
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const pass=(message)=>process.stdout.write(`PASS ${message}\n`);

const migration=read('database/migrations/007_phase8_subscriptions.sql');
for(const needle of ['subscription_change_requests','subscription_events',"'FREE'","'PRO'","'BUSINESS'",'pending_plan_id','custom_domain'])assert(migration.includes(needle),`Phase 8 migration missing ${needle}`);
assert(!/DROP\s+(TABLE|COLUMN)/i.test(migration),'Phase 8 migration is destructive');pass('Phase 8 additive schema and plan seeds');

const access=read('app/Services/PlanAccessService.php');
const subscriptions=read('app/Services/SubscriptionService.php');
const products=read('app/Repositories/ProductRepository.php');
const categories=read('app/Repositories/CategoryRepository.php');
const productImport=read('app/Services/ProductImportService.php');
const imports=read('app/Controllers/ImportController.php');
assert(access.includes('assertCanAddMany')&&access.includes('withinDerivedGrace')&&access.includes('scheduled_change_at'),'entitlement guard is incomplete');
assert(products.includes("assertCanAdd($storeId,'products'")&&categories.includes("assertCanAdd($storeId,'categories'"),'catalog repositories do not enforce limits');
assert(productImport.indexOf('context($storeId,$pdo,true,false)')<productImport.indexOf('requiredCapacity'),'import capacity is read before the subscription lock');
assert((imports.match(/requireFeature/g)||[]).length>=3,'import feature gates are not enforced on POST actions');pass('Server-side plan enforcement');

assert(subscriptions.includes("$status='PENDING'")&&subscriptions.includes('openRequest')&&subscriptions.includes('idempotencyKey'),'paid change workflow is not pending and idempotent');
for(const needle of ["status='GRACE'","status='PAST_DUE'","status='EXPIRED'",'subscription.scheduled_change_applied'])assert(subscriptions.includes(needle),`lifecycle missing ${needle}`);pass('Subscription request and lifecycle safety');

const workspace=read('app/Controllers/StoreWorkspaceController.php');const routes=read('routes/web.php');
assert(workspace.includes('accessibleBy')&&!workspace.includes("input('store_id')"),'workspace switch trusts client tenant ownership');
assert(routes.indexOf("'/merchant/subscription'")<routes.indexOf("'/merchant/{section}'"),'subscription route is shadowed');pass('Tenant-authorized workspace and route ordering');
