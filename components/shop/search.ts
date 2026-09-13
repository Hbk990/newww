import {Bundle,Product,distance,matches,normalize,squash} from '@/app/model';

const words=(s:string)=>normalize(s).split(/[^a-z0-9]+/).filter(w=>w.length>2);

// Adjacent words are also stored joined up, so a query like "elfbr" can be corrected to
// "elfbar" — which then matches "Elf Bar" through the space-stripped test in matches().
export function vocabulary(products:Product[]){
 const terms=new Set<string>();
 const add=(value:string)=>{
  const parts=words(value);
  parts.forEach(w=>terms.add(w));
  parts.forEach((w,i)=>{if(i)terms.add(squash(parts[i-1]+w))});
 };
 for(const p of products){[p.name,p.brand,...p.variants.map(v=>v.label)].forEach(add)}
 return [...terms];
}

// A misspelt word is swapped for the closest catalogue term so "elfbr" still lands on
// Elf Bar. Words the catalogue already knows are left alone.
export function correct(query:string,terms:string[]){
 const parts=query.trim().split(/\s+/);
 const fixed=parts.map(part=>{
  const q=normalize(part);
  if(q.length<3||terms.some(t=>t.includes(q)))return part;
  const limit=q.length>=5?2:1;
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
