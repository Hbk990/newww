import {authenticated,db,bucket,checkOrigin,HttpError,failure,OWNER} from '../../server';
import {storeSettings} from '../../store';
export const dynamic='force-dynamic';

// Product photos are public once the shop is live, but only the images a product or
// bundle actually points at. Drafts and images of deleted products stay behind the
// admin session.
async function publiclyServable(id:string){
 const store=await storeSettings();
 if(!store.published)return null;
 const m=await db().prepare('SELECT type FROM images WHERE id=? AND owner=?').bind(id,OWNER).first();
 if(!m)return null;
 // instr(), not LIKE: SQLite rejects LIKE patterns longer than 50 bytes and a UUID
 // reference is longer than that.
 const needle='/api/image?id='+id;
 const used=await db().prepare('SELECT 1 AS hit FROM products WHERE owner=? AND instr(data,?)>0 UNION ALL SELECT 1 AS hit FROM bundles WHERE owner=? AND instr(data,?)>0 LIMIT 1').bind(OWNER,needle,OWNER,needle).first();
 return used?String(m.type):null;
}

export async function GET(req:Request){try{
 const id=new URL(req.url).searchParams.get('id');
 if(!id||!/^[a-f0-9-]{36}$/.test(id))throw new HttpError(404,'Image not found.');
 const shared=await publiclyServable(id);
 let type=shared;
 if(!type){await authenticated();const m=await db().prepare('SELECT type FROM images WHERE id=? AND owner=?').bind(id,OWNER).first();if(!m)throw new HttpError(404,'Image not found.');type=String(m.type)}
 const o=await bucket().get(id);
 if(!o)throw new HttpError(404,'Image not found.');
 return new Response(o.body,{headers:{'Content-Type':type,'Cache-Control':shared?'public, max-age=31536000, immutable':'private, no-store','X-Content-Type-Options':'nosniff'}});
}catch(e){return failure(e)}}

export async function POST(req:Request){try{checkOrigin(req);await authenticated();if(Number(req.headers.get('content-length')||0)>5500000)throw new HttpError(413,'Maximum image size is 5 MB.');const f=(await req.formData()).get('file');if(!(f instanceof File)||f.size>5000000||f.size<12)throw new HttpError(400,'Choose a PNG, JPEG or WebP image under 5 MB.');const bytes=new Uint8Array(await f.arrayBuffer());const png=[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;const webp=new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';const type=png?'image/png':jpeg?'image/jpeg':webp?'image/webp':null;if(!type)throw new HttpError(400,'Only PNG, JPEG and WebP images are supported.');const id=crypto.randomUUID();await bucket().put(id,bytes,{httpMetadata:{contentType:type}});try{await db().prepare('INSERT INTO images(id,owner,type) VALUES(?,?,?)').bind(id,OWNER,type).run()}catch(e){await bucket().delete(id);throw e}return Response.json({url:'/api/image?id='+id},{headers:{'Cache-Control':'no-store'}})}catch(e){return failure(e)}}
