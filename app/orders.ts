import {bucket,HttpError} from './server';
import {Bundle,CartLine,Contact,Order,OrderLine,OrderStatus,Product,Store,deliveryAreas,deliveryCost,lebanesePhone,money,orderStatuses,priceBundle,variantLabel} from './model';

// Customers and orders are plain JSON files rather than tables: one file per customer
// under their phone number, one file per order. Order keys carry an inverted timestamp
// so a plain bucket listing comes back newest first.
const ORDERS='orders/',CUSTOMERS='customers/',FAR_FUTURE=9999999999999;
export const orderKey=(createdAt:number,ref:string)=>ORDERS+String(FAR_FUTURE-createdAt).padStart(13,'0')+'-'+ref+'.json';
export const customerKey=(phone:string)=>CUSTOMERS+phone+'.json';

export type Customer={phone:string;name:string;addresses:{area:string;address:string;lastUsed:number}[];firstOrderAt:number;lastOrderAt:number;orderCount:number;totalSpent:number;orders:{ref:string;createdAt:number;total:number;key:string}[];devices:string[];lastIp:string};

const REF_ALPHABET='ACDEFGHJKLMNPQRTUVWXY3456789';
const newRef=()=>'HQ-'+Array.from(crypto.getRandomValues(new Uint8Array(6)),b=>REF_ALPHABET[b%REF_ALPHABET.length]).join('');

async function readJson<T>(key:string):Promise<T|null>{const o=await bucket().get(key);return o?JSON.parse(await o.text()) as T:null}
const writeJson=(key:string,value:unknown)=>bucket().put(key,JSON.stringify(value,null,2),{httpMetadata:{contentType:'application/json'}});

export function validateContact(x:any):Contact{
 const field=(key:string,max:number,required=true)=>{const v=x?.[key];if(typeof v!=='string'||v.length>max)throw new HttpError(400,`Invalid ${key}.`);const t=v.trim();if(required&&!t)throw new HttpError(400,`Please fill in your ${key}.`);return t};
 const name=field('name',80);
 if(name.length<2)throw new HttpError(400,'Please enter your full name.');
 let phone:string;
 try{phone=lebanesePhone(field('phone',24))}catch(e){throw new HttpError(400,(e as Error).message)}
 const area=field('area',40);
 if(!deliveryAreas.includes(area))throw new HttpError(400,'Choose your delivery area.');
 const address=field('address',400);
 if(address.length<10)throw new HttpError(400,'Please give a detailed address — building, street and any landmark.');
 return {name,phone,area,address,note:field('note',500,false)};
}

// Prices always come from the catalogue, never from the browser.
export function buildOrder(cart:unknown,contact:Contact,store:Store,products:Product[],bundles:Bundle[],deviceId:string,ip:string):Order{
 if(!Array.isArray(cart)||!cart.length||cart.length>40)throw new HttpError(400,'Your cart is empty or too large.');
 const lines:OrderLine[]=(cart as CartLine[]).map(entry=>{
  const quantity=(entry as any)?.quantity;
  if(!Number.isInteger(quantity)||quantity<1||quantity>99)throw new HttpError(400,'Choose a quantity between 1 and 99.');
  if(entry?.kind==='bundle'){
   const bundle=bundles.find(b=>b.id===entry.bundleId&&b.active);
   const priced=bundle&&priceBundle(bundle,products);
   if(!priced)throw new HttpError(409,'One of the offers in your cart is no longer available. Please refresh and try again.');
   if(priced.lines.some(l=>!l.variant.available))throw new HttpError(409,`"${priced.name}" is out of stock. Please remove it and try again.`);
   return {kind:'bundle' as const,name:priced.name,detail:priced.badge,quantity,unitPrice:priced.price,total:Math.round(priced.price*quantity*100)/100,contents:priced.lines.map(l=>`${l.product.name} — ${variantLabel(l.product,l.variant)} × ${l.quantity}${l.free?' (free)':''}`)};
  }
  if(entry?.kind!=='product')throw new HttpError(400,'Your cart could not be read. Please rebuild it.');
  const product=products.find(p=>p.id===entry.productId);
  const variant=product?.variants.find(v=>v.id===entry.variantId);
  if(!product||!variant)throw new HttpError(409,'An item in your cart is no longer available. Please refresh and try again.');
  if(!variant.available)throw new HttpError(409,`"${product.name} — ${variantLabel(product,variant)}" is out of stock. Please remove it and try again.`);
  const unitPrice=product.price??0;
  return {kind:'product' as const,name:product.name,detail:variantLabel(product,variant),quantity,unitPrice,total:Math.round(unitPrice*quantity*100)/100};
 });
 const subtotal=Math.round(lines.reduce((s,l)=>s+l.total,0)*100)/100;
 const deliveryFee=deliveryCost(store,subtotal);
 const createdAt=Date.now();
 return {ref:newRef(),createdAt,status:'new',contact,lines,subtotal,deliveryFee,total:Math.round((subtotal+deliveryFee)*100)/100,deviceId,ip};
}

