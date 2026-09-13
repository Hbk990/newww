'use client';
import {useMemo,useState} from 'react';
import {toast} from 'sonner';
import {Gift,ImagePlus,Plus,Search,Trash2,Upload} from 'lucide-react';
import {Bundle,BundleItem,Product,matches,money,priceBundle,variantLabel} from '@/app/model';
import {Button} from '@/components/ui/button';
import {Switch} from '@/components/ui/switch';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {adminApi} from './api';

const blank=():Bundle=>({id:'',name:'',badge:'',description:'',image:'',items:[],mode:'items',value:0,active:true,revision:0,updatedAt:0});
const modes:[Bundle['mode'],string,string][]=[
 ['items','Free item','Customer pays for the items you did not mark free.'],
 ['percent','Percent off','A percentage off the full price of everything inside.'],
 ['fixed','Fixed price','One price for the whole bundle, whatever the parts cost.'],
];

function ItemPicker({products,onPick,onClose}:{products:Product[];onPick:(i:BundleItem)=>void;onClose:()=>void}){
 const [query,setQuery]=useState('');
 const rows=useMemo(()=>products.flatMap(p=>p.variants.map(v=>({p,v}))).filter(({p,v})=>matches(`${p.name} ${p.brand} ${p.category} ${v.label} ${v.strength}`,query)).slice(0,80),[products,query]);
 return <Dialog open onOpenChange={o=>!o&&onClose()}>
  <DialogContent className="max-w-[620px] max-h-[85vh] flex flex-col p-0">
   <DialogHeader className="p-5 pb-3"><DialogTitle>Add an item</DialogTitle><DialogDescription>Pick the exact product and flavour that goes in this offer.</DialogDescription></DialogHeader>
   <div className="px-5 pb-3"><label className="picker-search"><Search size={16}/><input autoFocus placeholder="Search products and flavours…" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
   <div className="picker-list">
    {rows.map(({p,v})=><button key={p.id+v.id} type="button" className="picker-row" onClick={()=>{onPick({productId:p.id,variantId:v.id,quantity:1,free:false});onClose()}}>
     {p.image?<img src={p.image} alt=""/>:<span className="picker-blank"/>}
     <span><strong>{p.name}</strong><small>{variantLabel(p,v)} · {p.category.replace(' / ',' · ')}</small></span>
     <em>{money(p.price??0)}{!v.available&&<b> · out</b>}</em>
    </button>)}
    {!rows.length&&<p className="picker-empty">No products matched.</p>}
   </div>
  </DialogContent>
 </Dialog>;
}

