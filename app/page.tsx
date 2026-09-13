import Link from 'next/link';
import {ArrowRight,Truck,MessageCircle,ShieldCheck,Flame} from 'lucide-react';
import {loadShop} from './shopdata';
import {inStock,money,sections,isHuqaBrand,priceBundle} from './model';
import {ShopShell,ComingSoon} from '@/components/shop/shell';
import {ProductGrid,BundleCard} from '@/components/shop/pieces';

export const dynamic='force-dynamic';

export default async function Home(){
 const {published,store,products,bundles}=await loadShop();
 if(!published)return <ComingSoon store={store}/>;
 const featured=products.filter(p=>p.featured&&inStock(p)).slice(0,8);
 const newest=[...products].sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,8);
 const shelf=featured.length>=4?featured:newest;
 const offers=bundles.map(b=>priceBundle(b,products)).filter(Boolean).slice(0,3);
 const huqa=products.filter(isHuqaBrand);
 const counts=Object.fromEntries(sections.map(s=>[s.slug,products.filter(p=>s.categories.includes(p.category)).length]));

 return <ShopShell store={store} products={products} bundles={bundles}>
  <section className="hero">
   <div className="hero-inner">
    <p className="hero-eyebrow">{store.tagline||'Arguileh & Vapes'}</p>
    <h1>Everything you vape,<br/>delivered across Lebanon.</h1>
    <p className="hero-text">Disposables, e-liquids, machines, coils and pouches — picked in a few taps and sent straight to our WhatsApp. No account, no checkout forms you will regret.</p>
    <div className="hero-actions">
     <Link href="/shop/disposables" className="hero-cta">Start shopping<ArrowRight size={17}/></Link>
     <Link href="/huqa" className="hero-cta hero-cta-ghost"><Flame size={16}/>HUQA Shisha</Link>
    </div>
   </div>
  </section>

  <section className="shop-section">
   <div className="section-head"><h2>Browse the shop</h2><p>Six shelves, everything in its place.</p></div>
   <div className="category-grid">{sections.map(s=>
    <Link key={s.slug} href={'/shop/'+s.slug} className="category-tile">
     <div><h3>{s.title}</h3><p>{s.blurb}</p></div>
     <span>{counts[s.slug]} product{counts[s.slug]===1?'':'s'}<ArrowRight size={15}/></span>
    </Link>)}
   </div>
  </section>

  {offers.length>0&&<section className="shop-section">
   <div className="section-head"><h2>Bundles & offers</h2><Link href="/bundles" className="section-more">All offers<ArrowRight size={15}/></Link></div>
   <div className="bundle-grid">{bundles.slice(0,3).map(b=><BundleCard key={b.id} bundle={b} products={products}/>)}</div>
  </section>}

  <section className="shop-section">
   <div className="section-head"><h2>{featured.length>=4?'Picked for you':'Just added'}</h2><p>{featured.length>=4?'What we are pushing this week.':'The newest arrivals on the shelf.'}</p></div>
   <ProductGrid products={shelf} empty="Products are on their way."/>
  </section>

  {huqa.length>0&&<section className="huqa-band">
   <div>
    <p className="hero-eyebrow">Our own line</p>
    <h2>HUQA Shisha</h2>
    <p>Blended and packed under our own name — the flavours our regulars keep coming back for. {huqa.length} product{huqa.length===1?'':'s'} from {money(Math.min(...huqa.map(p=>p.price??0)))}.</p>
    <Link href="/huqa" className="hero-cta">Meet the range<ArrowRight size={17}/></Link>
   </div>
   {huqa[0]?.image&&<img src={huqa[0].image} alt="" loading="lazy"/>}
  </section>}

  <section className="promise-strip">
   <div><Truck size={22}/><h3>Delivery across Lebanon</h3><p>{store.freeDeliveryOver>0?`Free over ${money(store.freeDeliveryOver)}. Flat ${money(store.deliveryFee)} otherwise.`:store.deliveryFee>0?`Flat ${money(store.deliveryFee)} anywhere we reach.`:'We deliver to every area we cover.'}</p></div>
   <div><MessageCircle size={22}/><h3>Order on WhatsApp</h3><p>Build your cart here, confirm in one message. We reply fast.</p></div>
   <div><ShieldCheck size={22}/><h3>Only the real thing</h3><p>Authentic devices and liquids. 18+ only.</p></div>
  </section>
 </ShopShell>;
}
