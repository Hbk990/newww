'use client';
import {useState} from 'react';
import {toast} from 'sonner';
import {Store,displayPhone} from '@/app/model';
import {Button} from '@/components/ui/button';
import {Switch} from '@/components/ui/switch';
import {adminApi} from './api';

type Settings=Store&{published:boolean};
const blank:Settings={storeName:'HUQA',tagline:'Arguileh & Vapes',whatsapp:'96171392434',instagram:'',address:'',hours:'',announcement:'',deliveryFee:0,freeDeliveryOver:0,published:false};

export function StorefrontSettings({store,onSaved}:{store:Settings|null;onSaved:(s:Settings)=>void}){
 const [draft,setDraft]=useState<Settings>(store??blank);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const set=<K extends keyof Settings>(key:K)=>(value:Settings[K])=>setDraft(d=>({...d,[key]:value}));
 const text=(key:'storeName'|'tagline'|'whatsapp'|'instagram'|'address'|'hours'|'announcement')=>(e:{target:{value:string}})=>set(key)(e.target.value);

 async function save(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError('');
  try{const j=await adminApi<{store:Settings}>('storefront',{store:draft});onSaved(j.store);setDraft(j.store);toast.success(j.store.published?'Storefront saved and live':'Storefront saved')}
  catch(err){setError((err as Error).message)}finally{setBusy(false)}
 }

 return <form className="settings-form" onSubmit={save}>
  <div className={'publish-row'+(draft.published?' publish-on':'')}>
   <div>
    <strong>{draft.published?'Your shop is live':'Your shop is hidden'}</strong>
    <p>{draft.published?'Customers can browse and order right now.':'Visitors see a “coming soon” page until you switch this on.'}</p>
   </div>
   <Switch checked={draft.published} onCheckedChange={v=>set('published')(v)} aria-label="Shop is live"/>
  </div>

  <fieldset disabled={busy}>
   <h3>Shop identity</h3>
   <label className="field">Shop name<input required maxLength={80} value={draft.storeName} onChange={text('storeName')}/></label>
   <label className="field">Tagline<input maxLength={160} placeholder="Arguileh & Vapes" value={draft.tagline} onChange={text('tagline')}/></label>
   <label className="field">Announcement bar <span className="field-optional">Optional</span><input maxLength={200} placeholder="Free delivery in Beirut this week" value={draft.announcement} onChange={text('announcement')}/></label>
  </fieldset>

  <fieldset disabled={busy}>
   <h3>Contact</h3>
   <label className="field">WhatsApp number<input required maxLength={24} inputMode="tel" placeholder="96171392434" value={draft.whatsapp} onChange={text('whatsapp')}/><small>International format, digits only. Orders arrive here as {displayPhone(draft.whatsapp.replace(/\D/g,'')||'96171392434')}.</small></label>
   <label className="field">Instagram handle <span className="field-optional">Optional</span><input maxLength={60} placeholder="huqa.lb" value={draft.instagram} onChange={text('instagram')}/></label>
   <label className="field">Address <span className="field-optional">Optional</span><input maxLength={200} value={draft.address} onChange={text('address')}/></label>
   <label className="field">Opening hours <span className="field-optional">Optional</span><input maxLength={120} placeholder="Every day, 10:00 – 23:00" value={draft.hours} onChange={text('hours')}/></label>
  </fieldset>

  <fieldset disabled={busy}>
   <h3>Delivery</h3>
   <div className="field-grid">
    <label className="field">Delivery fee (USD)<input type="number" min="0" max="1000" step="0.01" inputMode="decimal" value={draft.deliveryFee} onChange={e=>set('deliveryFee')(e.target.value===''?0:Number(e.target.value))}/></label>
    <label className="field">Free delivery over (USD)<input type="number" min="0" max="100000" step="0.01" inputMode="decimal" value={draft.freeDeliveryOver} onChange={e=>set('freeDeliveryOver')(e.target.value===''?0:Number(e.target.value))}/><small>Set 0 to always charge the fee.</small></label>
   </div>
  </fieldset>

  {error&&<p className="error" role="alert">{error}</p>}
  <Button type="submit" className="h-11 w-full" disabled={busy}>{busy?'Saving…':'Save storefront'}</Button>
 </form>;
}
