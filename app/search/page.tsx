import type {Metadata} from 'next';
import {loadShop} from '../shopdata';
import {ShopShell,ComingSoon} from '@/components/shop/shell';
import {SearchResults} from '@/components/shop/search-results';

export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Search',robots:{index:false,follow:true}};

export default async function SearchPage({searchParams}:{searchParams:Promise<{q?:string}>}){
 const {q}=await searchParams;
 const query=(q??'').slice(0,80);
 const {published,store,products,bundles}=await loadShop();
 if(!published)return <ComingSoon store={store}/>;
 return <ShopShell store={store} products={products} bundles={bundles}>
  {query.trim()
   ?<SearchResults query={query} products={products} bundles={bundles}/>
   :<div className="page-head"><h1>Search</h1><p>Type a brand, flavour or device in the bar above.</p></div>}
 </ShopShell>;
}
