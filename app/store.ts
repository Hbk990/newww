import {db,HttpError,OWNER} from './server';
import {Product,Bundle,Store} from './model';

export const defaultStore:Store&{published:boolean}={storeName:'HUQA',tagline:'Arguileh & Vapes',whatsapp:'96171392434',instagram:'',address:'',hours:'',announcement:'',deliveryFee:0,freeDeliveryOver:0,published:false};

export async function storeSettings():Promise<Store&{published:boolean}>{
 const r:any=await db().prepare('SELECT * FROM storefront WHERE owner=?').bind(OWNER).first();
 if(!r)return defaultStore;
 return {storeName:String(r.store_name),tagline:String(r.tagline||''),whatsapp:String(r.whatsapp),instagram:String(r.instagram||''),address:String(r.address||''),hours:String(r.hours||''),announcement:String(r.announcement||''),deliveryFee:Number(r.delivery_fee)||0,freeDeliveryOver:Number(r.free_delivery_over)||0,published:!!r.published};
}

export async function catalog():Promise<Product[]>{
 const r=await db().prepare('SELECT data FROM products WHERE owner=? ORDER BY updated_at DESC').bind(OWNER).all();
 return r.results.map((x:any)=>JSON.parse(x.data) as Product);
}

export async function bundleList():Promise<Bundle[]>{
 const r=await db().prepare('SELECT data FROM bundles WHERE owner=? ORDER BY updated_at DESC').bind(OWNER).all();
 return r.results.map((x:any)=>JSON.parse(x.data) as Bundle);
}

const str=(x:any,key:string,max:number,required=false)=>{const v=x[key];if(typeof v!=='string'||v.length>max)throw new HttpError(400,`Invalid ${key}.`);if(required&&!v.trim())throw new HttpError(400,`Enter a ${key}.`);return v.trim()};
const cash=(x:any,key:string,max:number)=>{const v=x[key];if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>max||Math.abs(v*100-Math.round(v*100))>1e-6)throw new HttpError(400,`Enter a valid amount for ${key}.`);return Math.round(v*100)/100};

export function validateStore(x:any):Store&{published:boolean}{
 const whatsapp=str(x,'whatsapp',24,true).replace(/[\s()+-]/g,'').replace(/^00/,'');
 if(!/^[0-9]{8,15}$/.test(whatsapp))throw new HttpError(400,'Enter the WhatsApp number in international format — for example 96171392434.');
 const instagram=str(x,'instagram',60).replace(/^@/,'');
 if(instagram&&!/^[A-Za-z0-9._]{1,30}$/.test(instagram))throw new HttpError(400,'Enter a valid Instagram handle.');
 return {storeName:str(x,'storeName',80,true),tagline:str(x,'tagline',160),whatsapp,instagram,address:str(x,'address',200),hours:str(x,'hours',120),announcement:str(x,'announcement',200),deliveryFee:cash(x,'deliveryFee',1000),freeDeliveryOver:cash(x,'freeDeliveryOver',100000),published:x.published===true};
}

const uuid=/^[a-f0-9-]{36}$/;
export function validateBundle(x:any):Bundle{
 if(!x||typeof x!=='object')throw new HttpError(400,'Invalid bundle.');
 const image=str(x,'image',200);
 if(image&&!/^\/api\/image\?id=[a-f0-9-]{36}$/.test(image))throw new HttpError(400,'Choose an uploaded image.');
 if(!Array.isArray(x.items)||x.items.length<2||x.items.length>20)throw new HttpError(400,'A bundle needs between 2 and 20 items.');
 const items=x.items.map((i:any)=>{
  if(!uuid.test(String(i?.productId))||!uuid.test(String(i?.variantId)))throw new HttpError(400,'Every bundle item needs a product and a flavour.');
  if(!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>99)throw new HttpError(400,'Bundle item quantities must be between 1 and 99.');
  return {productId:i.productId,variantId:i.variantId,quantity:i.quantity,free:i.free===true};
 });
 if(!['items','fixed','percent'].includes(x.mode))throw new HttpError(400,'Choose how the bundle is priced.');
 if(x.mode==='items'&&!items.some((i:any)=>i.free))throw new HttpError(400,'Mark at least one item as free, or price the bundle another way.');
 if(x.mode==='items'&&items.every((i:any)=>i.free))throw new HttpError(400,'At least one item in the bundle has to be paid for.');
 const value=x.mode==='percent'?cash(x,'value',100):x.mode==='fixed'?cash(x,'value',1000000):0;
 if(x.mode==='percent'&&value<=0)throw new HttpError(400,'Enter a discount between 0 and 100 percent.');
 return {id:typeof x.id==='string'?x.id:'',name:str(x,'name',120,true),badge:str(x,'badge',40),description:str(x,'description',1000),image,items,mode:x.mode,value,active:x.active===true,revision:Number.isInteger(x.revision)?x.revision:0,updatedAt:Date.now()};
}
