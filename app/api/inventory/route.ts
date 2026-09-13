import {cookies} from 'next/headers';
import {authenticated,db,HttpError,checkOrigin,failure,hashPassword,newSession,digest,OWNER,SESSION_COOKIE} from '../../server';
import {categories,legacyCategories,Product,liquidBottleSize} from '../../model';
import {storeSettings,validateStore,validateBundle,catalog,bundleList} from '../../store';
import {listOrders,listCustomers,setOrderStatus} from '../../orders';
export const dynamic='force-dynamic';
const response=(v:unknown)=>Response.json(v,{headers:{'Cache-Control':'no-store'}});
function credentials(x:any){if(typeof x.username!=='string'||!/^[a-zA-Z0-9_.-]{3,40}$/.test(x.username))throw new HttpError(400,'Use 3–40 letters, numbers, dots, underscores or hyphens for your username.');if(typeof x.password!=='string'||x.password.length<12||x.password.length>128)throw new HttpError(400,'Use a password between 12 and 128 characters.');}
function product(x:any):Product{if(!x||typeof x!=='object')throw new HttpError(400,'Invalid product.');for(const [k,max] of [['name',150],['brand',100],['description',3000],['image',200]] as const){if(typeof x[k]!=='string'||x[k].length>max)throw new HttpError(400,`Invalid ${k}.`)}if(!x.name.trim()||(!categories.includes(x.category)&&!legacyCategories.includes(x.category)))throw new HttpError(400,'Enter a product name and choose a category.');if(x.image&&!/^\/api\/image\?id=[a-f0-9-]{36}$/.test(x.image))throw new HttpError(400,'Choose an uploaded image.');if(!Array.isArray(x.variants)||!x.variants.length||x.variants.length>100)throw new HttpError(400,'Add between 1 and 100 variants.');const seen=new Set();const ids=new Set();for(const v of x.variants){if(typeof v.id!=='string'||! /^[a-f0-9-]{36}$/.test(v.id)||ids.has(v.id)||typeof v.label!=='string'||!v.label.trim()||v.label.length>120||typeof v.strength!=='string'||v.strength.length>30||typeof v.available!=='boolean')throw new HttpError(400,'Each variant needs a unique ID, a name and an availability setting.');ids.add(v.id);const key=v.label.trim().toLowerCase()+'|'+v.strength.trim().toLowerCase();if(seen.has(key))throw new HttpError(400,'The same variant and strength cannot be repeated within a product.');seen.add(key)}if(x.category==='Nicotine pouches'&&new Set(x.variants.map((v:any)=>v.strength.trim())).size>2)throw new HttpError(400,'Use at most two nicotine strengths per pouch model.');if(typeof x.price!=='number'||!Number.isFinite(x.price)||x.price<0||x.price>1000000||Math.abs(x.price*100-Math.round(x.price*100))>0.000001)throw new HttpError(400,'Enter a valid price in USD with at most two decimal places.');let bottleSize;try{bottleSize=liquidBottleSize(x.category,x.bottleSize)}catch(e){throw new HttpError(400,(e as Error).message)}return {price:Math.round(x.price*100)/100,bottleSize,id:typeof x.id==='string'?x.id:'',name:x.name.trim(),brand:x.brand.trim(),description:x.description.trim(),category:x.category,image:x.image,featured:x.featured===true,variants:x.variants.map((v:any)=>({id:v.id,label:v.label.trim(),strength:v.strength.trim(),available:v.available})),revision:Number.isInteger(x.revision)?x.revision:0,updatedAt:Date.now()}}

export async function GET(req:Request){try{
 const url=new URL(req.url);
 const view=url.searchParams.get('view');
 if(view==='status'){const a=await db().prepare('SELECT username FROM admins WHERE owner=?').bind(OWNER).first();let loggedIn=false;try{await authenticated();loggedIn=true}catch{}return response({setup:!a,loggedIn,username:loggedIn?a?.username:null,store:loggedIn?await storeSettings():null})}
 await authenticated();
 if(view==='backup'){const [p,s]=await Promise.all([db().prepare('SELECT data FROM products WHERE owner=?').bind(OWNER).all(),db().prepare('SELECT data,action,created_at FROM snapshots WHERE owner=? ORDER BY created_at DESC LIMIT 1000').bind(OWNER).all()]);return response({exportedAt:new Date().toISOString(),products:p.results.map((r:any)=>JSON.parse(r.data)),bundles:await bundleList(),history:s.results,notice:'Product data and up to 1000 recent snapshots. Images remain in protected storage.'})}
 if(view==='orders')return response(await listOrders(url.searchParams.get('cursor')||undefined));
 if(view==='customers')return response(await listCustomers(url.searchParams.get('cursor')||undefined));
 const [products,bundles]=await Promise.all([catalog(),bundleList()]);
 return response({products,bundles});
}catch(e){return failure(e)}}

