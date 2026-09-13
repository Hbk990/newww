'use client';
import {useState} from 'react';
import {Bundle,Product} from '@/app/model';
import {ProductGrid,BundleCard} from './pieces';
import {correct,searchBundles,searchProducts,vocabulary} from './search';

export function SearchResults({query,products,bundles}:{query:string;products:Product[];bundles:Bundle[]}){
 const [forced,setForced]=useState(false);
 const direct=searchProducts(products,query);
 const suggestion=direct.length?null:correct(query,vocabulary(products));
 // A dead-end search quietly runs the corrected spelling instead, and says so.
 const effective=!direct.length&&suggestion&&!forced?suggestion:query;
 const items=effective===query?direct:searchProducts(products,effective);
 const offers=searchBundles(bundles,effective);

 return <>
  <div className="page-head">
   <h1>Results for “{query}”</h1>
   {effective!==query
    ?<p>Nothing matched that spelling, so we searched for <strong>{effective}</strong> instead. <button type="button" className="link-button" onClick={()=>setForced(true)}>Search “{query}” anyway</button></p>
    :<p>{items.length+offers.length} match{items.length+offers.length===1?'':'es'}.</p>}
  </div>
  {offers.length>0&&<section className="shop-section"><div className="section-head"><h2>Offers</h2></div><div className="bundle-grid">{offers.map(b=><BundleCard key={b.id} bundle={b} products={products}/>)}</div></section>}
  <ProductGrid products={items} empty="No products matched. Try a brand or a flavour name."/>
 </>;
}
