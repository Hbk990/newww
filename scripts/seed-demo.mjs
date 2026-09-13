// Fills the LOCAL database with a realistic HUQA catalogue so you can click around
// before entering your own stock. Safe to run again — every row has a fixed id, so a
// second run replaces the demo rows instead of duplicating them.
//
//   node scripts/seed-demo.mjs            seed products, offers, orders and customers
//   node scripts/seed-demo.mjs --clear    remove the demo rows again
//
// Run `npm run build` first. Never point this at a live site.
import {execFileSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const OWNER='huqa', BUCKET='site-creator-r2', STATE='.wrangler/state', CONFIG='dist/server/wrangler.json';
const clear=process.argv.includes('--clear');
// --node writes straight to the SQLite file and data folder the Node server uses;
// without it the demo data goes to the local Cloudflare preview instead.
const nodeMode=process.argv.includes('--node');
const work=mkdtempSync(join(tmpdir(),'huqa-seed-'));

let counter=0;
const id=()=>`d0000000-0000-4000-8000-${String(++counter).padStart(12,'0')}`;
const now=Date.now();

// label, strength, available
const v=(label,strength='',available=true)=>({id:id(),label,strength,available});
const flavours=(names,strength='')=>names.map(n=>Array.isArray(n)?v(n[0],strength,n[1]):v(n,strength));

function product(p){
 return {id:id(),brand:'',bottleSize:'',description:'',image:'',featured:false,revision:1,updatedAt:now-Math.floor(Math.random()*30)*86400000,...p};
}

const products=[
 // ---- Disposables / Shisha ----
 product({name:'HUQA Shisha Bar 10000',brand:'HUQA',category:'Disposables / Shisha',price:20,featured:true,
  description:'Our own shisha-flavour disposable. 10,000 puffs, rechargeable, and blended to the recipe our regulars kept asking for by name.',
  variants:flavours(['Double Apple','Mint Storm','Grape & Berry','Watermelon Chill','Lemon Mint'])}),
 product({name:'Al Fakher Crown Bar 8000',brand:'Al Fakher',category:'Disposables / Shisha',price:18,
  description:'The shisha house everyone knows, in a disposable.',
  variants:flavours(['Two Apples','Mint','Grape Berry','Lemon Mint',['Blueberry Mint',false]])}),
 product({name:'Tugboat Shisha 12000',brand:'Tugboat',category:'Disposables / Shisha',price:22,
  variants:flavours(['Double Apple Ice','Grape Mint','Mixed Berries'])}),

 // ---- Disposables / 50mg ----
 product({name:'Elf Bar BC5000',brand:'Elf Bar',category:'Disposables / 50mg',price:12.5,featured:true,
  description:'5,000 puffs, rechargeable USB-C, mesh coil. The one that never sits on the shelf.',
  variants:flavours(['Watermelon Ice','Blue Razz Ice','Strawberry Mango',['Peach Ice',false],'Kiwi Passion Guava'],'50mg')}),
 product({name:'Lost Mary OS5000',brand:'Lost Mary',category:'Disposables / 50mg',price:14,
  description:'Softer draw than the Elf Bar, same battery life.',
  variants:flavours(['Blue Trio','Watermelon Cherry','Pineapple Mango','Strawberry Ice'],'50mg')}),
 product({name:'Vozol Gear 10000',brand:'Vozol',category:'Disposables / 50mg',price:17,
  variants:flavours(['Cool Mint','Strawberry Banana','Mango Ice','Grape Ice'],'50mg')}),
 product({name:'Geek Bar Pulse 15000',brand:'Geek Bar',category:'Disposables / 50mg',price:22,featured:true,
  description:'Screen on the side, two power modes, 15,000 puffs in normal mode.',
  variants:flavours(['Miami Mint','Sour Apple Ice','Watermelon Ice',['Strawberry Banana',false]],'50mg')}),

 // ---- Disposables / 20mg ----
 product({name:'Elf Bar 600 V2',brand:'Elf Bar',category:'Disposables / 20mg',price:12,
  description:'Lighter salt, 600 puffs. The one to start on.',
  variants:flavours(['Watermelon','Mango','Mint','Cherry Cola'],'20mg')}),
 product({name:'Vozol Neon 800',brand:'Vozol',category:'Disposables / 20mg',price:13,
  variants:flavours(['Blueberry','Peach Ice',['Cola',false]],'20mg')}),

 // ---- Machines ----
 product({name:'Voopoo Drag X2',brand:'Voopoo',category:'Machines',price:42,featured:true,
  description:'80W single-battery mod with the PnP pod tank. Takes one 18650 (sold separately).',
  variants:flavours(['Black','Silver','Red',['Blue',false]])}),
 product({name:'Smok Nord 5',brand:'Smok',category:'Machines',price:32,
  description:'80W pod kit, 2000mAh built in.',variants:flavours(['Black','Green','Red','Gold'])}),
 product({name:'Vaporesso Xros 4',brand:'Vaporesso',category:'Machines',price:28,
  description:'Small, quiet, and the easiest thing to carry.',variants:flavours(['Black','White','Blue','Pink'])}),
 product({name:'Geekvape Aegis Legend 3',brand:'Geekvape',category:'Machines',price:55,
  description:'Shockproof, dustproof, water resistant. The one you buy once.',variants:flavours(['Black','Gunmetal','Green'])}),

 // ---- Coils & pods ----
 product({name:'Voopoo PnP Coils (5-pack)',brand:'Voopoo',category:'Coils & accessories / Coils & pods',price:12,
  variants:flavours(['PnP-VM1 0.3Ω','PnP-VM6 0.15Ω',['PnP-TM2 0.8Ω',false]])}),
 product({name:'Voopoo ITO Pods (3-pack)',brand:'Voopoo',category:'Coils & accessories / Coils & pods',price:9,
  variants:flavours(['0.7Ω','1.0Ω'])}),
 product({name:'Smok RPM Coils (5-pack)',brand:'Smok',category:'Coils & accessories / Coils & pods',price:11,
  variants:flavours(['RPM Mesh 0.4Ω','RPM Triple 0.6Ω'])}),
 product({name:'Smok Nord Pods (3-pack)',brand:'Smok',category:'Coils & accessories / Coils & pods',price:8,
  variants:flavours(['0.6Ω Mesh','0.8Ω Regular'])}),
 product({name:'Vaporesso Xros Pods (3-pack)',brand:'Vaporesso',category:'Coils & accessories / Coils & pods',price:9,
  variants:flavours(['0.6Ω Mesh','0.8Ω Mesh','1.0Ω'])}),
 product({name:'Geekvape B Series Coils (5-pack)',brand:'Geekvape',category:'Coils & accessories / Coils & pods',price:13,
  variants:flavours(['B 0.3Ω','B 0.4Ω','B 0.6Ω'])}),

 // ---- Accessories ----
 product({name:'Sony VTC6 18650 Battery',brand:'Sony',category:'Coils & accessories / Accessories',price:9,
  description:'3000mAh, 15A continuous. Genuine cells only.',variants:flavours(['Single','Pair'])}),
 product({name:'Nitecore i2 Charger',brand:'Nitecore',category:'Coils & accessories / Accessories',price:17,
  variants:flavours(['Two-bay'])}),
 product({name:'USB-C Fast Charging Cable',brand:'HUQA',category:'Coils & accessories / Accessories',price:4,
  variants:flavours(['1m','2m'])}),
 product({name:'Washable Shisha Hose',brand:'HUQA',category:'Coils & accessories / Accessories',price:12,
  description:'Silicone hose with an aluminium handle — rinse it and it is new again.',
  variants:flavours(['Black','Blue','Red'])}),
 product({name:'Coal Tongs & Tray Set',brand:'HUQA',category:'Coils & accessories / Accessories',price:8,variants:flavours(['Stainless'])}),
 product({name:'Universal Silicone Case',brand:'',category:'Coils & accessories / Accessories',price:5,
  variants:flavours(['Black','Clear',['Blue',false]])}),

 // ---- Liquids ----
 product({name:'Nasty Juice Shisha Series',brand:'Nasty Juice',category:'Liquids / 3mg',price:14,bottleSize:'60ml',
  description:'Shisha flavours in a bottle, freebase, made for direct-lung tanks.',
  variants:flavours(['Double Apple','Mint','Grape'],'3mg')}),
 product({name:'Dinner Lady Desserts',brand:'Dinner Lady',category:'Liquids / 3mg',price:16,bottleSize:'60ml',
  variants:flavours(['Lemon Tart','Strawberry Macaroon',['Blackberry Crumble',false]],'3mg')}),
 product({name:'Vampire Vape Heisenberg',brand:'Vampire Vape',category:'Liquids / 3mg',price:22,bottleSize:'100ml',featured:true,
  description:'Mixed berries and a cold finish. The one people rebuy without reading the label.',
  variants:flavours(['Heisenberg','Pinkman'],'3mg')}),
 product({name:'Nasty Juice Slow Blow',brand:'Nasty Juice',category:'Liquids / 12mg',price:10,bottleSize:'30ml',
  variants:flavours(['Pineapple Lemonade','Mango'],'12mg')}),
 product({name:'Twelve Monkeys Kanzi',brand:'Twelve Monkeys',category:'Liquids / 12mg',price:11,bottleSize:'30ml',
  variants:flavours(['Kanzi Watermelon','Tropika'],'12mg')}),
 product({name:'Nasty Juice Cush Man',brand:'Nasty Juice',category:'Liquids / 18mg',price:10,bottleSize:'30ml',
  variants:flavours(['Mango','Mango Grape','Mango Banana'],'18mg')}),
 product({name:'Elf Liq Salt',brand:'Elf Bar',category:'Liquids / 25mg',price:12,bottleSize:'30ml',
  variants:flavours(['Watermelon','Blue Razz','Mango','Cream Tobacco'],'25mg')}),
 product({name:'Lost Mary Salt',brand:'Lost Mary',category:'Liquids / 25mg',price:12,bottleSize:'30ml',
  variants:flavours(['Blue Trio','Triple Mango'],'25mg')}),
 product({name:'Elf Liq Salt Strong',brand:'Elf Bar',category:'Liquids / 50mg',price:13,bottleSize:'30ml',
  description:'Same flavours, salt nicotine, for pod systems only.',
  variants:flavours(['Watermelon','Blue Razz',['Mango',false]],'50mg')}),
 product({name:'Bad Drip Salt',brand:'Bad Drip',category:'Liquids / 50mg',price:13,bottleSize:'30ml',
  variants:flavours(['Farley\'s Gnarly Sauce','Cereal Trip'],'50mg')}),

 // ---- Nicotine pouches: flavours across exactly two strengths ----
 product({name:'Velo Pouches',brand:'Velo',category:'Nicotine pouches',price:6,featured:true,
  description:'Slim, dry pouches. Nothing to light, nothing to charge.',
  variants:[...flavours(['Polar Mint','Ruby Berry','Citrus'],'6mg'),...flavours(['Polar Mint','Ruby Berry',['Citrus',false]],'10mg')]}),
 product({name:'Zyn Pouches',brand:'Zyn',category:'Nicotine pouches',price:7,
  variants:[...flavours(['Cool Mint','Spearmint','Citrus'],'6mg'),...flavours(['Cool Mint','Spearmint','Citrus'],'9mg')]}),
 product({name:'Pablo Pouches',brand:'Pablo',category:'Nicotine pouches',price:8,
  description:'Not a beginner pouch. You will know within a minute.',
  variants:[...flavours(['Ice Cold','Exclusive'],'30mg'),...flavours(['Ice Cold',['Exclusive',false]],'50mg')]}),
];

const find=name=>products.find(p=>p.name===name);
const pick=(name,label)=>{const p=find(name);const variant=p.variants.find(x=>x.label===label)??p.variants[0];return {productId:p.id,variantId:variant.id}};

const bundles=[
 {id:id(),name:'Two bars, one free',badge:'BUY 2 GET 1 FREE',active:true,mode:'items',value:0,image:'',revision:1,updatedAt:now,
  description:'Take two Elf Bars and a Lost Mary goes in the bag for nothing.',
  items:[{...pick('Elf Bar BC5000','Watermelon Ice'),quantity:2,free:false},{...pick('Lost Mary OS5000','Blue Trio'),quantity:1,free:true}]},
 {id:id(),name:'Starter kit — everything to begin',badge:'15% OFF',active:true,mode:'percent',value:15,image:'',revision:1,updatedAt:now,
  description:'A mod, a pack of coils and a bottle of liquid. Walk out ready.',
  items:[{...pick('Voopoo Drag X2','Black'),quantity:1,free:false},{...pick('Voopoo PnP Coils (5-pack)','PnP-VM1 0.3Ω'),quantity:1,free:false},{...pick('Nasty Juice Shisha Series','Double Apple'),quantity:1,free:false}]},
 {id:id(),name:'Shisha night pack',badge:'SET PRICE $30',active:true,mode:'fixed',value:30,image:'',revision:1,updatedAt:now,
  description:'One HUQA bar, a washable hose and the tongs. Enough for a long evening.',
  items:[{...pick('HUQA Shisha Bar 10000','Double Apple'),quantity:1,free:false},{...pick('Washable Shisha Hose','Black'),quantity:1,free:false},{...pick('Coal Tongs & Tray Set','Stainless'),quantity:1,free:false}]},
];

// ---- demo orders, written as files the same way a real checkout writes them ----
const day=86400000;
const money=n=>Math.round(n*100)/100;
function demoOrder(ref,ago,status,contact,lines){
 const createdAt=now-ago;
 const subtotal=money(lines.reduce((s,l)=>s+l.total,0));
 const deliveryFee=subtotal>=50?0:3;
 return {ref,createdAt,status,contact,lines,subtotal,deliveryFee,total:money(subtotal+deliveryFee),deviceId:'demo-'+ref.toLowerCase(),ip:'192.0.2.'+(10+ago%40)};
}
const line=(name,detail,quantity,unitPrice,contents)=>({kind:contents?'bundle':'product',name,detail,quantity,unitPrice,total:money(unitPrice*quantity),...(contents?{contents}:{})});

const orders=[
 demoOrder('HQ-DEMO01',2*3600000,'new',
  {name:'Sami Khoury',phone:'96171234567',area:'Beirut',address:'Hamra, Jeanne d\'Arc street, Yamout building, 3rd floor, next to the pharmacy',note:'After 6pm please'},
  [line('Elf Bar BC5000','Watermelon Ice · 50mg',2,12.5),line('Velo Pouches','Polar Mint · 6mg',1,6)]),
 demoOrder('HQ-DEMO02',26*3600000,'confirmed',
  {name:'Rana Haddad',phone:'96176445588',area:'Mount Lebanon',address:'Jounieh, Sarba highway, Centre Mazloum, block B, 5th floor',note:''},
  [line('Two bars, one free','BUY 2 GET 1 FREE',1,25,['Elf Bar BC5000 — Watermelon Ice · 50mg × 2','Lost Mary OS5000 — Blue Trio · 50mg × 1 (free)']),
   line('Nasty Juice Cush Man','Mango · 18mg · 30ml',1,10)]),
 demoOrder('HQ-DEMO03',4*day,'delivered',
  {name:'Elie Nassar',phone:'96103998877',area:'North Lebanon',address:'Tripoli, Azmi street, above the Byblos Bank branch, 2nd floor',note:'Call before coming up'},
  [line('Voopoo Drag X2','Black',1,42),line('Voopoo PnP Coils (5-pack)','PnP-VM1 0.3Ω',2,12)]),
 demoOrder('HQ-DEMO04',9*day,'delivered',
  {name:'Sami Khoury',phone:'96171234567',area:'Beirut',address:'Hamra, Jeanne d\'Arc street, Yamout building, 3rd floor, next to the pharmacy',note:''},
  [line('HUQA Shisha Bar 10000','Double Apple',1,20),line('Washable Shisha Hose','Black',1,12)]),
 demoOrder('HQ-DEMO05',12*day,'cancelled',
  {name:'Karim Mansour',phone:'96181556677',area:'South Lebanon',address:'Saida, Riad Solh street, Hammoud building, ground floor shop',note:'Changed his mind'},
  [line('Geek Bar Pulse 15000','Miami Mint · 50mg',1,22)]),
];

const customers=new Map();
for(const o of [...orders].sort((a,b)=>a.createdAt-b.createdAt)){
 const key=o.contact.phone;
 const c=customers.get(key)??{phone:key,name:o.contact.name,addresses:[],firstOrderAt:o.createdAt,lastOrderAt:o.createdAt,orderCount:0,totalSpent:0,orders:[],devices:[],lastIp:''};
 c.name=o.contact.name;c.lastOrderAt=o.createdAt;c.orderCount++;c.totalSpent=money(c.totalSpent+o.total);c.lastIp=o.ip;
 if(!c.devices.includes(o.deviceId))c.devices.push(o.deviceId);
 if(!c.addresses.some(a=>a.address===o.contact.address))c.addresses.unshift({area:o.contact.area,address:o.contact.address,lastUsed:o.createdAt});
 c.orders.unshift({ref:o.ref,createdAt:o.createdAt,total:o.total,key:orderKey(o)});
 customers.set(key,c);
}
function orderKey(o){return 'orders/'+String(9999999999999-o.createdAt).padStart(13,'0')+'-'+o.ref+'.json'}

// ---- run it ----
const q=s=>"'"+String(s).replace(/'/g,"''")+"'";
const statements=[
 `DELETE FROM products WHERE owner=${q(OWNER)} AND id LIKE 'd0000000-%';`,
 `DELETE FROM bundles  WHERE owner=${q(OWNER)} AND id LIKE 'd0000000-%';`,
];
if(!clear){
 for(const p of products)statements.push(`INSERT OR REPLACE INTO products(id,owner,data,revision,updated_at) VALUES(${q(p.id)},${q(OWNER)},${q(JSON.stringify(p))},1,${p.updatedAt});`);
 for(const b of bundles)statements.push(`INSERT OR REPLACE INTO bundles(id,owner,data,revision,updated_at) VALUES(${q(b.id)},${q(OWNER)},${q(JSON.stringify(b))},1,${b.updatedAt});`);
 statements.push(
  `INSERT INTO storefront(owner,store_name,tagline,whatsapp,instagram,address,hours,announcement,delivery_fee,free_delivery_over,published,updated_at)`+
  ` SELECT ${q(OWNER)},'HUQA','Arguileh & Vapes','96171392434','huqa.lb','Beirut, Lebanon','Every day, 10:00 – 23:00','Free delivery on orders over $50',3,50,1,${now}`+
  ` WHERE NOT EXISTS(SELECT 1 FROM storefront WHERE owner=${q(OWNER)});`);
}

async function writeThroughNode(){
 const {resolve,join:joinPath}=await import('node:path');
 const {D1}=await import('../server/d1.mjs');
 const {R2}=await import('../server/r2.mjs');
 const dataDir=resolve(process.env.DATA_DIR||'data');
 const db=new D1(joinPath(dataDir,'huqa.sqlite'));
 const bucket=new R2(joinPath(dataDir,'files'));
 try{
  for(const statement of statements)await db.exec(statement);
  for(const o of orders){
   const key=orderKey(o);
   if(clear)await bucket.delete(key); else await bucket.put(key,JSON.stringify(o,null,2));
  }
  for(const c of customers.values()){
   const key=`customers/${c.phone}.json`;
   if(clear)await bucket.delete(key); else await bucket.put(key,JSON.stringify(c,null,2));
  }
 }finally{db.close()}
}

function writeThroughWrangler(){
 const sqlFile=join(work,'seed.sql');
 writeFileSync(sqlFile,statements.join('\n'));
 const wrangler=(args)=>execFileSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js',...args],{stdio:['ignore','pipe','pipe']});
 wrangler(['d1','execute','DB','--local','--config',CONFIG,'--persist-to',STATE,'--file',sqlFile]);
 for(const o of orders){
  const key=orderKey(o);
  if(clear){try{wrangler(['r2','object','delete',`${BUCKET}/${key}`,'--local','--persist-to',STATE])}catch{}continue}
  const f=join(work,o.ref+'.json');
  writeFileSync(f,JSON.stringify(o,null,2));
  wrangler(['r2','object','put',`${BUCKET}/${key}`,'--file',f,'--content-type','application/json','--local','--persist-to',STATE]);
 }
 for(const c of customers.values()){
  const key=`customers/${c.phone}.json`;
  if(clear){try{wrangler(['r2','object','delete',`${BUCKET}/${key}`,'--local','--persist-to',STATE])}catch{}continue}
  const f=join(work,c.phone+'.json');
  writeFileSync(f,JSON.stringify(c,null,2));
  wrangler(['r2','object','put',`${BUCKET}/${key}`,'--file',f,'--content-type','application/json','--local','--persist-to',STATE]);
 }
}

try{
 if(nodeMode)await writeThroughNode(); else writeThroughWrangler();
}catch(e){
 console.error('\nSeeding failed.\n');
 console.error(e.stderr?.toString()||e.message);
 console.error(nodeMode
  ?'\nRun `npm run serve:migrate` first so the database exists.'
  :'\nRun `npm run build` first, and make sure the database is set up (see LOCAL_TESTING.md).');
 rmSync(work,{recursive:true,force:true});
 process.exit(1);
}
rmSync(work,{recursive:true,force:true});

if(clear){console.log('Demo data removed. Your own products and orders were left alone.');}
else{
 const variants=products.reduce((s,p)=>s+p.variants.length,0);
 console.log(`Seeded ${products.length} products (${variants} flavours/options), ${bundles.length} offers, ${orders.length} orders and ${customers.size} customer files.`);
 console.log('\nStart the site with `npm start`, then:');
 console.log('  /        the shop, already stocked');
 console.log('  /admin   create your username and password, then look at Orders');
 console.log('\nProducts have no photos — add them in the editor. Remove all of this with `node scripts/seed-demo.mjs --clear`.');
}
