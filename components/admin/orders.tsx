'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {toast} from 'sonner';
import {ClipboardList,MessageCircle,RefreshCw,Search,Users} from 'lucide-react';
import {Order,OrderStatus,displayPhone,matches,money,orderStatuses} from '@/app/model';
import {Button} from '@/components/ui/button';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {Skeleton} from '@/components/ui/skeleton';
import {adminApi,adminView} from './api';

type StoredOrder=Order&{key:string};
type Customer={phone:string;name:string;addresses:{area:string;address:string;lastUsed:number}[];firstOrderAt:number;lastOrderAt:number;orderCount:number;totalSpent:number;orders:{ref:string;createdAt:number;total:number;key:string}[];devices:string[];lastIp:string};

const when=(ms:number)=>new Date(ms).toLocaleString(undefined,{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
const pickOrders=(j:Record<string,unknown>)=>(j.orders??[]) as StoredOrder[];
const pickCustomers=(j:Record<string,unknown>)=>(j.customers??[]) as Customer[];
const statusLabel:Record<OrderStatus,string>={new:'New',confirmed:'Confirmed',delivered:'Delivered',cancelled:'Cancelled'};

function useRemote<T>(view:string,pick:(j:Record<string,unknown>)=>T[]){
 const [items,setItems]=useState<T[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const fetchAll=useCallback(async()=>{
  let cursor:string|undefined,all:T[]=[];
  do{const j=await adminView<Record<string,unknown>>(view,cursor);all=all.concat(pick(j));cursor=j.cursor??undefined}while(cursor&&all.length<2000);
  return all;
 },[view,pick]);
 useEffect(()=>{
  let alive=true;
  fetchAll().then(all=>{if(alive)setItems(all)},e=>{if(alive)setError((e as Error).message)}).finally(()=>{if(alive)setLoading(false)});
  return()=>{alive=false};
 },[fetchAll]);
 const reload=useCallback(async()=>{
  setLoading(true);setError('');
  try{setItems(await fetchAll())}catch(e){setError((e as Error).message)}finally{setLoading(false)}
 },[fetchAll]);
 return {items,setItems,loading,error,reload};
}

export function Orders(){
 const {items,setItems,loading,error,reload}=useRemote<StoredOrder>('orders',pickOrders);
 const [query,setQuery]=useState('');
 const [status,setStatus]=useState<'all'|OrderStatus>('all');
 const [open,setOpen]=useState<StoredOrder|null>(null);
 const [busy,setBusy]=useState(false);

 const shown=useMemo(()=>items.filter(o=>(status==='all'||o.status===status)&&matches(`${o.ref} ${o.contact.name} ${o.contact.phone} ${o.contact.area} ${o.contact.address} ${o.lines.map(l=>l.name).join(' ')}`,query)),[items,query,status]);
 const counts=useMemo(()=>Object.fromEntries(orderStatuses.map(s=>[s,items.filter(o=>o.status===s).length])),[items]);

 async function change(order:StoredOrder,next:OrderStatus){
  setBusy(true);
  try{
   const j=await adminApi<{order:Order}>('order-status',{key:order.key,status:next});
   const updated={...j.order,key:order.key};
   setItems(list=>list.map(o=>o.key===order.key?updated:o));
   setOpen(updated);toast.success('Marked '+statusLabel[next].toLowerCase());
  }catch(e){toast.error((e as Error).message)}finally{setBusy(false)}
 }

 return <>
  <div className="flex flex-wrap justify-between gap-4 items-center mb-8">
   <div>
    <p className="text-xs uppercase tracking-[.15em] text-muted-foreground mb-3">Customer orders</p>
    <h1 className="page-title">Orders</h1>
    <p className="quiet mt-2">{items.length} order{items.length===1?'':'s'} · {counts.new??0} waiting to be confirmed.</p>
   </div>
   <Button variant="outline" className="h-11 px-5" onClick={reload} disabled={loading}><RefreshCw size={17}/>Refresh</Button>
  </div>

  <div className="admin-toolbar">
   <label className="picker-search"><Search size={16}/><input placeholder="Search by reference, name, number or address…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
   <div className="chip-row">
    <button type="button" className={'chip'+(status==='all'?' chip-on':'')} onClick={()=>setStatus('all')}>All</button>
    {orderStatuses.map(s=><button key={s} type="button" className={'chip'+(status===s?' chip-on':'')} onClick={()=>setStatus(s)}>{statusLabel[s]} {counts[s]??0}</button>)}
   </div>
  </div>

  {error&&<p className="error mb-5" role="alert">{error}</p>}
  {loading?<div className="space-y-3"><Skeleton className="h-16"/><Skeleton className="h-16"/><Skeleton className="h-16"/></div>
  :shown.length?<div className="offer-list">{shown.map(o=>
   <button key={o.key} type="button" className="order-row" onClick={()=>setOpen(o)}>
    <span className="order-ref">{o.ref}<small>{when(o.createdAt)}</small></span>
    <span className="order-who"><strong>{o.contact.name}</strong><small>{displayPhone(o.contact.phone)} · {o.contact.area}</small></span>
    <span className="order-items">{o.lines.reduce((s,l)=>s+l.quantity,0)} item{o.lines.reduce((s,l)=>s+l.quantity,0)===1?'':'s'}</span>
    <strong className="order-total">{money(o.total)}</strong>
    <span className={'badge status-'+o.status}>{statusLabel[o.status]}</span>
   </button>)}</div>
  :<div className="grid-empty">{items.length?'No orders match that filter.':'No orders yet. They appear here the moment a customer checks out.'}</div>}

  <Sheet open={!!open} onOpenChange={o=>!o&&setOpen(null)}>
   <SheetContent className="w-full sm:max-w-[560px] p-0 flex flex-col">
    {open&&<>
     <SheetHeader className="p-6 border-b">
      <SheetTitle>Order {open.ref}</SheetTitle>
      <SheetDescription>{when(open.createdAt)} · {money(open.total)}</SheetDescription>
     </SheetHeader>
     <div className="order-detail">
      <section>
       <h3>Customer</h3>
       <dl className="detail-list">
        <div><dt>Name</dt><dd>{open.contact.name}</dd></div>
        <div><dt>Phone</dt><dd><a href={'https://wa.me/'+open.contact.phone} target="_blank" rel="noreferrer">{displayPhone(open.contact.phone)}</a></dd></div>
        <div><dt>Area</dt><dd>{open.contact.area}</dd></div>
        <div><dt>Address</dt><dd className="whitespace-pre-wrap">{open.contact.address}</dd></div>
        {open.contact.note&&<div><dt>Note</dt><dd className="whitespace-pre-wrap">{open.contact.note}</dd></div>}
       </dl>
      </section>
      <section>
       <h3>Items</h3>
       {open.lines.map((l,i)=><div key={i} className="summary-line">
        <span className="summary-qty">{l.quantity}×</span>
        <span className="summary-name"><strong>{l.name}</strong>{l.detail&&<small>{l.detail}</small>}{l.contents?.map(c=><small key={c}>{c}</small>)}</span>
        <span className="summary-price">{money(l.total)}</span>
       </div>)}
       <div className="summary-totals">
        <div><span>Subtotal</span><span>{money(open.subtotal)}</span></div>
        <div><span>Delivery</span><span>{open.deliveryFee?money(open.deliveryFee):'Free'}</span></div>
        <div className="summary-grand"><span>Total</span><span>{money(open.total)}</span></div>
       </div>
      </section>
      <section>
       <h3>Status</h3>
       <div className="chip-row">{orderStatuses.map(s=>
        <button key={s} type="button" disabled={busy||open.status===s} className={'chip'+(open.status===s?' chip-on':'')} onClick={()=>change(open,s)}>{statusLabel[s]}</button>)}
       </div>
      </section>
      <a className="whatsapp-cta" href={'https://wa.me/'+open.contact.phone} target="_blank" rel="noreferrer"><MessageCircle size={18}/>Message {open.contact.name.split(' ')[0]}</a>
     </div>
    </>}
   </SheetContent>
  </Sheet>
 </>;
}

export function Customers(){
 const {items,loading,error,reload}=useRemote<Customer>('customers',pickCustomers);
 const [query,setQuery]=useState('');
 const [open,setOpen]=useState<Customer|null>(null);
 const shown=useMemo(()=>items.filter(c=>matches(`${c.name} ${c.phone} ${c.addresses.map(a=>a.area+' '+a.address).join(' ')}`,query)),[items,query]);

 return <>
  <div className="flex flex-wrap justify-between gap-4 items-center mb-8">
   <div>
    <p className="text-xs uppercase tracking-[.15em] text-muted-foreground mb-3">Your people</p>
    <h1 className="page-title">Customers</h1>
    <p className="quiet mt-2">{items.length} customer file{items.length===1?'':'s'}, one per phone number.</p>
   </div>
   <Button variant="outline" className="h-11 px-5" onClick={reload} disabled={loading}><RefreshCw size={17}/>Refresh</Button>
  </div>

  <div className="admin-toolbar">
   <label className="picker-search"><Search size={16}/><input placeholder="Search by name, number or address…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
  </div>

  {error&&<p className="error mb-5" role="alert">{error}</p>}
  {loading?<div className="space-y-3"><Skeleton className="h-16"/><Skeleton className="h-16"/></div>
  :shown.length?<div className="offer-list">{shown.map(c=>
   <button key={c.phone} type="button" className="order-row" onClick={()=>setOpen(c)}>
    <span className="order-who"><strong>{c.name}</strong><small>{displayPhone(c.phone)}</small></span>
    <span className="order-items">{c.orderCount} order{c.orderCount===1?'':'s'}</span>
    <strong className="order-total">{money(c.totalSpent)}</strong>
    <span className="quiet">Last {when(c.lastOrderAt)}</span>
   </button>)}</div>
  :<div className="grid-empty">{items.length?'Nobody matched that search.':'No customer files yet.'}</div>}

  <Sheet open={!!open} onOpenChange={o=>!o&&setOpen(null)}>
   <SheetContent className="w-full sm:max-w-[520px] p-0 flex flex-col">
    {open&&<>
     <SheetHeader className="p-6 border-b"><SheetTitle>{open.name}</SheetTitle><SheetDescription>{displayPhone(open.phone)} · customer since {when(open.firstOrderAt)}</SheetDescription></SheetHeader>
     <div className="order-detail">
      <section>
       <h3>Summary</h3>
       <dl className="detail-list">
        <div><dt>Orders</dt><dd>{open.orderCount}</dd></div>
        <div><dt>Spent</dt><dd>{money(open.totalSpent)}</dd></div>
        <div><dt>Last order</dt><dd>{when(open.lastOrderAt)}</dd></div>
        {open.lastIp&&<div><dt>Last IP</dt><dd>{open.lastIp}</dd></div>}
       </dl>
      </section>
      <section>
       <h3>Addresses</h3>
       {open.addresses.map((a,i)=><p key={i} className="address-line"><strong>{a.area}</strong><span>{a.address}</span></p>)}
      </section>
      <section>
       <h3>Order history</h3>
       {open.orders.map(o=><div key={o.ref} className="summary-line"><span className="summary-name"><strong>{o.ref}</strong><small>{when(o.createdAt)}</small></span><span className="summary-price">{money(o.total)}</span></div>)}
      </section>
      <a className="whatsapp-cta" href={'https://wa.me/'+open.phone} target="_blank" rel="noreferrer"><MessageCircle size={18}/>Message {open.name.split(' ')[0]}</a>
     </div>
    </>}
   </SheetContent>
  </Sheet>
 </>;
}

export const ordersIcon=ClipboardList,customersIcon=Users;