export async function POST(req:Request){try{
 checkOrigin(req);
 if(Number(req.headers.get('content-length')||0)>200000)throw new HttpError(413,'Request too large.');
 const raw=await req.text();
 if(raw.length>200000)throw new HttpError(413,'Request too large.');
 const x=JSON.parse(raw);
 if(['setup','login','recover'].includes(x.action)){
  const a:any=await db().prepare('SELECT * FROM admins WHERE owner=?').bind(OWNER).first();
  if(x.action==='setup'){if(a)throw new HttpError(409,'Admin setup is already complete.');credentials(x);const salt=crypto.randomUUID();const recoveryCode=crypto.randomUUID()+crypto.randomUUID();await db().prepare('INSERT INTO admins(owner,username,hash,salt,recovery_hash) VALUES(?,?,?,?,?)').bind(OWNER,x.username,await hashPassword(x.password,salt),salt,await digest(recoveryCode)).run();await newSession();return response({ok:true,recoveryCode})}
  if(!a)throw new HttpError(400,'Complete admin setup first.');
  if(a.locked_until>Date.now())throw new HttpError(429,'Too many attempts. Try again in 15 minutes.');
  if(typeof x.password!=='string'||x.password.length>128||typeof x.username!=='string')throw new HttpError(400,'Invalid credentials.');
  await db().prepare('UPDATE admins SET failures=failures+1,locked_until=CASE WHEN failures>=4 THEN ? ELSE locked_until END WHERE owner=?').bind(Date.now()+15*60000,OWNER).run();
  if(x.action==='recover'){credentials(x);if(typeof x.recoveryCode!=='string'||x.recoveryCode.length>100||await digest(x.recoveryCode)!==a.recovery_hash)throw new HttpError(401,'Recovery code is incorrect.');const salt=crypto.randomUUID();const recoveryCode=crypto.randomUUID()+crypto.randomUUID();await db().batch([db().prepare('UPDATE admins SET username=?,hash=?,salt=?,recovery_hash=?,failures=0,locked_until=0 WHERE owner=?').bind(x.username,await hashPassword(x.password,salt),salt,await digest(recoveryCode),OWNER),db().prepare('DELETE FROM sessions WHERE owner=?').bind(OWNER)]);await newSession();return response({ok:true,recoveryCode})}
  if(x.username!==a.username||await hashPassword(x.password,a.salt)!==a.hash)throw new HttpError(401,'Incorrect username or password.');
  await db().prepare('UPDATE admins SET failures=0,locked_until=0 WHERE owner=?').bind(OWNER).run();
  await newSession();return response({ok:true});
 }
 await authenticated();
 if(x.action==='logout'){const token=(await cookies()).get(SESSION_COOKIE)?.value;if(token)await db().prepare('DELETE FROM sessions WHERE id=?').bind(await digest(token)).run();(await cookies()).delete(SESSION_COOKIE);return response({ok:true})}
 if(x.action==='credentials'){credentials(x);const a:any=await db().prepare('SELECT * FROM admins WHERE owner=?').bind(OWNER).first();if(typeof x.currentPassword!=='string'||x.currentPassword.length>128||await hashPassword(x.currentPassword,a.salt)!==a.hash)throw new HttpError(401,'Current password is incorrect.');const salt=crypto.randomUUID();await db().batch([db().prepare('UPDATE admins SET username=?,hash=?,salt=? WHERE owner=?').bind(x.username,await hashPassword(x.password,salt),salt,OWNER),db().prepare('DELETE FROM sessions WHERE owner=?').bind(OWNER)]);await newSession();return response({ok:true})}
 if(x.action==='storefront'){const s=validateStore(x.store);await db().prepare('INSERT INTO storefront(owner,store_name,tagline,whatsapp,instagram,address,hours,announcement,delivery_fee,free_delivery_over,published,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET store_name=excluded.store_name,tagline=excluded.tagline,whatsapp=excluded.whatsapp,instagram=excluded.instagram,address=excluded.address,hours=excluded.hours,announcement=excluded.announcement,delivery_fee=excluded.delivery_fee,free_delivery_over=excluded.free_delivery_over,published=excluded.published,updated_at=excluded.updated_at').bind(OWNER,s.storeName,s.tagline,s.whatsapp,s.instagram,s.address,s.hours,s.announcement,s.deliveryFee,s.freeDeliveryOver,s.published?1:0,Date.now()).run();return response({store:s})}
 if(x.action==='save'){
  const p=product(x.product);
  if(p.image){const image=await db().prepare('SELECT id FROM images WHERE id=? AND owner=?').bind(p.image.split('=')[1],OWNER).first();if(!image)throw new HttpError(400,'Image not found. Please upload it again.')}
  if(p.id){const old:any=await db().prepare('SELECT data,revision FROM products WHERE id=? AND owner=?').bind(p.id,OWNER).first();if(!old)throw new HttpError(404,'Product not found.');if(old.revision!==p.revision)throw new HttpError(409,'This product was updated elsewhere. Close the editor, refresh, and try again.');p.revision++;const results=await db().batch([db().prepare('INSERT INTO snapshots(id,owner,product_id,data,action,created_at) SELECT ?,owner,id,data,?,? FROM products WHERE id=? AND owner=? AND revision=?').bind(crypto.randomUUID(),'updated',Date.now(),p.id,OWNER,p.revision-1),db().prepare('UPDATE products SET data=?,revision=?,updated_at=? WHERE id=? AND owner=? AND revision=?').bind(JSON.stringify(p),p.revision,p.updatedAt,p.id,OWNER,p.revision-1)]);if(!results[1].meta.changes)throw new HttpError(409,'This product changed in another session. Refresh before saving.')}
  else{p.id=crypto.randomUUID();p.revision=1;await db().prepare('INSERT INTO products(id,owner,data,revision,updated_at) VALUES(?,?,?,?,?)').bind(p.id,OWNER,JSON.stringify(p),p.revision,p.updatedAt).run()}
  return response({product:p});
 }
 if(x.action==='delete'){
  const used=await db().prepare('SELECT data FROM bundles WHERE owner=? AND data LIKE ? LIMIT 1').bind(OWNER,'%"productId":"'+x.id+'"%').first();
  if(used)throw new HttpError(409,`"${JSON.parse(String((used as any).data)).name}" includes this product. Remove it from that offer first.`);
  const r=await db().batch([db().prepare('INSERT INTO snapshots(id,owner,product_id,data,action,created_at) SELECT ?,owner,id,data,?,? FROM products WHERE id=? AND owner=? AND revision=?').bind(crypto.randomUUID(),'deleted',Date.now(),x.id,OWNER,x.revision),db().prepare('DELETE FROM products WHERE id=? AND owner=? AND revision=?').bind(x.id,OWNER,x.revision)]);
  if(!r[1].meta.changes)throw new HttpError(409,'Product changed or was already removed. Refresh and try again.');
  return response({ok:true});
 }
 if(x.action==='bundle'){
  const b=validateBundle(x.bundle);
  if(b.image){const image=await db().prepare('SELECT id FROM images WHERE id=? AND owner=?').bind(b.image.split('=')[1],OWNER).first();if(!image)throw new HttpError(400,'Image not found. Please upload it again.')}
  if(b.id){const old:any=await db().prepare('SELECT revision FROM bundles WHERE id=? AND owner=?').bind(b.id,OWNER).first();if(!old)throw new HttpError(404,'Offer not found.');if(old.revision!==b.revision)throw new HttpError(409,'This offer was updated elsewhere. Refresh and try again.');b.revision++;const r=await db().prepare('UPDATE bundles SET data=?,revision=?,updated_at=? WHERE id=? AND owner=? AND revision=?').bind(JSON.stringify(b),b.revision,b.updatedAt,b.id,OWNER,b.revision-1).run();if(!r.meta.changes)throw new HttpError(409,'This offer changed in another session. Refresh before saving.')}
  else{b.id=crypto.randomUUID();b.revision=1;await db().prepare('INSERT INTO bundles(id,owner,data,revision,updated_at) VALUES(?,?,?,?,?)').bind(b.id,OWNER,JSON.stringify(b),b.revision,b.updatedAt).run()}
  return response({bundle:b});
 }
 if(x.action==='bundle-delete'){const r=await db().prepare('DELETE FROM bundles WHERE id=? AND owner=?').bind(x.id,OWNER).run();if(!r.meta.changes)throw new HttpError(404,'Offer not found.');return response({ok:true})}
 if(x.action==='order-status')return response({order:await setOrderStatus(String(x.key),String(x.status))});
 throw new HttpError(400,'Unknown action.');
}catch(e){if(e instanceof SyntaxError)return failure(new HttpError(400,'Invalid request.'));return failure(e)}}
