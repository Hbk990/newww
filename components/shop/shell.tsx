'use client';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useEffect,useRef,useState,ReactNode} from 'react';
import {ChevronDown,AtSign,MapPin,Clock,Menu,Search,ShoppingBag,Trash2,X,Minus,Plus,MessageCircle} from 'lucide-react';
import {Bundle,Product,Store,deliveryCost,displayPhone,disposableKinds,inStock,liquidStrengths,money,normalize} from '@/app/model';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {Button} from '@/components/ui/button';
import {CartProvider,useCart} from './cart';
import {correct,searchProducts,vocabulary} from './search';

const AGE_KEY='huqa.age.v1';
type NavEntry={label:string;href:string;children?:{label:string;href:string}[]};

function navigation(products:Product[]):NavEntry[]{
 const coilBrands=[...new Set(products.filter(p=>p.category==='Coils & accessories / Coils & pods').map(p=>p.brand).filter(Boolean))].sort();
 return [
  {label:'Disposables',href:'/shop/disposables',children:disposableKinds.map(k=>({label:k==='Shisha'?'Shisha flavours':k,href:`/shop/disposables?f=${encodeURIComponent(k)}`}))},
  {label:'E-Liquids',href:'/shop/liquids',children:liquidStrengths.map(s=>({label:s+' nicotine',href:`/shop/liquids?f=${encodeURIComponent(s)}`}))},
  {label:'Machines',href:'/shop/machines'},
  {label:'Coils & Pods',href:'/shop/coils',children:coilBrands.map(b=>({label:b,href:`/shop/coils?f=${encodeURIComponent(b)}`}))},
  {label:'Accessories',href:'/shop/accessories'},
  {label:'Pouches',href:'/shop/pouches'},
  {label:'Offers',href:'/bundles'},
  {label:'HUQA Shisha',href:'/huqa'},
 ];
}

function AgeGate(){
 const [decided,setDecided]=useState<boolean|null>(null);
 useEffect(()=>{try{setDecided(localStorage.getItem(AGE_KEY)==='yes')}catch{setDecided(true)}},[]);
 if(decided===null||decided)return null;
 return <div className="age-gate" role="dialog" aria-modal="true" aria-labelledby="age-gate-title">
  <div className="age-gate-card">
   <img src="/huqa-logo.jpeg" alt="HUQA" width={96} height={96}/>
   <h2 id="age-gate-title">Are you 18 or older?</h2>
   <p>This shop sells nicotine and tobacco products. You must be at least 18 years old to enter.</p>
   <div className="age-gate-actions">
    <Button className="h-12 flex-1" onClick={()=>{try{localStorage.setItem(AGE_KEY,'yes')}catch{}setDecided(true)}}>Yes, I am 18 or older</Button>
    <Button variant="outline" className="h-12 flex-1" onClick={()=>{location.href='https://www.google.com'}}>No</Button>
   </div>
  </div>
 </div>;
}

function SearchBox({products,onNavigate}:{products:Product[];onNavigate?:()=>void}){
 const router=useRouter();
 const [query,setQuery]=useState('');
 const [open,setOpen]=useState(false);
 const box=useRef<HTMLDivElement>(null);
 const hits=query.trim().length>1?searchProducts(products,query).slice(0,6):[];
 const suggestion=query.trim().length>2&&!hits.length?correct(query,vocabulary(products)):null;
 useEffect(()=>{const away=(e:MouseEvent)=>{if(box.current&&!box.current.contains(e.target as Node))setOpen(false)};document.addEventListener('mousedown',away);return()=>document.removeEventListener('mousedown',away)},[]);
 const go=(q:string)=>{if(!q.trim())return;setOpen(false);onNavigate?.();router.push('/search?q='+encodeURIComponent(q.trim()))};
 return <div className="shop-search" ref={box}>
  <form role="search" onSubmit={e=>{e.preventDefault();go(suggestion&&!hits.length?suggestion:query)}}>
   <Search size={17} aria-hidden/>
   <input value={query} onChange={e=>{setQuery(e.target.value);setOpen(true)}} onFocus={()=>setOpen(true)} onKeyDown={e=>{if(e.key==='Escape')setOpen(false)}} placeholder="Search flavours, brands, devices…" aria-label="Search products" autoComplete="off"/>
   {query&&<button type="button" aria-label="Clear search" onClick={()=>{setQuery('');setOpen(false)}}><X size={15}/></button>}
  </form>
  {open&&query.trim().length>1&&<div className="search-drop">
   {hits.map(p=><Link key={p.id} href={'/product/'+p.id} className="search-hit" onClick={()=>{setOpen(false);onNavigate?.()}}>
    {p.image?<img src={p.image} alt=""/>:<span className="search-hit-blank"/>}
    <span><strong>{p.name}</strong><small>{p.brand||p.category}</small></span>
    <em>{money(p.price??0)}</em>
   </Link>)}
   {!hits.length&&suggestion&&<button type="button" className="search-suggest" onClick={()=>{setQuery(suggestion);go(suggestion)}}>Did you mean <strong>{suggestion}</strong>?</button>}
   {!hits.length&&!suggestion&&<p className="search-empty">Nothing matched “{query}”.</p>}
   {hits.length>0&&<button type="button" className="search-all" onClick={()=>go(query)}>See all results for “{query.trim()}”</button>}
  </div>}
 </div>;
}

