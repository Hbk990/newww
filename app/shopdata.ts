import {storeSettings,catalog,bundleList} from './store';
import {Bundle,Product,Store} from './model';

export type ShopData={published:boolean;store:Store;products:Product[];bundles:Bundle[]};

// Every storefront page reads through here, so a missing binding or an unpublished shop
// degrades to the "coming soon" screen instead of a 500 in front of a customer.
export async function loadShop():Promise<ShopData>{
 try{
  const [settings,products,bundles]=await Promise.all([storeSettings(),catalog(),bundleList()]);
  const {published,...store}=settings;
  return {published,store,products:published?products:[],bundles:published?bundles.filter(b=>b.active):[]};
 }catch(e){
  console.error('Storefront data unavailable',e);
  const {published,...store}=(await import('./store')).defaultStore;
  return {published:false,store,products:[],bundles:[]};
 }
}
