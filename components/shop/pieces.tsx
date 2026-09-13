'use client';
import Link from 'next/link';
import {useMemo,useState} from 'react';
import {ShoppingBag,Check,Gift,MessageCircle} from 'lucide-react';
import {Bundle,Product,Variant,inStock,money,priceBundle,variantCount,variantLabel,variantWord} from '@/app/model';
import {Button} from '@/components/ui/button';
import {useCart} from './cart';

export function StockBadge({available}:{available:boolean}){
 return <span className={'stock-badge'+(available?'':' stock-badge-out')}>{available?'In stock':'Out of stock'}</span>;
}

export function ProductCard({product}:{product:Product}){
 const cart=useCart();
 const available=inStock(product);
 const single=product.variants.length===1?product.variants[0]:null;
 return <article className={'product-card'+(available?'':' product-card-out')}>
  <Link href={'/product/'+product.id} className="product-card-media">
   {product.image?<img src={product.image} alt={product.name} loading="lazy"/>:<span className="product-card-blank">{product.name.slice(0,2).toUpperCase()}</span>}
   <StockBadge available={available}/>
  </Link>
  <div className="product-card-body">
   {product.brand&&<p className="product-card-brand">{product.brand}</p>}
   <h3><Link href={'/product/'+product.id}>{product.name}</Link></h3>
   <p className="product-card-meta">{variantCount(product.category,product.variants.length)}{product.bottleSize?' · '+product.bottleSize:''}</p>
   <div className="product-card-foot">
    <strong>{money(product.price??0)}</strong>
    {single
     ?<Button size="sm" disabled={!available} onClick={()=>{cart.add({kind:'product',productId:product.id,variantId:single.id,quantity:1});cart.setOpen(true)}}><ShoppingBag size={15}/>Add</Button>
     :<Button size="sm" variant="outline" asChild><Link href={'/product/'+product.id}>Choose</Link></Button>}
   </div>
  </div>
 </article>;
}

export function ProductGrid({products,empty='Nothing here yet.'}:{products:Product[];empty?:string}){
 if(!products.length)return <p className="grid-empty">{empty}</p>;
 return <div className="product-grid">{products.map(p=><ProductCard key={p.id} product={p}/>)}</div>;
}

// Pouches and multi-strength lines pick on two axes: flavour first, then strength.
export function VariantPicker({product,value,onChange}:{product:Product;value:Variant|null;onChange:(v:Variant|null)=>void}){
 const strengths=useMemo(()=>[...new Set(product.variants.map(v=>v.strength.trim()).filter(Boolean))],[product]);
 const labels=useMemo(()=>[...new Set(product.variants.map(v=>v.label))],[product]);
 const twoAxis=strengths.length>1;
 const [label,setLabel]=useState(value?.label??'');
 const pick=(nextLabel:string,nextStrength:string)=>{
  const found=product.variants.find(v=>v.label===nextLabel&&(!twoAxis||v.strength.trim()===nextStrength))??null;
  onChange(found);
 };
 if(!twoAxis)return <fieldset className="variant-picker">
  <legend>{variantWord(product.category)}</legend>
  <div className="chip-row">{product.variants.map(v=>
   <button key={v.id} type="button" disabled={!v.available} aria-pressed={value?.id===v.id} className={'chip'+(value?.id===v.id?' chip-on':'')+(v.available?'':' chip-out')} onClick={()=>onChange(v)}>
    {v.label}{v.strength?<em>{v.strength}</em>:null}{!v.available&&<small>Out</small>}
   </button>)}</div>
 </fieldset>;
 return <>
  <fieldset className="variant-picker">
   <legend>Flavour</legend>
   <div className="chip-row">{labels.map(l=>{
    const any=product.variants.some(v=>v.label===l&&v.available);
    return <button key={l} type="button" disabled={!any} aria-pressed={label===l} className={'chip'+(label===l?' chip-on':'')+(any?'':' chip-out')} onClick={()=>{setLabel(l);pick(l,value?.strength.trim()??'')}}>{l}{!any&&<small>Out</small>}</button>;
   })}</div>
  </fieldset>
  <fieldset className="variant-picker">
   <legend>Strength</legend>
   <div className="chip-row">{strengths.map(s=>{
    const match=product.variants.find(v=>v.label===label&&v.strength.trim()===s);
    const on=!!value&&value.strength.trim()===s&&value.label===label;
    return <button key={s} type="button" disabled={!label||!match?.available} aria-pressed={on} className={'chip'+(on?' chip-on':'')+(match?.available?'':' chip-out')} onClick={()=>pick(label,s)}>{s}{label&&!match?.available&&<small>Out</small>}</button>;
   })}</div>
  </fieldset>
 </>;
}

