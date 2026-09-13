import {storeSettings,catalog,bundleList} from '../../store';
import {failure} from '../../server';
export const dynamic='force-dynamic';

export async function GET(){try{
 const store=await storeSettings();
 if(!store.published)return Response.json({published:false,store:null,products:[],bundles:[]},{headers:{'Cache-Control':'no-store'}});
 const {published,...info}=store;
 const [products,bundles]=await Promise.all([catalog(),bundleList()]);
 return Response.json({published:true,store:info,products,bundles:bundles.filter(b=>b.active)},{headers:{'Cache-Control':'public, max-age=30'}});
}catch(e){return failure(e)}}
