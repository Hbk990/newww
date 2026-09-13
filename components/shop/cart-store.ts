import {CartLine} from '@/app/model';

// The cart lives in localStorage, which React treats as an external store: reading it
// through useSyncExternalStore keeps server render, hydration and other open tabs in
// step without a mount effect.
const CART_KEY='huqa.cart.v1',DEVICE_KEY='huqa.device.v1';
export const lineKey=(l:CartLine)=>l.kind==='bundle'?'b:'+l.bundleId:'p:'+l.productId+':'+l.variantId;

const EMPTY:CartLine[]=[];
const listeners=new Set<()=>void>();
let snapshot:CartLine[]|null=null;
let wired=false;

const valid=(l:unknown):l is CartLine=>{
 if(!l||typeof l!=='object')return false;
 const line=l as Record<string,unknown>;
 if(!Number.isInteger(line.quantity)||(line.quantity as number)<1||(line.quantity as number)>99)return false;
 return line.kind==='bundle'?typeof line.bundleId==='string':line.kind==='product'&&typeof line.productId==='string'&&typeof line.variantId==='string';
};

function readCart():CartLine[]{
 try{const raw=localStorage.getItem(CART_KEY);const parsed=raw?JSON.parse(raw):[];return Array.isArray(parsed)?parsed.filter(valid):[]}catch{return EMPTY}
}
const emit=()=>{for(const f of listeners)f()};

export function subscribe(onChange:()=>void){
 if(!wired&&typeof window!=='undefined'){
  wired=true;
  window.addEventListener('storage',e=>{if(e.key===CART_KEY){snapshot=readCart();emit()}});
 }
 listeners.add(onChange);
 return()=>{listeners.delete(onChange)};
}
export function getSnapshot(){if(!snapshot)snapshot=readCart();return snapshot}
export const getServerSnapshot=()=>EMPTY;

export function update(change:(lines:CartLine[])=>CartLine[]){
 const next=change(getSnapshot());
 snapshot=next;
 try{localStorage.setItem(CART_KEY,JSON.stringify(next))}catch{/* private mode */}
 emit();
}

export function deviceId(){
 try{
  const existing=localStorage.getItem(DEVICE_KEY);
  if(existing)return existing;
  const id=crypto.randomUUID();
  localStorage.setItem(DEVICE_KEY,id);
  return id;
 }catch{return ''}
}
