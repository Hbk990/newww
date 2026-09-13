'use client';
import Link from 'next/link';
import {useState} from 'react';
import {CircleCheck,MessageCircle,ShoppingBag,TriangleAlert} from 'lucide-react';
import {Store,deliveryAreas,deliveryCost,money} from '@/app/model';
import {Button} from '@/components/ui/button';
import {useCart} from './cart';

type Placed={ref:string;total:number;whatsapp:string};

export function Checkout({store}:{store:Store}){
 const cart=useCart();
 const [contact,setContact]=useState({name:'',phone:'',area:'',address:'',note:''});
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [placed,setPlaced]=useState<Placed|null>(null);
 const delivery=deliveryCost(store,cart.subtotal);
 const blocked=cart.resolved.some(l=>!l.available);
 const set=(k:keyof typeof contact)=>(e:{target:{value:string}})=>setContact(c=>({...c,[k]:e.target.value}));

 async function submit(e:React.FormEvent){
  e.preventDefault();
  setBusy(true);setError('');
  try{
   const r=await fetch('/api/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contact,cart:cart.payload,deviceId:cart.deviceId()})});
   const j=await r.json() as Placed&{error?:string};
   if(!r.ok)throw Error(j.error||'Your order could not be sent.');
   cart.clear();
   setPlaced(j);
  }catch(err){setError((err as Error).message)}finally{setBusy(false)}
 }

 if(placed)return <div className="checkout-done">
  <CircleCheck size={46}/>
  <h1>Order {placed.ref} is with us</h1>
  <p>We have your order saved. Send it on WhatsApp now so we can confirm your address and get it moving — it opens with everything already written out.</p>
  <a className="whatsapp-cta" href={placed.whatsapp} target="_blank" rel="noreferrer"><MessageCircle size={20}/>Send my order on WhatsApp</a>
  <p className="checkout-done-note">Total {money(placed.total)} · Keep your reference {placed.ref} for when we call.</p>
  <Link href="/" className="link-button">Back to the shop</Link>
 </div>;

 if(!cart.ready)return <div className="page-head"><h1>Checkout</h1><p>Loading your cart…</p></div>;
 if(!cart.resolved.length)return <div className="checkout-empty">
  <ShoppingBag size={38}/>
  <h1>Your cart is empty</h1>
  <p>Pick a few things first and they will show up here.</p>
  <Link href="/" className="hero-cta">Browse the shop</Link>
 </div>;

 return <div className="checkout">
  <div className="page-head"><h1>Checkout</h1><p>We deliver across Lebanon. Give us an address we can actually find.</p></div>
  <div className="checkout-grid">
   <form className="checkout-form" onSubmit={submit}>
    <fieldset disabled={busy}>
     <h2>Your details</h2>
     <label className="field">Full name<input required maxLength={80} autoComplete="name" placeholder="How should we greet you?" value={contact.name} onChange={set('name')}/></label>
     <label className="field">WhatsApp number<input required maxLength={24} inputMode="tel" autoComplete="tel" placeholder="71 392 434" value={contact.phone} onChange={set('phone')}/><small>We use this to confirm the order — it is how we recognise you next time.</small></label>
     <label className="field">Delivery area
      <select required value={contact.area} onChange={set('area')}>
       <option value="" disabled>Choose your area</option>
       {deliveryAreas.map(a=><option key={a} value={a}>{a}</option>)}
      </select>
     </label>
     <label className="field">Full address<textarea required rows={4} maxLength={400} placeholder="Street, building, floor, and a landmark that helps the driver find you." value={contact.address} onChange={set('address')}/></label>
     <label className="field">Anything else? <span className="field-optional">Optional</span><textarea rows={2} maxLength={500} placeholder="Delivery time, a second number, a request…" value={contact.note} onChange={set('note')}/></label>
    </fieldset>
    {error&&<p className="error" role="alert"><TriangleAlert size={16}/>{error}</p>}
    {blocked&&<p className="error" role="alert"><TriangleAlert size={16}/>Something in your cart went out of stock. Open the cart and remove it to continue.</p>}
    <Button type="submit" className="h-13 w-full" disabled={busy||blocked}>{busy?'Sending your order…':`Place order · ${money(cart.subtotal+delivery)}`}</Button>
    <p className="checkout-legal">By ordering you confirm you are 18 or older. Your name, number and address are kept so we can deliver and so you do not have to type them again.</p>
   </form>

   <aside className="checkout-summary">
    <h2>Your order</h2>
    {cart.resolved.map(l=><div key={l.key} className="summary-line">
     <span className="summary-qty">{l.line.quantity}×</span>
     <span className="summary-name"><strong>{l.name}</strong>{l.detail&&<small>{l.detail}</small>}{l.contents.map(c=><small key={c}>{c}</small>)}</span>
     <span className="summary-price">{money(l.total)}</span>
    </div>)}
    <div className="summary-totals">
     <div><span>Subtotal</span><span>{money(cart.subtotal)}</span></div>
     <div><span>Delivery</span><span>{delivery?money(delivery):'Free'}</span></div>
     <div className="summary-grand"><span>Total</span><span>{money(cart.subtotal+delivery)}</span></div>
    </div>
    <button type="button" className="link-button" onClick={()=>cart.setOpen(true)}>Edit cart</button>
   </aside>
  </div>
 </div>;
}
