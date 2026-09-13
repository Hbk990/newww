import {env} from 'cloudflare:workers';
import {cookies} from 'next/headers';

// The shop is public and the admin signs in with a username and password, so there is a
// single tenant. Rows keep their `owner` column and every write pins it to this value.
export const OWNER='huqa';
export const SESSION_COOKIE='__Host-huqa';

export function db(){const d=(env as unknown as {DB:D1Database}).DB;if(!d)throw new Error('Storage unavailable');return d}
export function bucket(){const b=(env as unknown as {BUCKET:R2Bucket}).BUCKET;if(!b)throw new Error('File storage unavailable');return b}
export class HttpError extends Error{constructor(public status:number,message:string){super(message)}}
export const digest=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
export async function hashPassword(password:string,salt:string){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return Array.from(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:100000,salt:new TextEncoder().encode(salt)},k,256)),b=>b.toString(16).padStart(2,'0')).join('')}
export async function authenticated(){const token=(await cookies()).get(SESSION_COOKIE)?.value;if(!token)throw new HttpError(401,'Please sign in to your admin account.');const s=await db().prepare('SELECT id FROM sessions WHERE id=? AND owner=? AND expires>?').bind(await digest(token),OWNER,Date.now()).first();if(!s)throw new HttpError(401,'Your session expired. Sign in again.');return OWNER}
export async function newSession(){const token=crypto.randomUUID()+crypto.randomUUID();await db().prepare('INSERT INTO sessions(id,owner,expires) VALUES(?,?,?)').bind(await digest(token),OWNER,Date.now()+8*3600000).run();(await cookies()).set(SESSION_COOKIE,token,{httpOnly:true,secure:true,sameSite:'strict',path:'/',maxAge:8*3600})}
export function checkOrigin(req:Request){const origin=req.headers.get('origin');if(!origin||origin!==new URL(req.url).origin)throw new HttpError(403,'Request origin rejected.')}
export function failure(e:unknown){if(e instanceof HttpError)return Response.json({error:e.message},{status:e.status,headers:{'Cache-Control':'no-store'}});console.error('Storefront request failed',e);return Response.json({error:'Could not complete this request. Your changes have not been discarded; please try again.'},{status:503,headers:{'Cache-Control':'no-store'}})}
