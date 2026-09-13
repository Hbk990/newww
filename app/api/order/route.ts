import {checkOrigin,failure,HttpError} from '../../server';
import {storeSettings,catalog,bundleList} from '../../store';
import {validateContact,buildOrder,recordOrder} from '../../orders';
import {orderMessage,whatsappLink} from '../../model';
export const dynamic='force-dynamic';

export async function POST(req:Request){try{
 checkOrigin(req);
 if(Number(req.headers.get('content-length')||0)>60000)throw new HttpError(413,'That order is too large to send. Please split it in two.');
 const raw=await req.text();
 if(raw.length>60000)throw new HttpError(413,'That order is too large to send. Please split it in two.');
 const body=JSON.parse(raw);
 const store=await storeSettings();
 if(!store.published)throw new HttpError(503,'The shop is not taking orders right now.');
 const contact=validateContact(body.contact);
 const [products,bundles]=await Promise.all([catalog(),bundleList()]);
 const deviceId=typeof body.deviceId==='string'&&body.deviceId.length<=64?body.deviceId:'';
 const order=buildOrder(body.cart,contact,store,products,bundles,deviceId,req.headers.get('cf-connecting-ip')??'');
 await recordOrder(order);
 return Response.json({ref:order.ref,total:order.total,deliveryFee:order.deliveryFee,whatsapp:whatsappLink(store.whatsapp,orderMessage(store,order))},{headers:{'Cache-Control':'no-store'}});
}catch(e){if(e instanceof SyntaxError)return failure(new HttpError(400,'Your order could not be read. Please rebuild your cart.'));return failure(e)}}