export function AddToCart({product,whatsapp}:{product:Product;whatsapp:string}){
 const cart=useCart();
 const [variant,setVariant]=useState<Variant|null>(product.variants.length===1?product.variants[0]:null);
 const [quantity,setQuantity]=useState(1);
 const [added,setAdded]=useState(false);
 const available=inStock(product);
 return <div className="buy-box">
  <VariantPicker product={product} value={variant} onChange={v=>{setVariant(v);setAdded(false)}}/>
  <div className="buy-row">
   <div className="qty qty-lg">
    <button type="button" aria-label="Decrease quantity" onClick={()=>setQuantity(q=>Math.max(1,q-1))}>−</button>
    <span>{quantity}</span>
    <button type="button" aria-label="Increase quantity" onClick={()=>setQuantity(q=>Math.min(99,q+1))}>+</button>
   </div>
   <Button className="h-12 flex-1" disabled={!variant||!variant.available} onClick={()=>{if(!variant)return;cart.add({kind:'product',productId:product.id,variantId:variant.id,quantity});setAdded(true);cart.setOpen(true)}}>
    {added?<><Check size={17}/>Added</>:<><ShoppingBag size={17}/>{variant?'Add to cart':available?'Choose an option':'Out of stock'}</>}
   </Button>
  </div>
  <a className="ask-link" target="_blank" rel="noreferrer" href={'https://wa.me/'+whatsapp+'?text='+encodeURIComponent(`Hello! I have a question about ${product.name}${variant?' — '+variantLabel(product,variant):''}.`)}>
   <MessageCircle size={15}/>Ask about this on WhatsApp
  </a>
 </div>;
}

export function BundleCard({bundle,products}:{bundle:Bundle;products:Product[]}){
 const cart=useCart();
 const priced=priceBundle(bundle,products);
 if(!priced)return null;
 const available=priced.lines.every(l=>l.variant.available);
 const saving=Math.round((priced.fullPrice-priced.price)*100)/100;
 return <article className={'bundle-card'+(available?'':' product-card-out')}>
  <div className="bundle-card-media">
   {priced.image||priced.lines[0]?.product.image
    ?<img src={priced.image||priced.lines[0].product.image} alt={priced.name} loading="lazy"/>
    :<span className="product-card-blank"><Gift size={30}/></span>}
   {priced.badge&&<span className="bundle-badge">{priced.badge}</span>}
  </div>
  <div className="bundle-card-body">
   <h3>{priced.name}</h3>
   {priced.description&&<p className="bundle-card-text">{priced.description}</p>}
   <ul className="bundle-contents">{priced.lines.map((l,i)=><li key={i}>
    <span>{l.product.name} — {variantLabel(l.product,l.variant)}</span>
    <em>× {l.quantity}{l.free?' free':''}</em>
   </li>)}</ul>
   <div className="bundle-card-foot">
    <div className="bundle-price">
     <strong>{money(priced.price)}</strong>
     {saving>0.004&&<><s>{money(priced.fullPrice)}</s><span className="bundle-save">Save {money(saving)}</span></>}
    </div>
    <Button disabled={!available} onClick={()=>{cart.add({kind:'bundle',bundleId:priced.id,quantity:1});cart.setOpen(true)}}>
     {available?<><ShoppingBag size={15}/>Add offer</>:'Out of stock'}
    </Button>
   </div>
  </div>
 </article>;
}
