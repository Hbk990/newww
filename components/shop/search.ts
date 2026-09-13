import {Bundle,Product,distance,matches,normalize} from '@/app/model';

const words=(s:string)=>normalize(s).split(/[^a-z0-9]+/).filter(w=>w.length>2);

export function vocabulary(products:Product[]){
 const terms=new Set<string>();
 for(const p of products){[p.name,p.brand,...p.variants.map(v=>v.label)].forEach(v=>words(v).forEach(w=>terms.add(w)))}
 return [...terms];
}

// A misspelt word is swapped for the closest catalogue term so "elfbr" still lands on
// Elf Bar. Words the catalogue already knows are left alone.
export function correct(query:string,terms:string[]){
 const parts=query.trim().split(/\s+/);
 const fixed=parts.map(part=>{
  const q=normalize(part);
  if(q.length<3||terms.some(t=>t.includes(q)))return part;
  const limit=q.length>5?2:1;
  let best='',bestScore=limit+1;
  for(const t of terms){const d=distance(q,t);if(d<bestScore){bestScore=d;best=t}}
  return best?best:part;
 });
 const corrected=fixed.join(' ');
 return corrected.toLowerCase()===query.trim().toLowerCase()?null:corrected;
}

export const searchProducts=(products:Product[],query:string)=>
 !query.trim()?[]:products.filter(p=>matches([p.name,p.brand,p.category,p.description,...p.variants.map(v=>`${v.label} ${v.strength}`)].join(' '),query));

export const searchBundles=(bundles:Bundle[],query:string)=>
 !query.trim()?[]:bundles.filter(b=>matches(`${b.name} ${b.badge} ${b.description}`,query));