function NavBar({entries}:{entries:NavEntry[]}){
 const [open,setOpen]=useState('');
 const bar=useRef<HTMLElement>(null);
 useEffect(()=>{const away=(e:MouseEvent)=>{if(bar.current&&!bar.current.contains(e.target as Node))setOpen('')};document.addEventListener('mousedown',away);return()=>document.removeEventListener('mousedown',away)},[]);
 return <nav className="shop-nav" ref={bar} onMouseLeave={()=>setOpen('')} onKeyDown={e=>{if(e.key==='Escape')setOpen('')}}>
  {entries.map(entry=>entry.children?.length
   ?<div key={entry.label} className="shop-nav-item" onMouseEnter={()=>setOpen(entry.label)}>
     <button type="button" aria-expanded={open===entry.label} aria-haspopup="true" onClick={()=>setOpen(open===entry.label?'':entry.label)}>{entry.label}<ChevronDown size={14}/></button>
     {open===entry.label&&<div className="shop-nav-drop">
      <Link href={entry.href} className="shop-nav-all" onClick={()=>setOpen('')}>All {entry.label.toLowerCase()}</Link>
      {entry.children.map(c=><Link key={c.href} href={c.href} onClick={()=>setOpen('')}>{c.label}</Link>)}
     </div>}
    </div>
   :<Link key={entry.label} href={entry.href} className="shop-nav-link" onMouseEnter={()=>setOpen('')}>{entry.label}</Link>)}
 </nav>;
}

function MobileNav({entries,products}:{entries:NavEntry[];products:Product[]}){
 const [open,setOpen]=useState(false);
 return <>
  <button type="button" className="icon-button lg:hidden" aria-label="Open menu" onClick={()=>setOpen(true)}><Menu size={21}/></button>
  <Sheet open={open} onOpenChange={setOpen}>
   <SheetContent side="left" className="w-[86vw] max-w-[380px] p-0 overflow-y-auto">
    <SheetHeader className="p-5 border-b"><SheetTitle>Browse HUQA</SheetTitle><SheetDescription>Everything in the shop.</SheetDescription></SheetHeader>
    <div className="p-5"><SearchBox products={products} onNavigate={()=>setOpen(false)}/></div>
    <div className="mobile-nav">
     {entries.map(entry=><div key={entry.label}>
      <Link href={entry.href} onClick={()=>setOpen(false)} className="mobile-nav-head">{entry.label}</Link>
      {entry.children?.map(c=><Link key={c.href} href={c.href} onClick={()=>setOpen(false)} className="mobile-nav-child">{c.label}</Link>)}
     </div>)}
    </div>
   </SheetContent>
  </Sheet>
 </>;
}

function CartSheet({store}:{store:Store}){
 const cart=useCart();
 const router=useRouter();
 const delivery=deliveryCost(store,cart.subtotal);
 return <Sheet open={cart.open} onOpenChange={cart.setOpen}>
  <SheetContent className="w-full sm:max-w-[460px] p-0 flex flex-col">
   <SheetHeader className="p-5 border-b"><SheetTitle>Your cart</SheetTitle><SheetDescription>{cart.count?`${cart.count} item${cart.count===1?'':'s'} ready to order.`:'Add something you like and it will show up here.'}</SheetDescription></SheetHeader>
   <div className="cart-lines">
    {cart.resolved.map(line=><div key={line.key} className={'cart-line'+(line.available?'':' cart-line-out')}>
     {line.image?<img src={line.image} alt=""/>:<span className="cart-line-blank"/>}
     <div className="cart-line-body">
      <Link href={line.href} onClick={()=>cart.setOpen(false)}><strong>{line.name}</strong></Link>
      {line.detail&&<small>{line.detail}</small>}
      {line.contents.map(c=><small key={c} className="cart-line-content">{c}</small>)}
      {!line.available&&<small className="cart-line-warning">Out of stock — remove to continue</small>}
      <div className="cart-line-foot">
       <div className="qty">
        <button type="button" aria-label="Decrease quantity" onClick={()=>cart.setQuantity(line.key,line.line.quantity-1)}><Minus size={14}/></button>
        <span>{line.line.quantity}</span>
        <button type="button" aria-label="Increase quantity" onClick={()=>cart.setQuantity(line.key,line.line.quantity+1)}><Plus size={14}/></button>
       </div>
       <strong>{money(line.total)}</strong>
       <button type="button" className="cart-remove" aria-label={'Remove '+line.name} onClick={()=>cart.remove(line.key)}><Trash2 size={15}/></button>
      </div>
     </div>
    </div>)}
    {!cart.resolved.length&&<p className="cart-empty">Your cart is empty.</p>}
   </div>
   {cart.resolved.length>0&&<div className="cart-foot">
    <div className="cart-total"><span>Subtotal</span><strong>{money(cart.subtotal)}</strong></div>
    <div className="cart-total cart-total-muted"><span>Delivery</span><strong>{delivery?money(delivery):'Free'}</strong></div>
    {store.freeDeliveryOver>0&&cart.subtotal<store.freeDeliveryOver&&<p className="cart-hint">Add {money(store.freeDeliveryOver-cart.subtotal)} more for free delivery.</p>}
    <div className="cart-total cart-total-grand"><span>Total</span><strong>{money(cart.subtotal+delivery)}</strong></div>
    <Button className="h-12 w-full" disabled={cart.resolved.some(l=>!l.available)} onClick={()=>{cart.setOpen(false);router.push('/checkout')}}>Continue to checkout</Button>
   </div>}
  </SheetContent>
 </Sheet>;
}

