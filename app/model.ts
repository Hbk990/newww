export const categories=['Disposables / Shisha','Disposables / 50mg','Disposables / 0mg','Machines','Coils & accessories / Coils & pods','Coils & accessories / Accessories','Liquids / 3mg','Liquids / 12mg','Liquids / 18mg','Liquids / 25mg','Liquids / 50mg','Nicotine pouches'];
// 20mg disposables predate the Shisha/50mg/0mg split; keep accepting them so old rows stay editable.
export const legacyCategories=['Disposables / 20mg'];
export type Variant={id:string;label:string;strength:string;available:boolean};
export type Product={id:string;name:string;brand:string;category:string;bottleSize?:string;price?:number;description:string;image:string;featured?:boolean;variants:Variant[];revision:number;updatedAt:number};
export function distance(a:string,b:string){const d=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let prev=d[0];d[0]=i;for(let j=1;j<=b.length;j++){let old=d[j];d[j]=Math.min(d[j]+1,d[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=old;}}return d[b.length]}
export const normalize=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
export const squash=(s:string)=>normalize(s).replace(/[^a-z0-9]/g,'');
// Shoppers type "elfbar" for "Elf Bar" and misspell the rest, so a word matches on a
// plain substring, on the space-stripped form, or within one or two edits of any word.
export function matches(value:string,query:string){
 const hay=normalize(value),tight=squash(value),words=hay.split(/[^a-z0-9]+/);
 return normalize(query).trim().split(/\s+/).every(q=>{
  if(hay.includes(q))return true;
  const packed=squash(q);
  if(packed.length>=3&&tight.includes(packed))return true;
  return q.length>=3&&words.some(w=>distance(w,q)<=(q.length>=5?2:1));
 });
}

export const bottleSizes=["30ml","60ml","100ml","120ml"];
export function liquidBottleSize(category:string,value:unknown){if(!category.startsWith("Liquids / "))return "";if(typeof value!=="string"||!bottleSizes.includes(value))throw new Error("Choose a bottle size: 30ml, 60ml, 100ml or 120ml.");return value}

export const groupOf=(category:string)=>category.split(' / ')[0];
export const subOf=(category:string)=>category.split(' / ')[1]??'';
export const categoryGroups=[...new Set(categories.map(groupOf))];
export const liquidStrengths=categories.filter(c=>c.startsWith('Liquids / ')).map(subOf);
export const disposableKinds=categories.filter(c=>c.startsWith('Disposables / ')).map(subOf);
export const money=(value:number)=>'$'+value.toFixed(2);
export const inStock=(p:Pick<Product,'variants'>)=>p.variants.some(v=>v.available);
export function variantLabel(p:Pick<Product,'bottleSize'>,v:Pick<Variant,'label'|'strength'>){return [v.label,v.strength,p.bottleSize].filter(Boolean).join(' · ')}
export const variantWord=(category:string)=>category==='Machines'?'Colour':category.startsWith('Coils & accessories')?'Option':category==='Nicotine pouches'?'Flavour & strength':'Flavour';
// "3 colours", "6 options", "5 flavours" — the picker legend can say "Flavour & strength",
// but a count needs a word that pluralises.
export function variantCount(category:string,n:number){const word=category==='Machines'?'colour':category.startsWith('Coils & accessories')||category==='Nicotine pouches'?'option':'flavour';return `${n} ${word}${n===1?'':'s'}`}

// Storefront sections drive the navigation menu, the category landing pages and the
// admin category shortcuts, so both sides always agree on where a product appears.
export type Section={slug:string;title:string;blurb:string;categories:string[];facet:'kind'|'strength'|'brand'|'none'};
export const sections:Section[]=[
 {slug:'disposables',title:'Disposables',blurb:'Ready-to-vape devices — shisha flavours, 50mg salt and nicotine-free.',categories:categories.filter(c=>c.startsWith('Disposables / ')).concat(legacyCategories),facet:'kind'},
 {slug:'liquids',title:'E-Liquids',blurb:'Pick your nicotine strength, then your brand and flavour.',categories:categories.filter(c=>c.startsWith('Liquids / ')),facet:'strength'},
 {slug:'machines',title:'Machines',blurb:'Mods, kits and pod systems — every model in your colour.',categories:['Machines'],facet:'none'},
 {slug:'coils',title:'Coils & Pods',blurb:'Replacement coils and pods, sorted by brand.',categories:['Coils & accessories / Coils & pods'],facet:'brand'},
 {slug:'accessories',title:'Accessories',blurb:'Batteries, chargers, tanks, glass and everything else.',categories:['Coils & accessories / Accessories'],facet:'none'},
 {slug:'pouches',title:'Nicotine Pouches',blurb:'Every model, every flavour, in both strengths.',categories:['Nicotine pouches'],facet:'none'},
];
export const sectionFor=(category:string)=>sections.find(s=>s.categories.includes(category));
export const HUQA_BRAND='HUQA';
export const isHuqaBrand=(p:Pick<Product,'brand'>)=>normalize(p.brand).trim()===normalize(HUQA_BRAND);

export type BundleItem={productId:string;variantId:string;quantity:number;free:boolean};
export type Bundle={id:string;name:string;badge:string;description:string;image:string;items:BundleItem[];mode:'items'|'fixed'|'percent';value:number;active:boolean;revision:number;updatedAt:number};

export type PricedBundle=Bundle&{lines:{product:Product;variant:Variant;quantity:number;free:boolean}[];fullPrice:number;price:number};
// A bundle prices three ways: `items` charges only the non-free lines (buy two, get one
// free), `fixed` sets an outright price and `percent` discounts the full total.
export function priceBundle(b:Bundle,products:Product[]):PricedBundle|null{
 const lines=b.items.map(i=>{const product=products.find(p=>p.id===i.productId);const variant=product?.variants.find(v=>v.id===i.variantId);return product&&variant?{product,variant,quantity:i.quantity,free:i.free}:null});
 if(lines.some(l=>!l))return null;
 const ok=lines as NonNullable<(typeof lines)[number]>[];
 const fullPrice=ok.reduce((s,l)=>s+(l.product.price??0)*l.quantity,0);
 const paid=ok.filter(l=>!l.free).reduce((s,l)=>s+(l.product.price??0)*l.quantity,0);
 const price=b.mode==='fixed'?b.value:b.mode==='percent'?fullPrice*(1-b.value/100):paid;
 return {...b,lines:ok,fullPrice:Math.round(fullPrice*100)/100,price:Math.round(Math.max(0,price)*100)/100};
}
export const bundleInStock=(b:PricedBundle)=>b.lines.every(l=>l.variant.available);

export type Store={storeName:string;tagline:string;whatsapp:string;instagram:string;address:string;hours:string;announcement:string;deliveryFee:number;freeDeliveryOver:number};
export const deliveryAreas=['Beirut','Mount Lebanon','North Lebanon','Akkar','Bekaa','Baalbek-Hermel','South Lebanon','Nabatieh'];
export const deliveryCost=(store:Pick<Store,'deliveryFee'|'freeDeliveryOver'>,subtotal:number)=>store.freeDeliveryOver>0&&subtotal>=store.freeDeliveryOver?0:store.deliveryFee;

export type CartLine={kind:'product';productId:string;variantId:string;quantity:number}|{kind:'bundle';bundleId:string;quantity:number};
export type OrderLine={kind:'product'|'bundle';name:string;detail:string;quantity:number;unitPrice:number;total:number;contents?:string[]};
export type Contact={name:string;phone:string;area:string;address:string;note:string};
export type Order={ref:string;createdAt:number;status:OrderStatus;contact:Contact;lines:OrderLine[];subtotal:number;deliveryFee:number;total:number;deviceId:string;ip:string};
export const orderStatuses=['new','confirmed','delivered','cancelled'] as const;
export type OrderStatus=(typeof orderStatuses)[number];

export function lebanesePhone(raw:string){const digits=raw.replace(/\D/g,'').replace(/^00/,'');const local=digits.startsWith('961')?digits.slice(3):digits.replace(/^0/,'');if(!/^[0-9]{7,8}$/.test(local))throw new Error('Enter a Lebanese mobile number, for example 71 392 434.');return '961'+local}
export const displayPhone=(e164:string)=>e164.startsWith('961')?'+961 '+e164.slice(3).replace(/(\d{2})(\d{3})(\d+)/,'$1 $2 $3'):'+'+e164;
export function whatsappLink(number:string,message:string){return 'https://wa.me/'+number.replace(/\D/g,'')+'?text='+encodeURIComponent(message)}

export function orderMessage(store:Pick<Store,'storeName'>,order:Pick<Order,'ref'|'contact'|'lines'|'subtotal'|'deliveryFee'|'total'>){
 const items=order.lines.flatMap((l,i)=>[`${i+1}. ${l.name}${l.detail?' — '+l.detail:''} × ${l.quantity} — ${money(l.total)}`,...(l.contents??[]).map(c=>'    • '+c)]);
 const c=order.contact;
 return [`Hello ${store.storeName}! I would like to place order ${order.ref}:`,'',...items,'',
  `Subtotal: ${money(order.subtotal)}`,`Delivery: ${order.deliveryFee?money(order.deliveryFee):'Free'}`,`Total: ${money(order.total)}`,'',
  `Name: ${c.name}`,`Phone: ${displayPhone(c.phone)}`,`Area: ${c.area}`,`Address: ${c.address}`,...(c.note?[`Note: ${c.note}`]:[])].join('\n');
}
