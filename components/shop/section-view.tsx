'use client';
import {useMemo,useState} from 'react';
import {Product,Section,inStock,subOf} from '@/app/model';
import {ProductGrid} from './pieces';

const sorters:Record<string,(a:Product,b:Product)=>number>={
 featured:(a,b)=>Number(!!b.featured)-Number(!!a.featured)||b.updatedAt-a.updatedAt,
 low:(a,b)=>(a.price??0)-(b.price??0),
 high:(a,b)=>(b.price??0)-(a.price??0),
 name:(a,b)=>a.name.localeCompare(b.name),
};
const sortLabels:[string,string][]=[['featured','Featured'],['low','Price: low to high'],['high','Price: high to low'],['name','Name A–Z']];

// Disposables step by kind, e-liquids by nicotine strength then brand, coils by brand.
// Whenever no brand is chosen for a brand-led section the results stay grouped by brand
// so the shelf reads the way the shop does.
export function SectionView({section,products,initialFacet=''}:{section:Section;products:Product[];initialFacet?:string}){
 const [facet,setFacet]=useState(initialFacet);
 const [brand,setBrand]=useState(section.facet==='brand'?initialFacet:'');
 const [stockOnly,setStockOnly]=useState(false);
 const [sort,setSort]=useState('featured');

 const mine=useMemo(()=>products.filter(p=>section.categories.includes(p.category)),[products,section]);
 const facetOptions=useMemo(()=>{
  if(section.facet==='brand')return [...new Set(mine.map(p=>p.brand).filter(Boolean))].sort();
  if(section.facet==='none')return [];
  return [...new Set(mine.map(p=>subOf(p.category)).filter(Boolean))].sort((a,b)=>parseInt(a)-parseInt(b)||a.localeCompare(b));
 },[mine,section]);

 const afterFacet=useMemo(()=>!facet?mine:mine.filter(p=>section.facet==='brand'?p.brand===facet:subOf(p.category)===facet),[mine,facet,section]);
 const brandOptions=useMemo(()=>section.facet==='brand'?[]:[...new Set(afterFacet.map(p=>p.brand).filter(Boolean))].sort(),[afterFacet,section]);
 const shown=useMemo(()=>afterFacet.filter(p=>(!brand||p.brand===brand)&&(!stockOnly||inStock(p))).sort(sorters[sort]),[afterFacet,brand,stockOnly,sort]);

 const groupByBrand=(section.slug==='liquids'||section.slug==='coils')&&!brand&&(section.facet!=='brand'||!facet);
 const groups=useMemo(()=>{
  if(!groupByBrand)return [];
  const map=new Map<string,Product[]>();
  for(const p of shown){const key=p.brand||'Other';map.set(key,[...(map.get(key)??[]),p])}
  return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
 },[shown,groupByBrand]);

 const chip=(label:string,on:boolean,onClick:()=>void)=><button key={label} type="button" className={'chip'+(on?' chip-on':'')} aria-pressed={on} onClick={onClick}>{label}</button>;

 return <div className="section-view">
  {facetOptions.length>0&&<div className="facet-block">
   <p className="facet-label">{section.facet==='brand'?'Brand':section.facet==='strength'?'Step 1 — nicotine strength':'Type'}</p>
   <div className="chip-row">{[chip('All',!facet,()=>{setFacet('');setBrand('')}),...facetOptions.map(o=>chip(o,facet===o,()=>{setFacet(o);setBrand('')}))]}</div>
  </div>}
  {brandOptions.length>1&&<div className="facet-block">
   <p className="facet-label">{section.facet==='strength'?'Step 2 — brand':'Brand'}</p>
   <div className="chip-row">{[chip('All brands',!brand,()=>setBrand('')),...brandOptions.map(o=>chip(o,brand===o,()=>setBrand(o)))]}</div>
  </div>}
  <div className="section-toolbar">
   <span className="section-count">{shown.length} product{shown.length===1?'':'s'}</span>
   <label className="stock-toggle"><input type="checkbox" checked={stockOnly} onChange={e=>setStockOnly(e.target.checked)}/>In stock only</label>
   <label className="sort-control">Sort
    <select value={sort} onChange={e=>setSort(e.target.value)}>{sortLabels.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
   </label>
  </div>
  {groups.length
   ?groups.map(([name,items])=><section key={name} className="brand-group"><h2>{name}</h2><ProductGrid products={items}/></section>)
   :<ProductGrid products={shown} empty={stockOnly?'Everything here is out of stock right now — uncheck “In stock only” to see it all.':'Nothing in this section yet.'}/>}
 </div>;
}
