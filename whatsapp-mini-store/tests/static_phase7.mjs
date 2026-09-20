import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const pass=(message)=>process.stdout.write(`PASS ${message}\n`);

for(const file of ['public/assets/css/app.css','public/assets/css/storefront.css']){
    const source=read(file).replace(/\/\*[\s\S]*?\*\//g,'');let depth=0;let minimum=0;
    for(const character of source){if(character==='{')depth++;else if(character==='}')depth--;minimum=Math.min(minimum,depth);}
    assert(depth===0&&minimum>=0,`${file} has unbalanced braces`);pass(`${file} balanced`);
}

const phpFiles=[];
const walk=(directory)=>{for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())walk(file);else if(entry.name.endsWith('.php'))phpFiles.push(file);}};
walk(root);
for(const file of phpFiles){
    const source=fs.readFileSync(file,'utf8');const stack=[];let state='html';
    for(let index=0;index<source.length;index++){
        const character=source[index];const next=source[index+1];
        if(state==='html'){if(source.startsWith('<?php',index)){state='code';index+=4;}else if(source.startsWith('<?=',index)){state='code';index+=2;}continue;}
        if(state==='line'){if(character==='\n')state='code';continue;}
        if(state==='block'){if(character==='*'&&next==='/'){state='code';index++;}continue;}
        if(state==='single'){if(character==='\\')index++;else if(character==="'")state='code';continue;}
        if(state==='double'){if(character==='\\')index++;else if(character==='"')state='code';continue;}
        if(character==='?'&&next==='>'){state='html';index++;continue;}
        if(character==='/'&&next==='/'){state='line';index++;continue;}if(character==='#'){state='line';continue;}
        if(character==='/'&&next==='*'){state='block';index++;continue;}if(character==="'"){state='single';continue;}if(character==='"'){state='double';continue;}
        if('([{'.includes(character))stack.push(character);else if(')]}'.includes(character)){const wanted={')':'(',']':'[','}':'{'}[character];assert(stack.pop()===wanted,`${file}: mismatched ${character}`);}
    }
    assert(stack.length===0,`${file}: unclosed delimiters ${stack.join('')}`);
}
pass(`${phpFiles.length} PHP files passed delimiter scan`);

const migration=read('database/migrations/006_phase7_seo_growth.sql');
for(const needle of ['seo_title VARCHAR(70)','seo_description VARCHAR(160)','search_indexing TINYINT(1)','idx_stores_status_indexing','remove_platform_branding'])assert(migration.includes(needle),`migration missing ${needle}`);
assert(!/DROP\s+(TABLE|COLUMN)/i.test(migration),'migration contains a destructive drop');pass('Phase 7 migration is additive');

const routes=read('routes/web.php');assert(routes.indexOf("'/merchant/seo'")<routes.indexOf("'/merchant/{section}'"),'SEO route is shadowed');
for(const route of ["'/robots.txt'","'/sitemap.xml'","'/{storeSlug}/sitemap.xml'"])assert(routes.indexOf(route)<routes.lastIndexOf("'/{storeSlug}'"),`${route} is shadowed`);
pass('Phase 7 route ordering');

const router=read('app/Core/Router.php');assert(router.includes("preg_quote($route, '#')")&&router.includes('}, $pattern);'),'parameterized route literals are not escaped');pass('Parameterized route literals are escaped');
const seoController=read('app/Controllers/SeoController.php');const seoRepo=read('app/Repositories/SeoRepository.php');const layout=read('resources/views/layouts/storefront.php');const storeController=read('app/Controllers/StorefrontController.php');const product=read('resources/views/storefront/product.php');const storeRepo=read('app/Repositories/StorefrontRepository.php');
assert(seoController.includes('new TenantContext')&&!seoController.includes("input('store_id')"),'SEO accepts a client tenant identifier');assert((seoRepo.match(/search_indexing=1/g)||[]).length>=2,'sitemaps do not enforce indexing opt-out');assert(layout.includes('noindex,nofollow')&&layout.includes('X-Robots-Tag'),'noindex is not enforced');assert(seoController.includes('ENT_XML1')&&seoController.includes('application/xml'),'XML output is not safely configured');pass('Tenant-derived SEO and indexing enforcement');
for(const needle of ["'@type'=>'Product'","'@type'=>'Offer'",'priceCurrency','schema.org/InStock'])assert(storeController.includes(needle),`schema missing ${needle}`);assert(!storeController.includes('aggregateRating')&&!storeController.includes('reviewCount'),'structured data fabricates social proof');assert(layout.includes('application/ld+json')&&product.includes('itemscope itemtype="https://schema.org/Product"'),'structured data output is incomplete');pass('Product structured data without fabricated ratings');
assert(storeRepo.includes('remove_platform_branding')&&layout.includes('Powered by')&&layout.includes('marketing_url'),'plan-aware branding is incomplete');assert(product.includes('data-copy-instagram')&&product.includes('facebook.com/sharer')&&product.includes('https://wa.me/?text='),'sharing workflows are incomplete');pass('Plan-aware branding and sharing');
