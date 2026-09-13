import type {Metadata} from 'next';
import {loadShop} from '../shopdata';
import {ShopShell,ComingSoon} from '@/components/shop/shell';
import {BundleCard} from '@/components/shop/pieces';

export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Bundles & Offers',description:'Buy-one-get-one deals, discounted sets and bundles from HUQA.'};

export default async function BundlesPage(){
 const {published,store,products,bundles}=await loadShop();
 if(!published)return <ComingSoon store={store}/>;
 return <ShopShell store={store} products={products} bundles={bundles}>
  <div className="page-head">
   <h1>Bundles & offers</h1>
   <p>Sets we have put together — some discounted, some with something thrown in for free.</p>
  </div>
  {bundles.length
   ?<div className="bundle-grid">{bundles.map(b=><BundleCard key={b.id} bundle={b} products={products}/>)}</div>
   :<p className="grid-empty">No offers running right now. Check back soon.</p>}
 </ShopShell>;
}
