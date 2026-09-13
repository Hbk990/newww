import {Link} from '@/components/shop/link';
import type {Metadata} from 'next';
import {ArrowRight,Flame,Leaf,Award,MessageCircle} from 'lucide-react';
import {loadShop} from '../shopdata';
import {isHuqaBrand,money,inStock} from '../model';
import {ShopShell,ComingSoon} from '@/components/shop/shell';
import {ProductGrid} from '@/components/shop/pieces';

export const dynamic='force-dynamic';
export const metadata:Metadata={
 title:'HUQA Shisha',
 description:'The HUQA shisha line — our own blends, packed under our own name and sold in our own shop.',
};

export default async function HuqaPage(){
 const {published,store,products,bundles}=await loadShop();
 if(!published)return <ComingSoon store={store}/>;
 const mine=products.filter(isHuqaBrand);
 const available=mine.filter(inStock);
 const from=mine.length?money(Math.min(...mine.map(p=>p.price??0))):null;

 return <ShopShell store={store} products={products} bundles={bundles}>
  <section className="huqa-hero">
   <div className="huqa-hero-text">
    <p className="hero-eyebrow"><Flame size={15}/>Our own line</p>
    <h1>HUQA Shisha</h1>
    <p>We did not set out to resell someone else&apos;s tobacco. HUQA is the blend we kept mixing for ourselves behind the counter — the one regulars started asking for by name until we had to put it in a box.</p>
    <p>Packed in small runs, built for a long session, and priced the way a corner shop should price things{from?`, starting at ${from}`:''}.</p>
    <div className="hero-actions">
     <a href="#huqa-range" className="hero-cta">See the range<ArrowRight size={17}/></a>
     <a className="hero-cta hero-cta-ghost" href={'https://wa.me/'+store.whatsapp+'?text='+encodeURIComponent('Hello! I want to ask about HUQA shisha.')} target="_blank" rel="noreferrer"><MessageCircle size={16}/>Ask about HUQA</a>
    </div>
   </div>
   {mine[0]?.image&&<div className="huqa-hero-media"><img src={mine[0].image} alt="HUQA shisha"/></div>}
  </section>

  <section className="huqa-pillars">
   <div><Leaf size={22}/><h3>Blended small</h3><p>Small batches, mixed to a recipe we actually smoke ourselves.</p></div>
   <div><Flame size={22}/><h3>Built to last a session</h3><p>Cut and moistened to hold its flavour through a full head, not ten minutes.</p></div>
   <div><Award size={22}/><h3>Ours end to end</h3><p>Our name on the box means we answer for it. Tell us if a batch is off.</p></div>
  </section>

  <section className="shop-section" id="huqa-range">
   <div className="section-head">
    <h2>The HUQA range</h2>
    <p>{mine.length?`${mine.length} product${mine.length===1?'':'s'}, ${available.length} in stock right now.`:'Coming to the shelf soon.'}</p>
   </div>
   <ProductGrid products={mine} empty="The HUQA line is not on the shelf yet — message us and we will tell you when it lands."/>
  </section>

  <section className="huqa-close">
   <h2>Not sure which blend?</h2>
   <p>Tell us how you smoke and we will pick one for you. It is a one-message conversation.</p>
   <div className="hero-actions">
    <a className="hero-cta" href={'https://wa.me/'+store.whatsapp} target="_blank" rel="noreferrer"><MessageCircle size={17}/>Message us</a>
    <Link href="/shop/disposables" className="hero-cta hero-cta-ghost">Browse the rest of the shop</Link>
   </div>
  </section>
 </ShopShell>;
}
