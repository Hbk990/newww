type Failure={error?:string};
export async function adminApi<T>(action?:string,data:object={}):Promise<T>{
 const r=await fetch('/api/inventory'+(action?'':'?view=status'),action?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...data})}:{cache:'no-store'});
 const j=await r.json() as T&Failure;
 if(!r.ok)throw Error(j.error||'Request failed.');
 return j;
}
export async function adminView<T>(view:string,cursor?:string):Promise<T&{cursor:string|null}>{
 const r=await fetch(`/api/inventory?view=${view}`+(cursor?'&cursor='+encodeURIComponent(cursor):''),{cache:'no-store'});
 const j=await r.json() as T&{cursor:string|null}&Failure;
 if(!r.ok)throw Error(j.error||'Request failed.');
 return j;
}
