'use client';
import {createContext,useContext,useEffect,useMemo,useState,ReactNode} from 'react';
import {Bundle,CartLine,Product,priceBundle,variantLabel} from '@/app/model';

const CART_KEY='huqa.cart.v1',DEVICE_KEY='huqa.device.v1';
export const lineKey=(l:CartLine)=>l.kind==='bundle'?'b:'+l.bundleId:'p:'+l.productId+':'+l.variantId;

export type ResolvedLine={key:string;line:CartLine;name:string;detail:string;image:string;unitPrice:number;total:number;available:boolean;contents:string[];href:string};

type CartApi={
 lines:CartLine[];resolved:ResolvedLine[];count:number;subtotal:number;ready:boolean;
 open:boolean;setOpen:(v:boolean)=>void;deviceId:string;
 add:(line:CartLine)=>void;setQuantity:(key:string,quantity:number)=>void;remove:(key:string)=>void;clear:()=>void;
};
const CartContext=createContext<CartApi|null>(null);
export function useCart(){const c=useContext(CartContext);if(!c)throw new Error('useCart must be used inside CartProvider');return c}

const read=<T,>(key:string,fallback:T):T=>{try{const v=localStorage.getItem(key);return v?JSON.parse(v) as T:fallback}catch{return fallback}};
const write=(key:string,value:unknown)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{/* private mode */}};

export function CartProvider({products,bundles,children}:{products:Product[];bundles:Bundle[];children:ReactNode}){
 const [lines,setLines]=useState<CartLine[]>([]);
 const [deviceId,setDeviceId]=useState('');
 const [ready,setReady]=useState(false);
 const [open,setOpen]=useState(false);

 useEffect(()=>{
  setLines(read<CartLine[]>(CART_KEY,[]).filter(l=>l&&(l.kind==='product'||l.kind==='bundle')));
  const existing=read<string>(DEVICE_KEY,'');
  const id=existing||crypto.randomUUID();
  if(!existing)write(DEVICE_KEY,id);
  setDeviceId(id);
  setReady(true);
 },[]);
 useEffect(()=>{if(ready)write(CART_KEY,lines)},[lines,ready]);

 const resolved=useMemo(()=>lines.flatMap<ResolvedLine>(line=>{
  if(line.kind==='bundle'){
   const bundle=bundles.find(b=>b.id===line.bundleId&&b.active);
   const priced=bundle&&priceBundle(bundle,products);
   if(!priced)return [];
   return [{key:lineKey(line),line,name:priced.name,detail:priced.badge||'Offer',image:priced.image||priced.lines[0]?.product.image||'',unitPrice:priced.price,total:Math.round(priced.price*line.quantity*100)/100,available:priced.lines.every(l=>l.variant.available),contents:priced.lines.map(l=>`${l.product.name} — ${variantLabel(l.product,l.variant)} × ${l.quantity}${l.free?' (free)':''}`),href:'/bundles'}];
  }
  const product=products.find(p=>p.id===line.productId);
  const variant=product?.variants.find(v=>v.id===line.variantId);
  if(!product||!variant)return [];
  const unitPrice=product.price??0;
  return [{key:lineKey(line),line,name:product.name,detail:variantLabel(product,variant),image:product.image,unitPrice,total:Math.round(unitPrice*line.quantity*100)/100,available:variant.available,contents:[],href:'/product/'+product.id}];
 }),[lines,products,bundles]);

 // Anything that vanished from the catalogue is dropped rather than shown as a ghost row.
 useEffect(()=>{
  if(!ready||!products.length)return;
  const live=new Set(resolved.map(r=>r.key));
  setLines(current=>current.length===live.size?current:current.filter(l=>live.has(lineKey(l))));
 },[ready,products.length,resolved]);

 const api:CartApi={
  lines,resolved,ready,open,setOpen,deviceId,
  count:resolved.reduce((s,r)=>s+r.line.quantity,0),
  subtotal:Math.round(resolved.reduce((s,r)=>s+r.total,0)*100)/100,
  add:line=>setLines(current=>{const key=lineKey(line);const found=current.find(l=>lineKey(l)===key);return found?current.map(l=>lineKey(l)===key?{...l,quantity:Math.min(99,l.quantity+line.quantity)}:l):[...current,line]}),
  setQuantity:(key,quantity)=>setLines(current=>quantity<1?current.filter(l=>lineKey(l)!==key):current.map(l=>lineKey(l)===key?{...l,quantity:Math.min(99,quantity)}:l)),
  remove:key=>setLines(current=>current.filter(l=>lineKey(l)!==key)),
  clear:()=>setLines([]),
 };
 return <CartContext.Provider value={api}>{children}</CartContext.Provider>;
}
