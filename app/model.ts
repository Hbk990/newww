export const categories=['Disposables / Shisha','Disposables / 50mg','Disposables / 20mg','Machines','Coils & accessories / Coils & pods','Coils & accessories / Accessories','Liquids / 3mg','Liquids / 12mg','Liquids / 18mg','Liquids / 25mg','Liquids / 50mg','Nicotine pouches'];
export type Variant={id:string;label:string;strength:string;available:boolean};
export type Product={id:string;name:string;brand:string;category:string;bottleSize?:string;price?:number;description:string;image:string;variants:Variant[];revision:number;updatedAt:number};
export function distance(a:string,b:string){const d=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let prev=d[0];d[0]=i;for(let j=1;j<=b.length;j++){let old=d[j];d[j]=Math.min(d[j]+1,d[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=old;}}return d[b.length]}
export function matches(value:string,query:string){const norm=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');const hay=norm(value);return norm(query).trim().split(/\s+/).every(q=>hay.includes(q)|| (q.length>=3&&hay.split(/[^a-z0-9]+/).some(w=>distance(w,q)<=(q.length>5?2:1))))}

export const bottleSizes=["30ml","60ml","100ml","120ml"];
export function liquidBottleSize(category:string,value:unknown){if(!category.startsWith("Liquids / "))return "";if(typeof value!=="string"||!bottleSizes.includes(value))throw new Error("Choose a bottle size: 30ml, 60ml, 100ml or 120ml.");return value}
