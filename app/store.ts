import {db,HttpError,OWNER} from './server';
import {Product,Bundle,BundleItem,Store} from './model';

export const defaultStore:Store&{published:boolean}={storeName:'HUQA',tagline:'Arguileh & Vapes',whatsapp:'96171392434',instagram:'',address:'',hours:'',announcement:'',deliveryFee:0,freeDeliveryOver:0,published:false};

type StoreRow={store_name:string;tagline:string|null;whatsapp:string;instagram:string|null;address:string|null;hours:string|null;announcement:string|null;delivery_fee:number;free_delivery_over:number;published:number};

export async function storeSettings():Promise<Store&{published:boolean}>{
 const r=await db().prepare('SELECT * FROM storefront WHERE owner=?').bind(OWNER).first<StoreRow>();
 if(!r)return defaultStore;
 return {storeName:r.store_name,tagline:r.tagline??'',whatsapp:r.whatsapp,instagram:r.instagram??'',address:r.address??'',hours:r.hours??'',announcement:r.announcement??'',deliveryFee:Number(r.delivery_fee)||0,freeDeliveryOver:Number(r.free_delivery_over)||0,published:!!r.published};
}

export async function catalog():Promise<Product[]>{
 const r=await db().prepare('SELECT data FROM products WHERE owner=? ORDER BY updated_at DESC').bind(OWNER).all<{data:string}>();
 return r.results.map(x=>JSON.parse(x.data) as Product);
}

export async function bundleList():Promise<Bundle[]>{
 const r=await db().prepare('SELECT data FROM bundles WHERE owner=? ORDER BY updated_at DESC').bind(OWNER).all<{data:string}>();
 return r.results.map(x=>JSON.parse(x.data) as Bundle);
}

const at=(x:unknown,key:string):unknown=>x&&typeof x==='object'?(x as Record<string,unknown>)[key]:undefined;
const str=(x:unknown,key:string,max:number,required=false)=>{const v=at(x,key);if(typeof v!=='string'||v.length>max)throw new HttpError(400,`Invalid ${key}.`);if(required&&!v.trim())throw new HttpError(400,`Enter a ${key}.`);return v.trim()};
const cash=(x:unknown,key:string,max:number)=>{const v=at(x,key);if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>max||Math.abs(v*100-Math.round(v*100))>1e-6)throw new HttpError(400,`Enter a valid amount for ${key}.`);return Math.round(v*100)/100};

export function validateStore(x:unknown):Store&{published:boolean}{
 const whatsapp=str(x,'whatsapp',24,true).replace(/[\s()+-]/g,'').replace(/^00/,'');
 if(!/^[0-9]{8,15}$/.test(whatsapp))throw new HttpError(400,'Enter the WhatsApp number in international format — for example 96171392434.');
 const instagram=str(x,'instagram',60).replace(/^@/,'');
 if(instagram&&!/^[A-Za-z0-9._]{1,30}$/.test(instagram))throw new HttpError(400,'Enter a valid Instagram handle.');
 return {storeName:str(x,'storeName',80,true),tagline:str(x,'tagline',160),whatsapp,instagram,address:str(x,'address',200),hours:str(x,'hours',120),announcement:str(x,'announcement',200),deliveryFee:cash(x,'deliveryFee',1000),freeDeliveryOver:cash(x,'freeDeliveryOver',100000),published:at(x,'published')===true};
}

const uuid=/^[a-f0-9-]{36}$/;
export function validateBundle(x:unknown):Bundle{
 if(!x||typeof x!=='object')throw new HttpError(400,'Invalid bundle.');
 const image=str(x,'image',200);
 if(image&&!/^\/api\/image\?id=[a-f0-9-]{36}$/.test(image))throw new HttpError(400,'Choose an uploaded image.');
 const raw=at(x,'items');
 if(!Array.isArray(raw)||raw.length<2||raw.length>20)throw new HttpError(400,'A bundle needs between 2 and 20 items.');
 const items:BundleItem[]=raw.map(entry=>{
  const productId=at(entry,'productId'),variantId=at(entry,'variantId'),quantity=at(entry,'quantity');
  if(typeof productId!=='string'||!uuid.test(productId)||typeof variantId!=='string'||!uuid.test(variantId))throw new HttpError(400,'Every bundle item needs a product and a flavour.');
  if(!Number.isInteger(quantity)||(quantity as number)<1||(quantity as number)>99)throw new HttpError(400,'Bundle item quantities must be between 1 and 99.');
  return {productId,variantId,quantity:quantity as number,free:at(entry,'free')===true};
 });
 const mode=at(x,'mode');
 if(mode!=='items'&&mode!=='fixed'&&mode!=='percent')throw new HttpError(400,'Choose how the bundle is priced.');
 if(mode==='items'&&!items.some(i=>i.free))throw new HttpError(400,'Mark at least one item as free, or price the bundle another way.');
 if(mode==='items'&&items.every(i=>i.free))throw new HttpError(400,'At least one item in the bundle has to be paid for.');
 const value=mode==='percent'?cash(x,'value',100):mode==='fixed'?cash(x,'value',1000000):0;
 if(mode==='percent'&&value<=0)throw new HttpError(400,'Enter a discount between 0 and 100 percent.');
 const id=at(x,'id'),revision=at(x,'revision');
 return {id:typeof id==='string'?id:'',name:str(x,'name',120,true),badge:str(x,'badge',40),description:str(x,'description',1000),image,items,mode,value,active:at(x,'active')===true,revision:Number.isInteger(revision)?revision as number:0,updatedAt:Date.now()};
}