function CartButton(){
 const cart=useCart();
 return <button type="button" className="cart-button" onClick={()=>cart.setOpen(true)} aria-label={`Open cart, ${cart.count} items`}>
  <ShoppingBag size={20}/>{cart.count>0&&<span>{cart.count}</span>}
 </button>;
}

function Header({store,products}:{store:Store;products:Product[]}){
 const entries=navigation(products);
 return <header className="shop-header">
  {store.announcement&&<div className="shop-announcement">{store.announcement}</div>}
  <div className="shop-header-bar">
   <MobileNav entries={entries} products={products}/>
   <Link href="/" className="shop-brand" aria-label="HUQA home"><img src="/huqa-logo.jpeg" alt="" width={819} height={819}/><span><strong>{store.storeName}</strong><small>{store.tagline}</small></span></Link>
   <div className="shop-header-search"><SearchBox products={products}/></div>
   <div className="shop-header-actions">
    <a className="icon-button hidden sm:grid" href={'https://wa.me/'+store.whatsapp} target="_blank" rel="noreferrer" aria-label="Chat on WhatsApp"><MessageCircle size={20}/></a>
    <CartButton/>
   </div>
  </div>
  <div className="shop-nav-bar"><NavBar entries={entries}/></div>
 </header>;
}

function Footer({store,products}:{store:Store;products:Product[]}){
 return <footer className="shop-footer">
  <div className="shop-footer-grid">
   <div>
    <img src="/huqa-logo.jpeg" alt="" width={819} height={819} className="footer-logo"/>
    <p className="footer-tag">{store.tagline}</p>
    <p className="footer-note">{normalize(store.storeName)==='huqa'?'Arguileh, vapes and everything around them.':''}</p>
   </div>
   <div>
    <h3>Shop</h3>
    {navigation(products).map(e=><Link key={e.href} href={e.href}>{e.label}</Link>)}
   </div>
   <div>
    <h3>Reach us</h3>
    <a href={'https://wa.me/'+store.whatsapp} target="_blank" rel="noreferrer"><MessageCircle size={15}/>{displayPhone(store.whatsapp)}</a>
    {store.instagram&&<a href={'https://instagram.com/'+store.instagram} target="_blank" rel="noreferrer"><AtSign size={15}/>@{store.instagram}</a>}
    {store.address&&<span><MapPin size={15}/>{store.address}</span>}
    {store.hours&&<span><Clock size={15}/>{store.hours}</span>}
   </div>
  </div>
  <div className="shop-footer-base">
   <span>© {new Date().getFullYear()} {store.storeName}. All rights reserved.</span>
   <span className="footer-age">18+ only · Nicotine is an addictive substance</span>
  </div>
 </footer>;
}

export function ShopShell({store,products,bundles,children}:{store:Store;products:Product[];bundles:Bundle[];children:ReactNode}){
 return <CartProvider products={products} bundles={bundles}>
  <AgeGate/>
  <Header store={store} products={products}/>
  <main className="shop-main">{children}</main>
  <Footer store={store} products={products}/>
  <CartSheet store={store}/>
 </CartProvider>;
}

export function ComingSoon({store}:{store:Store}){
 return <div className="coming-soon">
  <img src="/huqa-logo.jpeg" alt="HUQA" width={819} height={819}/>
  <h1>{store.storeName}</h1>
  <p>{store.tagline||'Arguileh & Vapes'}</p>
  <p className="coming-soon-note">Our shop is being set up. Message us on WhatsApp in the meantime and we will sort you out.</p>
  <a className="coming-soon-cta" href={'https://wa.me/'+store.whatsapp} target="_blank" rel="noreferrer"><MessageCircle size={18}/>Chat on WhatsApp</a>
 </div>;
}

export const hasStock=inStock;
