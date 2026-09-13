import Link from 'next/link';
import {notFound} from 'next/navigation';
import type {Metadata} from 'next';
import {ChevronRight} from 'lucide-react';
import {loadShop} from '../../shopdata';
import {inStock,money,sectionFor,variantCount} from '../../model';
import {ShopShell,ComingSoon} from '@/components/shop/shell';
import {AddToCart,ProductGrid,StockBadge} from '@/components/shop/pieces';

export const dynamic='force-dynamic';
type Props={params:Promise<{id:string}>};

export async function generateMetadata({params}:Props):Promise<Metadata>{
 const {id}=await params;
 const {products}=await loadShop();
 const product=products.find(p=>p.id===id);
 if(!product)return {title:'Product not found'};
 return {title:product.name,description:product.description.slice(0,160)||`${product.name} from ${product.brand||'HUQA'} — ${money(product.price??0)}.`};
}

export default async function ProductPage({params}:Props){
 const {id}=await params;
 const {published,store,products,bundles}=await loadShop();
 if(!published)return <ComingSoon store={store}/>;
 const product=products.find(p=>p.id===id);
 if(!product)notFound();
 const section=sectionFor(product.category);
 const related=products.filter(p=>p.id!==product.id&&p.category===product.category).sort((a,b)=>Number(a.brand!==product.brand)-Number(b.brand!==product.brand)).slice(0,4);

 return <ShopShell store={store} products={products} bundles={bundles}>
  <nav className="crumbs" aria-label="Breadcrumb">
   <Link href="/">Home</Link><ChevronRight size={14}/>
   {section&&<><Link href={'/shop/'+section.slug}>{section.title}</Link><ChevronRight size={14}/></>}
   <span>{product.name}</span>
  </nav>

  <div className="product-detail">
   <div className="product-detail-media">
    {product.image?<img src={product.image} alt={product.name}/>:<span className="product-card-blank product-card-blank-lg">{product.name.slice(0,2).toUpperCase()}</span>}
   </div>
   <div className="product-detail-body">
    {product.brand&&<p className="detail-brand">{product.brand}</p>}
    <h1>{product.name}</h1>
    <div className="detail-meta">
     <strong className="detail-price">{money(product.price??0)}</strong>
     <StockBadge available={inStock(product)}/>
    </div>
    <p className="detail-tags">
     <span>{product.category.replace(' / ',' · ')}</span>
     {product.bottleSize&&<span>{product.bottleSize}</span>}
     <span>{variantCount(product.category,product.variants.length)}</span>
    </p>
    <AddToCart product={product} whatsapp={store.whatsapp}/>
    {product.description&&<div className="detail-description"><h2>About this product</h2><p>{product.description}</p></div>}
   </div>
  </div>

  {related.length>0&&<section className="shop-section">
   <div className="section-head"><h2>You might also like</h2></div>
   <ProductGrid products={related}/>
  </section>}
 </ShopShell>;
}
