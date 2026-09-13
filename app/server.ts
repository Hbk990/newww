import {env} from 'cloudflare:workers';
import {getChatGPTUser} from './chatgpt-auth';
import {cookies} from 'next/headers';
export function db(){const d=(env as unknown as {DB:D1Database}).DB;if(!d)throw new Error('Storage unavailable');return d}
export function bucket(){return (env as unknown as {BUCKET:R2Bucket}).BUCKET}
export class HttpError extends Error{constructor(public status:number,message:string){super(message)}}
export async function identity(){const u=await getChatGPTUser();if(!u)throw new HttpError(401,'Sign in to your private workspace.');return u.userId}
export const digest=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
export async function hashPassword(password:string,salt:string){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return Array.from(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:100000,salt:new TextEncoder().encode(salt)},k,256)),b=>b.toString(16).padStart(2,'0')).join('')}
export async function authenticated(){const owner=await identity();const token=(await cookies()).get('__Host-huqa')?.value;if(!token)throw new HttpError(401,'Please sign in to your admin account.');const s=await db().prepare('SELECT id FROM sessions WHERE id=? AND owner=? AND expires>?').bind(await digest(token),owner,Date.now()).first();if(!s)throw new HttpError(401,'Your session expired. Sign in again.');return owner}
export async function newSession(owner:string){const token=crypto.randomUUID()+crypto.randomUUID();await db().prepare('INSERT INTO sessions(id,owner,expires) VALUES(?,?,?)').bind(await digest(token),owner,Date.now()+8*3600000).run();(await cookies()).set('__Host-huqa',token,{httpOnly:true,secure:true,sameSite:'strict',path:'/',maxAge:8*3600})}
export function checkOrigin(req:Request){const origin=req.headers.get('origin');if(!origin||origin!==new URL(req.url).origin)throw new HttpError(403,'Request origin rejected.')}
export function failure(e:unknown){if(e instanceof HttpError)return Response.json({error:e.message},{status:e.status,headers:{'Cache-Control':'no-store'}});console.error('Inventory request failed',e);return Response.json({error:'Could not complete this request. Your changes have not been discarded; please try again.'},{status:503,headers:{'Cache-Control':'no-store'}})}