export function Offers({bundles,products,onChange}:{bundles:Bundle[];products:Product[];onChange:(b:Bundle[])=>void}){
 const [editor,setEditor]=useState<Bundle|null>(null);
 const [picking,setPicking]=useState(false);
 const [removing,setRemoving]=useState<Bundle|null>(null);
 const [busy,setBusy]=useState(false);
 const [uploading,setUploading]=useState(false);
 const [error,setError]=useState('');

 const preview=editor?priceBundle(editor,products):null;
 const patch=(p:Partial<Bundle>)=>setEditor(b=>b?{...b,...p}:null);
 const patchItem=(index:number,p:Partial<BundleItem>)=>patch({items:editor!.items.map((it,i)=>i===index?{...it,...p}:it)});

 async function save(){
  if(!editor)return;
  setBusy(true);setError('');
  try{
   const j=await adminApi<{bundle:Bundle}>('bundle',{bundle:editor});
   onChange([j.bundle,...bundles.filter(b=>b.id!==j.bundle.id)]);
   setEditor(null);toast.success('Offer saved');
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 async function remove(){
  if(!removing)return;
  setBusy(true);
  try{await adminApi<{ok:true}>('bundle-delete',{id:removing.id});onChange(bundles.filter(b=>b.id!==removing.id));setRemoving(null);setEditor(null);toast.success('Offer removed')}
  catch(e){toast.error((e as Error).message)}finally{setBusy(false)}
 }
 async function upload(f?:File){
  if(!f)return;
  setUploading(true);setError('');
  try{
   if(f.size>5000000)throw Error('Choose an image under 5 MB.');
   const form=new FormData();form.set('file',f);
   const r=await fetch('/api/image',{method:'POST',body:form});
   const j=await r.json() as {url?:string;error?:string};
   if(!r.ok||!j.url)throw Error(j.error||'Upload failed.');
   patch({image:j.url});
  }catch(e){setError((e as Error).message)}finally{setUploading(false)}
 }

 return <>
  <div className="flex flex-wrap justify-between gap-4 items-center mb-8">
   <div>
    <p className="text-xs uppercase tracking-[.15em] text-muted-foreground mb-3">Bundles & offers</p>
    <h1 className="page-title">Your offers</h1>
    <p className="quiet mt-2">Group products into deals. Only active offers appear in the shop.</p>
   </div>
   <Button className="h-11 px-5" onClick={()=>{setError('');setEditor(blank())}}><Plus size={18}/>New offer</Button>
  </div>

  {bundles.length?<div className="offer-list">{bundles.map(b=>{
   const priced=priceBundle(b,products);
   return <button key={b.id} type="button" className="offer-row" onClick={()=>{setError('');setEditor(structuredClone(b))}}>
    <span className="offer-row-icon">{b.image?<img src={b.image} alt=""/>:<Gift size={20}/>}</span>
    <span className="offer-row-body">
     <strong>{b.name}</strong>
     <small>{b.items.length} item{b.items.length===1?'':'s'}{b.badge?' · '+b.badge:''}{priced?'':' · one item is missing'}</small>
    </span>
    {priced&&<span className="offer-row-price"><strong>{money(priced.price)}</strong>{priced.fullPrice>priced.price+0.004&&<s>{money(priced.fullPrice)}</s>}</span>}
    <span className={'badge'+(b.active?'':' off')}>{b.active?'Live':'Hidden'}</span>
   </button>;
  })}</div>:<div className="grid-empty">No offers yet. Create one to show a deal on the shop.</div>}

  <Sheet open={!!editor} onOpenChange={o=>{if(!o&&!busy&&!uploading)setEditor(null)}}>
   <SheetContent className="product-editor w-full sm:max-w-[760px] h-dvh max-h-dvh p-0 gap-0 overflow-hidden flex flex-col">
    <SheetHeader className="editor-heading shrink-0">
     <div className="editor-heading-icon"><Gift size={22}/></div>
     <div><p className="editor-eyebrow">Shop / Offer editor</p><SheetTitle className="editor-title">{editor?.id?'Edit offer':'New offer'}</SheetTitle><SheetDescription className="editor-subtitle">Bundle products together and set the deal.</SheetDescription></div>
    </SheetHeader>
    {editor&&<form className="flex min-h-0 flex-1 flex-col" onSubmit={e=>{e.preventDefault();save()}}>
     <div className="editor-scroll min-h-0 flex-1 overflow-y-auto">
      <section className="editor-card">
       <div className="editor-section-heading"><span className="section-number">01</span><div><h3>The offer</h3><p>What the customer sees on the card.</p></div></div>
       <div className="editor-fields">
        <label className="field">Offer name<input required maxLength={120} placeholder="e.g. Two pods, one free" value={editor.name} onChange={e=>patch({name:e.target.value})}/></label>
        <label className="field">Badge <span className="field-optional">Optional</span><input maxLength={40} placeholder="BUY 2 GET 1 FREE" value={editor.badge} onChange={e=>patch({badge:e.target.value})}/></label>
        <label className="field">Description <span className="field-optional">Optional</span><textarea rows={2} maxLength={1000} value={editor.description} onChange={e=>patch({description:e.target.value})}/></label>
        <label className={'image-upload '+(editor.image?'has-image':'')}>
         {editor.image?<img src={editor.image} alt="Offer preview"/>:<><span className="upload-icon"><ImagePlus size={25} strokeWidth={1.5}/></span><strong>{uploading?'Uploading…':'Offer image'}</strong><span>Optional — we fall back to the first product&apos;s photo.</span></>}
         <input type="file" aria-label="Upload offer image" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={e=>{upload(e.target.files?.[0]);e.target.value=''}}/>
         {editor.image&&<span className="replace-image"><Upload size={14}/>{uploading?'Uploading…':'Replace'}</span>}
        </label>
        {editor.image&&<Button type="button" size="sm" variant="ghost" className="text-destructive w-fit" onClick={()=>patch({image:''})}><Trash2 size={14}/>Remove image</Button>}
       </div>
      </section>

      <section className="editor-card">
       <div className="variants-section-top">
        <div className="editor-section-heading"><span className="section-number">02</span><div><h3>What is inside <span className="variant-count">{editor.items.length}</span></h3><p>Pick the exact flavours that ship in this deal.</p></div></div>
        <Button type="button" variant="outline" className="add-variant-button" onClick={()=>setPicking(true)}><Plus size={15}/>Add item</Button>
       </div>
       <div className="bundle-item-list">
        {editor.items.map((item,i)=>{
         const product=products.find(p=>p.id===item.productId);
         const variant=product?.variants.find(v=>v.id===item.variantId);
         return <div key={i} className="bundle-item">
          <div className="bundle-item-head">
           <span>{product?<><strong>{product.name}</strong><small>{variant?variantLabel(product,variant):'flavour missing'}</small></>:<strong className="text-destructive">Product no longer exists</strong>}</span>
           <Button type="button" size="icon" variant="ghost" aria-label="Remove item" onClick={()=>patch({items:editor.items.filter((_,x)=>x!==i)})}><Trash2 size={15}/></Button>
          </div>
          <div className="bundle-item-controls">
           <label className="field">Quantity<input type="number" min="1" max="99" value={item.quantity} onChange={e=>patchItem(i,{quantity:Math.max(1,Math.min(99,Number(e.target.value)||1))})}/></label>
           <label className="availability-control is-available"><Switch checked={item.free} onCheckedChange={v=>patchItem(i,{free:v})} aria-label="Free item"/><span>{item.free?'Free':'Paid'}</span></label>
           <span className="bundle-item-price">{money((product?.price??0)*item.quantity)}</span>
          </div>
         </div>;
        })}
        {!editor.items.length&&<p className="picker-empty">Add at least two items.</p>}
       </div>
      </section>

      <section className="editor-card">
       <div className="editor-section-heading"><span className="section-number">03</span><div><h3>Pricing</h3><p>How the discount is worked out.</p></div></div>
       <div className="mode-row">{modes.map(([mode,label,hint])=>
        <button key={mode} type="button" className={'mode-option'+(editor.mode===mode?' mode-on':'')} aria-pressed={editor.mode===mode} onClick={()=>patch({mode,value:0})}>
         <strong>{label}</strong><small>{hint}</small>
        </button>)}
       </div>
       {editor.mode!=='items'&&<label className="field mt-4">{editor.mode==='percent'?'Discount (%)':'Bundle price (USD)'}
        <input required type="number" min="0" max={editor.mode==='percent'?100:1000000} step="0.01" inputMode="decimal" value={editor.value} onChange={e=>patch({value:e.target.value===''?0:Number(e.target.value)})}/>
       </label>}
       {preview&&<div className="price-preview">
        <span>Full price <strong>{money(preview.fullPrice)}</strong></span>
        <span>Customer pays <strong>{money(preview.price)}</strong></span>
        <span>Saving <strong>{money(Math.max(0,Math.round((preview.fullPrice-preview.price)*100)/100))}</strong></span>
       </div>}
       <label className={'publish-row mt-4'+(editor.active?' publish-on':'')}>
        <div><strong>{editor.active?'Showing in the shop':'Hidden from the shop'}</strong><p>Hidden offers stay saved but customers cannot see or order them.</p></div>
        <Switch checked={editor.active} onCheckedChange={v=>patch({active:v})} aria-label="Offer is live"/>
       </label>
      </section>
      {error&&<p className="error" role="alert">{error}</p>}
     </div>
     <div className="editor-footer shrink-0">
      <div>{editor.id&&<Button type="button" variant="ghost" className="text-destructive" onClick={()=>setRemoving(editor)} disabled={busy}><Trash2 size={16}/>Delete</Button>}</div>
      <div className="editor-footer-actions">
       <Button type="button" variant="outline" onClick={()=>setEditor(null)} disabled={busy}>Cancel</Button>
       <Button type="submit" className="save-product-button" disabled={busy||uploading||editor.items.length<2}>{busy?'Saving…':'Save offer'}</Button>
      </div>
     </div>
    </form>}
   </SheetContent>
  </Sheet>

  {picking&&editor&&<ItemPicker products={products} onClose={()=>setPicking(false)} onPick={item=>patch({items:[...editor.items,item]})}/>}

  <AlertDialog open={!!removing} onOpenChange={o=>!o&&setRemoving(null)}>
   <AlertDialogContent>
    <AlertDialogHeader><AlertDialogTitle>Delete {removing?.name}?</AlertDialogTitle><AlertDialogDescription>The offer disappears from the shop. The products inside it are not touched.</AlertDialogDescription></AlertDialogHeader>
    <AlertDialogFooter><AlertDialogCancel>Keep it</AlertDialogCancel><AlertDialogAction onClick={remove}>Delete offer</AlertDialogAction></AlertDialogFooter>
   </AlertDialogContent>
  </AlertDialog>
 </>;
}
