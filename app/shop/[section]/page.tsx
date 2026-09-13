import {notFound} from 'next/navigation';
import type {Metadata} from 'next';
import {loadShop} from '../../shopdata';
import {sections} from '../../model';
import {ShopShell,ComingSoon} from '@/components/shop/shell';
import {SectionView} from '@/components/shop/section-view';

export const dynamic='force-dynamic';
type Props={params:Promise<{section:string}>;searchParams:Promise<{f?:string}>};

export async function generateMetadata({params}:Props):Promise<Metadata>{
 const {section:slug}=await params;
 const section=sections.find(s=>s.slug===slug);
 return section?{title:section.title,description:section.blurb}:{};
}

export default async function SectionPage({params,searchParams}:Props){
 const {section:slug}=await params;
 const section=sections.find(s=>s.slug===slug);
 if(!section)notFound();
 const facet=(await searchParams).f??'';
 const {published,store,products,bundles}=await loadShop();
 if(!published)return <ComingSoon store={store}/>;
 return <ShopShell store={store} products={products} bundles={bundles}>
  <div className="page-head">
   <h1>{section.title}</h1>
   <p>{section.blurb}</p>
  </div>
  <SectionView key={facet} section={section} products={products} initialFacet={facet}/>
 </ShopShell>;
}
