import type {Metadata} from 'next';
import {loadShop} from '../shopdata';
import {ShopShell,ComingSoon} from '@/components/shop/shell';
import {Checkout} from '@/components/shop/checkout';

export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Checkout',robots:{index:false,follow:false}};

export default async function CheckoutPage(){
 const {published,store,products,bundles}=await loadShop();
 if(!published)return <ComingSoon store={store}/>;
 return <ShopShell store={store} products={products} bundles={bundles}><Checkout store={store}/></ShopShell>;
}
