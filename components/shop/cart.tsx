'use client';
import {createContext,useContext,useMemo,useState,useSyncExternalStore,ReactNode} from 'react';
import {Bundle,CartLine,Product,priceBundle,variantLabel} from '@/app/model';
import {deviceId,getServerSnapshot,getSnapshot,lineKey,subscribe,update} from './cart-store';

export {lineKey};
export type ResolvedLine={key:string;line:CartLine;name:string;detail:string;image:string;unitPrice:number;total:number;available:boolean;contents:string[];href:string};

type CartApi={
 resolved:ResolvedLine[];payload:CartLine[];count:number;subtotal:number;ready:boolean;
 open:boolean;setOpen:(v:boolean)=>void;deviceId:()=>string;
 add:(line:CartLine)=>void;setQuantity:(key:string,quantity:number)=>void;remove:(key:string)=>void;clear:()=>void;
};
const CartContext=createContext<CartApi|null>(null);
export function useCart(){const c=useContext(CartContext);if(!c)throw new Error('useCart must be used inside CartProvider');return c}

export function CartProvider({products,bundles,children}:{products:Product[];bundles:Bundle[];children:ReactNode}){
 const lines=useSyncExternalStore(subscribe,getSnapshot,getServerSnapshot);
 const ready=useSyncExternalStore(subscribe,()=>true,()=>false);
 const [open,setOpen]=useState(false);

 // Lines whose product or offer has left the catalogue simply stop resolving, so they
 // never reach the cart, the totals or the order payload.
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

 const api:CartApi={
  resolved,ready,open,setOpen,deviceId,
  payload:resolved.map(r=>r.line),
  count:resolved.reduce((s,r)=>s+r.line.quantity,0),
  subtotal:Math.round(resolved.reduce((s,r)=>s+r.total,0)*100)/100,
  add:line=>update(current=>{const key=lineKey(line);return current.some(l=>lineKey(l)===key)?current.map(l=>lineKey(l)===key?{...l,quantity:Math.min(99,l.quantity+line.quantity)}:l):[...current,line]}),
  setQuantity:(key,quantity)=>update(current=>quantity<1?current.filter(l=>lineKey(l)!==key):current.map(l=>lineKey(l)===key?{...l,quantity:Math.min(99,quantity)}:l)),
  remove:key=>update(current=>current.filter(l=>lineKey(l)!==key)),
  clear:()=>update(()=>[]),
 };
 return <CartContext.Provider value={api}>{children}</CartContext.Provider>;
}