export async function recordOrder(order:Order){
 const key=orderKey(order.createdAt,order.ref);
 const existing=await readJson<Customer>(customerKey(order.contact.phone));
 const recent=(existing?.orders??[]).filter(o=>order.createdAt-o.createdAt<3600000);
 if(recent.length>=10)throw new HttpError(429,'That is a lot of orders in one hour. Please message us on WhatsApp instead.');
 await writeJson(key,order);
 const addresses=[{area:order.contact.area,address:order.contact.address,lastUsed:order.createdAt},...(existing?.addresses??[]).filter(a=>a.address!==order.contact.address)].slice(0,10);
 const customer:Customer={
  phone:order.contact.phone,name:order.contact.name,addresses,
  firstOrderAt:existing?.firstOrderAt??order.createdAt,lastOrderAt:order.createdAt,
  orderCount:(existing?.orderCount??0)+1,
  totalSpent:Math.round(((existing?.totalSpent??0)+order.total)*100)/100,
  orders:[{ref:order.ref,createdAt:order.createdAt,total:order.total,key},...(existing?.orders??[])].slice(0,500),
  devices:[...new Set([order.deviceId,...(existing?.devices??[])].filter(Boolean))].slice(0,20),
  lastIp:order.ip,
 };
 await writeJson(customerKey(order.contact.phone),customer);
 return key;
}

export async function listOrders(cursor?:string){
 const page=await bucket().list({prefix:ORDERS,limit:200,cursor});
 const orders=await Promise.all(page.objects.map(async o=>{const v=await readJson<Order>(o.key);return v?{...v,key:o.key}:null}));
 return {orders:orders.filter(Boolean) as (Order&{key:string})[],cursor:page.truncated?page.cursor:null};
}

export async function listCustomers(cursor?:string){
 const page=await bucket().list({prefix:CUSTOMERS,limit:200,cursor});
 const customers=await Promise.all(page.objects.map(o=>readJson<Customer>(o.key)));
 return {customers:(customers.filter(Boolean) as Customer[]).sort((a,b)=>b.lastOrderAt-a.lastOrderAt),cursor:page.truncated?page.cursor:null};
}

export async function setOrderStatus(key:string,status:string){
 if(!key.startsWith(ORDERS)||key.includes('..'))throw new HttpError(400,'Unknown order.');
 if(!orderStatuses.includes(status as OrderStatus))throw new HttpError(400,'Unknown order status.');
 const order=await readJson<Order>(key);
 if(!order)throw new HttpError(404,'Order not found.');
 order.status=status as OrderStatus;
 await writeJson(key,order);
 return order;
}

export const orderSummary=(o:Order)=>`${o.ref} · ${o.contact.name} · ${money(o.total)}`;
