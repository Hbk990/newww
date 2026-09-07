(function(){
  'use strict';
  var catalog=[],settings={},stats={},backups=[],activity=[],audit=[],orders=[],selected=new Set(),inventoryOnly=false,categoryFilter='';
  var toolsLoaded=false,activeTab='overview',activeFilter='all',renderLimit=100,listObserver=null;
  var categoryGroups=['Audio & Wearables','Mobile Accessories & Power','Gaming & Computers','Cameras, Security & Projection','Home & Personal Care','Car Electronics','Storage, Network & TV','Toys, Lifestyle & Miscellaneous','Other'];
  var search=document.getElementById('admin-search'),content=document.getElementById('admin-content'),notice=document.getElementById('notice');
  var productDialog=document.getElementById('product-dialog'),categoryDialog=document.getElementById('category-dialog'),settingsDialog=document.getElementById('settings-dialog'),operationsDialog=document.getElementById('operations-dialog');
  var productForm=document.getElementById('product-form'),categoryForm=document.getElementById('category-form'),settingsForm=document.getElementById('settings-form'),importForm=document.getElementById('import-form'),snapshots=new WeakMap();
  function esc(v){return String(v==null?'':v).replace(/[&<>'"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]})}
  function variantSource(kind){return productForm.querySelector('[name="'+({option:'options',color:'colors',flavor:'flavors'}[kind])+'"]')}
  function variantKey(kind,name){return kind+':'+String(name).trim()}
  function addVariantRow(kind,item,status,quantity){
    var rows=productForm.querySelector('[data-variant-rows="'+kind+'"]'),row=document.createElement('div'),name=item&&item.name||'',price=item&&item.price!=null?item.price:'';
    row.className='variant-row '+kind+'-row';row.dataset.variantRow=kind;
    row.innerHTML='<label><span>'+(kind==='option'?'Option name':kind==='color'?'Color':'Flavor')+'</span><input class="variant-name" maxlength="'+(kind==='flavor'?'180':'100')+'" required></label>'+(kind==='option'?'<label><span>Price</span><input class="variant-price" type="number" min="0" step="0.01" required></label>':'')+'<label><span>Availability</span><select class="variant-status"><option value="in-stock">In stock</option><option value="low-stock">Low stock</option><option value="out-of-stock">Out of stock</option></select></label><label><span>Quantity</span><input class="variant-quantity" type="number" min="0" max="999999" step="1" placeholder="Not set"></label><button type="button" class="variant-remove" aria-label="Delete variation">×</button>';
    row.querySelector('.variant-name').value=name;if(kind==='option')row.querySelector('.variant-price').value=price;row.querySelector('.variant-status').value=status||'in-stock';row.querySelector('.variant-quantity').value=quantity==null?'':quantity;row.querySelector('.variant-remove').onclick=function(){row.remove()};rows.appendChild(row);row.querySelector('.variant-name').focus();
  }
  function setupVariantEditors(){
    var quantity=document.createElement('input');quantity.type='hidden';quantity.name='variant_quantity';productForm.appendChild(quantity);
    ['option','color','flavor'].forEach(function(kind){var source=variantSource(kind),section=document.createElement('section'),title=kind==='option'?'Storage / product options':kind==='color'?'Colors':'Vape flavors',help=kind==='option'?'Set the name, price, availability and quantity for each capacity or model.':kind==='color'?'Manage every color and its available quantity.':'Manage every flavor separately without typing special codes.';section.className='variant-editor full';section.innerHTML='<div class="variant-editor-head"><div><h3>'+title+'</h3><small>'+help+'</small></div><button type="button" class="secondary" data-add-variant="'+kind+'">+ Add '+kind+'</button></div><div class="variant-rows" data-variant-rows="'+kind+'"></div>';source.after(section);section.querySelector('[data-add-variant]').onclick=function(){addVariantRow(kind,{},'in-stock','')};
    });
  }
  function populateVariantEditors(product){
    var p=product||{},stockMap=p.variant_stock||{},quantityMap=p.variant_quantity||{};
    ['option','color','flavor'].forEach(function(kind){var rows=productForm.querySelector('[data-variant-rows="'+kind+'"]');rows.innerHTML='';var items=kind==='option'?(p.options||[]):(kind==='color'?(p.colors||[]):(p.flavors||[]));items.forEach(function(item){var value=kind==='option'?item:{name:item},key=variantKey(kind,value.name);addVariantRow(kind,value,stockMap[key]||'in-stock',Object.prototype.hasOwnProperty.call(quantityMap,key)?quantityMap[key]:'')})});
  }
  function syncVariantEditors(){
    var stockLines=[],quantityLines=[];
    ['option','color','flavor'].forEach(function(kind){var values=[],seen={};productForm.querySelectorAll('[data-variant-row="'+kind+'"]').forEach(function(row){var name=row.querySelector('.variant-name').value.trim().replace(/\|/g,'-');if(!name)return;var normalized=name.toLowerCase();if(seen[normalized])throw Error('Each '+kind+' name must be unique.');seen[normalized]=true;if(kind==='option'){var price=row.querySelector('.variant-price').value;if(price==='')throw Error('Enter a price for '+name+'.');values.push(name+' | '+price)}else values.push(name);var key=variantKey(kind,name),status=row.querySelector('.variant-status').value,quantity=row.querySelector('.variant-quantity').value;if(status!=='in-stock')stockLines.push(key+' | '+status);if(quantity!=='')quantityLines.push(key+' | '+Math.max(0,parseInt(quantity,10)||0))});variantSource(kind).value=values.join('\n')});
    productForm.querySelector('[name="variant_stock"]').value=stockLines.join('\n');productForm.querySelector('[name="variant_quantity"]').value=quantityLines.join('\n');
  }
  function enhanceForms(){
    var categoryJump=document.createElement('select');categoryJump.id='admin-category-filter';categoryJump.setAttribute('aria-label','Filter dashboard by category');categoryJump.innerHTML='<option value="">All categories</option>';search.before(categoryJump);search.placeholder='Search products or categories';categoryJump.onchange=function(){categoryFilter=this.value;render();window.scrollTo({top:0,behavior:'smooth'})};
    var skuLabel=document.createElement('label');skuLabel.innerHTML='SKU / product code<input name="sku" maxlength="64" placeholder="DR-000001"><small>Unique code used in search, orders and CSV.</small>';productForm.name.closest('label').after(skuLabel);
    var original=document.createElement('input');original.type='hidden';original.name='original_slug';categoryForm.appendChild(original);
    var groupLabel=document.createElement('label');groupLabel.innerHTML='Menu group<select name="group">'+categoryGroups.map(function(g){return'<option>'+esc(g)+'</option>'}).join('')+'</select>';categoryForm.insertBefore(groupLabel,categoryForm.querySelector('.dialog-actions'));
    /* The old "Unreviewed stock" toggle is now the Unreviewed filter chip. */
    var verify=document.createElement('button');verify.type='button';verify.id='verify-stock';verify.className='secondary';verify.textContent='Mark stock reviewed';document.getElementById('bulk-bar').insertBefore(verify,document.getElementById('clear-selection'));
    var backupLink=document.createElement('a');backupLink.href='api.php?download=data-backup';backupLink.className='download-backup';backupLink.textContent='Download off-server data backup';document.querySelector('.operations-grid section:nth-child(3)').appendChild(backupLink);setupVariantEditors();
    var pictureSection=document.createElement('section');pictureSection.className='picture-import-section';pictureSection.innerHTML='<h3>Bulk product pictures</h3><p>Upload pictures after the CSV. Name the main picture exactly like the SKU (for example <b>DR-00001.jpg</b>). Use <b>DR-00001-2.jpg</b>, <b>-3</b>, and so on for gallery pictures. New uploads are resized and compressed when the server supports it.</p><form id="image-import-form" enctype="multipart/form-data"><input type="hidden" name="action" value="import_product_images"><input name="product_images[]" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple required><button type="submit">Match and upload pictures</button><button type="button" id="prune-images" class="secondary">Delete unused pictures</button></form><div id="image-import-result" class="image-import-result" aria-live="polite"></div>';
    document.querySelector('.operations-grid').insertBefore(pictureSection,document.querySelector('.operations-grid section:nth-child(2)'));
  }
  function allProducts(){return[].concat.apply([],catalog.map(function(c){return c.products.map(function(p){return Object.assign({category:c.slug,categoryName:c.name},p)})}))}
  function tell(message,error){notice.innerHTML='<div class="notice'+(error?' error':'')+'">'+esc(message)+'</div>';setTimeout(function(){notice.innerHTML=''},5000)}
  function refreshSelects(){var options=catalog.map(function(c){return'<option value="'+esc(c.slug)+'">'+esc(c.name)+'</option>'}).join('');productForm.category.innerHTML=options;document.getElementById('bulk-category').innerHTML='<option value="">Category unchanged</option>'+options;var filter=document.getElementById('admin-category-filter');if(filter){if(categoryFilter&&!catalog.some(function(c){return c.slug===categoryFilter}))categoryFilter='';filter.innerHTML='<option value="">All categories</option>'+options;filter.value=categoryFilter}}
  function money(v){if(v==null||v==='')return'Price on request';var currency=String(settings.currency||'USD').toUpperCase();try{return new Intl.NumberFormat('en-US',{style:'currency',currency:currency,minimumFractionDigits:Number.isInteger(Number(v))?0:2}).format(Number(v))}catch(e){return currency+' '+Number(v).toFixed(Number.isInteger(Number(v))?0:2)}}
  function productPrice(p){if(Array.isArray(p.options)&&p.options.length)return p.options.map(function(o){return o.name+' '+money(o.price)}).join(', ');return money(p.price)}
  function syncCurrencyLabel(){var input=productForm&&productForm.price,label=input&&input.parentElement;if(label&&label.firstChild)label.firstChild.nodeValue='Single price ('+String(settings.currency||'USD').toUpperCase()+')'}
  function renderTwoFactor(){var box=document.querySelector('.two-factor-setting');if(!box)return;if(settings.two_factor_enabled){box.innerHTML='<strong>Two-factor authentication is enabled</strong><small>'+Number(settings.recovery_codes_remaining||0)+' unused recovery codes remain.</small><button type="button" id="disable-two-factor" class="secondary">Disable two-factor authentication</button>';document.getElementById('disable-two-factor').onclick=function(){if(!settingsForm.current_password.value){tell('Enter the current admin password first.',true);return}if(!confirm('Disable two-factor authentication?'))return;var data=new FormData();data.set('action','disable_two_factor');data.set('current_password',settingsForm.current_password.value);request(data).then(function(j){consume(j);renderTwoFactor()}).catch(function(e){tell(e.message,true)})};return}box.innerHTML='<strong>Two-factor authentication is off</strong><small>Set it up with an authenticator app. Confirmation is required before it becomes active.</small><button type="button" id="begin-two-factor">Set up authenticator</button><div id="two-factor-confirm" hidden><code id="two-factor-key"></code><label>6-digit verification code<input id="two-factor-code" inputmode="numeric" maxlength="6" pattern="\\d{6}"></label><button type="button" id="confirm-two-factor">Confirm and enable</button></div>';document.getElementById('begin-two-factor').onclick=function(){if(!settingsForm.current_password.value){tell('Enter the current admin password first.',true);return}var data=new FormData();data.set('action','begin_two_factor');data.set('current_password',settingsForm.current_password.value);request(data).then(function(j){document.getElementById('two-factor-confirm').hidden=false;document.getElementById('two-factor-key').textContent='Setup key: '+j.setup_key;document.getElementById('two-factor-code').focus();tell(j.message)}).catch(function(e){tell(e.message,true)})};document.getElementById('confirm-two-factor').onclick=function(){var data=new FormData();data.set('action','confirm_two_factor');data.set('current_password',settingsForm.current_password.value);data.set('otp',document.getElementById('two-factor-code').value);request(data).then(function(j){consume(j);alert('Save these one-time recovery codes somewhere safe:\n\n'+j.recovery_codes.join('\n')+'\n\nEach code works once.');renderTwoFactor()}).catch(function(e){tell(e.message,true)})}}
  function updateBulkBar(){document.getElementById('bulk-bar').hidden=!selected.size;document.getElementById('selected-count').textContent=selected.size}

  /* ================= Overview =========================================== */

  /* Chart colours are the dataviz skill's status palette, validated against the
     dark glass surface (#232327): CVD ΔE 11.3, normal-vision 27.6, all >=3:1.
     Brand red carries the "out of stock" semantic, and every status segment is
     paired with an icon and a label so colour never carries meaning alone.
     Category magnitude is a single sequential hue - bar length already encodes
     the value, so a second colour channel would be redundant. */
  var VIZ={good:'#0ca30c',warn:'#fab219',out:'#ff0000',seq:'#3987e5',
           ink:'#ffffff',mid:'#c3c2b7',grid:'#2c2c2a',
           /* #ff0000 is 4.35:1 on the glass surface — fine for a mark, short of
              the 4.5:1 small text needs. This step is 5.31:1. */
           outText:'#ff4d4d'};

  var DAY=86400000;

  function pct(n,total){return total>0?(n/total*100):0}

  /* Part-to-whole: a horizontal stacked bar, per the form heuristic (a donut of
     three status classes is harder to read and compares angles, not lengths). */
  function stackedBar(rows,total){
    if(!total)return '<p class="viz-empty">Nothing to show yet.</p>';
    var x=0,segs=rows.filter(function(r){return r.value>0}).map(function(r){
      var w=pct(r.value,total),seg='<rect x="'+x.toFixed(3)+'%" y="0" width="'+Math.max(0,w-0.35).toFixed(3)+'%" height="34" rx="4" fill="'+r.color+'"><title>'+esc(r.label)+': '+r.value+'</title></rect>';
      x+=w;return seg;
    }).join('');
    return '<svg class="viz-stack" viewBox="0 0 100 34" preserveAspectRatio="none" role="img" aria-label="'+
      esc(rows.map(function(r){return r.label+' '+r.value}).join(', '))+'">'+segs+'</svg>'+
      '<ul class="viz-legend">'+rows.map(function(r){
        return '<li><span class="viz-dot" style="background:'+r.color+'"></span>'+
          '<span class="viz-icon" aria-hidden="true">'+r.icon+'</span>'+
          '<b>'+r.value+'</b><span>'+esc(r.label)+'</span>'+
          '<i>'+pct(r.value,total).toFixed(0)+'%</i></li>';
      }).join('')+'</ul>';
  }

  function categoryBars(){
    var rows=(stats.per_category||[]).slice().sort(function(a,b){return b.count-a.count}),
        top=rows.slice(0,10),rest=rows.slice(10),
        max=top.length?top[0].count:1;
    if(!top.length)return '<p class="viz-empty">No categories yet.</p>';

    var bars='<div class="viz-bars">'+top.map(function(r){
      var w=Math.max(1.5,r.count/max*100);
      return '<div class="viz-bar-row" data-jump-category="'+esc(r.slug)+'" tabindex="0" role="button">'+
        '<span class="viz-bar-label">'+esc(r.name)+'</span>'+
        '<span class="viz-bar-track"><span class="viz-bar-fill" style="width:'+w.toFixed(2)+'%;background:'+VIZ.seq+'"></span></span>'+
        '<b class="viz-bar-value">'+r.count+'</b></div>';
    }).join('')+'</div>';

    /* The tail is a total, not an eleventh category: drawing it as a bar on a
       scale topped by the largest single category would overflow its track and
       misrepresent the value. It gets a plain footnote row instead. */
    if(rest.length){
      var tail=rest.reduce(function(t,r){return t+r.count},0);
      bars+='<p class="viz-tail"><span>'+rest.length+' smaller categories</span><b>'+tail+'</b></p>';
    }
    return bars;
  }

  /* The overview tiles are buttons that deep-link into a product filter and count
     up from zero. A sales figure has no such filter to jump to, and a formatted
     money string cannot be counted, so these are plain read-outs. */
  function salesTile(label,value,tone){
    return '<div class="stat-tile stat-static'+(tone?' tone-'+tone:'')+'">'+
      '<span class="stat-sheen" aria-hidden="true"></span>'+
      '<span class="stat-inner">'+
        '<b class="stat-value">'+esc(String(value))+'</b>'+
        '<span class="stat-label">'+esc(label)+'</span>'+
      '</span></div>';
  }

  function statTile(key,label,value,tone){
    return '<button type="button" class="stat-tile'+(tone?' tone-'+tone:'')+'" data-stat="'+key+'">'+
      '<span class="stat-sheen" aria-hidden="true"></span>'+
      '<span class="stat-inner">'+
        '<b class="stat-value" data-count-to="'+value+'">0</b>'+
        '<span class="stat-label">'+esc(label)+'</span>'+
      '</span></button>';
  }

  function renderOverview(){
    var s=stats,total=s.products||0;
    var health=[
      {label:'In stock',value:s.in_stock||0,color:VIZ.good,icon:'●'},
      {label:'Low stock',value:s.low||0,color:VIZ.warn,icon:'▲'},
      {label:'Out of stock',value:s.out||0,color:VIZ.out,icon:'■'}
    ];
    var visibility=[
      {label:'Published',value:s.published||0,color:VIZ.good,icon:'●'},
      {label:'Draft',value:s.draft||0,color:VIZ.warn,icon:'▲'},
      {label:'Hidden',value:s.hidden||0,color:VIZ.out,icon:'■'}
    ];

    document.getElementById('admin-overview').innerHTML=
      '<div class="stat-grid">'+
        statTile('all','Products',total)+
        statTile('all','Categories',s.categories||0)+
        // A zero count is good news, so it is not painted as a warning.
        statTile('low','Low stock',s.low||0,s.low?'warn':'')+
        statTile('out','Out of stock',s.out||0,s.out?'out':'')+
        statTile('unreviewed','Stock unreviewed',s.unreviewed||0,s.unreviewed?'warn':'')+
        statTile('noimage','Missing images',s.no_image||0,s.no_image?'warn':'')+
      '</div>'+
      '<div class="panel-grid">'+
        '<section class="glass-panel"><h2>Inventory health</h2>'+
          '<p class="panel-note">Every published and unpublished product by stock state.</p>'+
          stackedBar(health,total)+'</section>'+
        '<section class="glass-panel"><h2>Visibility</h2>'+
          '<p class="panel-note">What customers can actually see.</p>'+
          stackedBar(visibility,total)+'</section>'+
        '<section class="glass-panel span-2"><h2>Biggest categories</h2>'+
          '<p class="panel-note">Top 10 by product count. Select one to open it.</p>'+
          categoryBars()+'</section>'+
        '<section class="glass-panel span-2" id="overview-tools">'+
          '<h2>Recent activity</h2><div id="overview-activity" class="tool-list"><p class="viz-empty">Loading…</p></div></section>'+
      '</div>';

    runCounters(document.getElementById('admin-overview'));
    bindTilt();
    renderOverviewTools();
  }

  function renderOverviewTools(){
    var box=document.getElementById('overview-activity');
    if(!box)return;
    box.innerHTML=activity.slice(0,8).map(function(a){
      return '<div><strong>'+esc(a.action)+'</strong><span>'+new Date(a.time).toLocaleString()+
        (a.detail?' · '+esc(a.detail):'')+'</span></div>';
    }).join('')||'<p class="viz-empty">No activity recorded yet.</p>';
  }

  /* Count-up, mirroring the storefront's hero stats. */
  function runCounters(root){
    var off=document.documentElement.getAttribute('data-motion')==='off';
    Array.prototype.forEach.call((root||document).querySelectorAll('[data-count-to]'),function(el){
      var target=Number(el.dataset.countTo)||0;
      if(off){el.textContent=target;return}
      var start=null;
      function tick(now){
        if(start===null)start=now;
        var t=Math.min(1,(now-start)/900);
        el.textContent=Math.round(target*(1-Math.pow(1-t,3)));
        if(t<1)requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  /* Pointer-tracked 3D tilt. Overview only - the product list stays transform-free
     so 1157 rows keep scrolling at full speed. Gated to fine pointers and to a
     motion tier that is not "off". */
  function bindTilt(){
    if(document.documentElement.getAttribute('data-motion')==='off')return;
    if(!window.matchMedia||!window.matchMedia('(hover: hover) and (pointer: fine)').matches)return;
    Array.prototype.forEach.call(document.querySelectorAll('.stat-tile'),function(tile){
      tile.addEventListener('pointermove',function(e){
        var r=tile.getBoundingClientRect(),
            px=(e.clientX-r.left)/r.width,py=(e.clientY-r.top)/r.height;
        tile.style.setProperty('--rx',((0.5-py)*8).toFixed(2)+'deg');
        tile.style.setProperty('--ry',((px-0.5)*8).toFixed(2)+'deg');
        tile.style.setProperty('--mx',(px*100).toFixed(1)+'%');
        tile.style.setProperty('--my',(py*100).toFixed(1)+'%');
      });
      tile.addEventListener('pointerleave',function(){
        tile.style.setProperty('--rx','0deg');tile.style.setProperty('--ry','0deg');
      });
    });
  }

  /* ---- filtering ------------------------------------------------------- */

  var FILTERS={
    all:{label:'All',test:function(){return true}},
    low:{label:'Low stock',test:function(p){return p.stock==='low-stock'||(Number(p.stock_quantity)>0&&Number(p.stock_quantity)<=5)}},
    out:{label:'Out of stock',test:function(p){return p.stock==='out-of-stock'}},
    unreviewed:{label:'Unreviewed',test:function(p){return !p.stock_updated_at}},
    noimage:{label:'No image',test:function(p){return !p.image}},
    hidden:{label:'Draft / hidden',test:function(p){return (p.visibility||'published')!=='published'}}
  };

  function filterCounts(){
    var products=allProducts(),counts={};
    Object.keys(FILTERS).forEach(function(key){counts[key]=products.filter(FILTERS[key].test).length});
    return counts;
  }

  /* Products matching the search box, the category filter and the active chip. */
  function visibleProducts(){
    var q=search.value.trim().toLowerCase(),test=(FILTERS[activeFilter]||FILTERS.all).test,groups=[];
    catalog.forEach(function(c){
      if(categoryFilter&&c.slug!==categoryFilter)return;
      var categoryMatches=!!q&&[c.name,c.group,c.slug].join(' ').toLowerCase().indexOf(q)>=0;
      var matches=c.products.filter(function(p){
        if(!test(p))return false;
        if(!q||categoryMatches)return true;
        return [p.sku,p.name,p.brand,(p.colors||[]).join(' '),(p.flavors||[]).join(' '),p.type].join(' ').toLowerCase().indexOf(q)>=0;
      });
      if(matches.length)groups.push({category:c,products:matches});
    });
    return groups;
  }

  function setFilter(key){activeFilter=FILTERS[key]?key:'all';inventoryOnly=activeFilter==='unreviewed';renderLimit=100;render()}



  /* ---- order log + product ordering ------------------------------------- */

  /* ================= Sales: what the order log can actually tell you ========
   * The log records reference, time, line items, quantities and totals — no
   * customer data — so everything below is derived from those four things.
   * Orders whose products have since been deleted still count towards revenue;
   * they simply cannot be attributed to a category. */

  function ordersInWindow(days){
    if(!days)return orders.slice();
    var cut=Date.now()-days*DAY;
    return orders.filter(function(o){var t=Date.parse(o.time);return isFinite(t)&&t>=cut});
  }

  /* Only confirmed orders are counted. An order is recorded the moment the
     customer taps WhatsApp, before the message exists, so an unconfirmed row is
     an intention, not a sale — counting it would inflate revenue and overstate
     how fast stock is moving. Nothing is hidden: renderSales() shows what the
     unconfirmed rows are worth right next to the figures. */
  function countable(rows){return rows.filter(function(o){return statusOf(o)==='confirmed'})}

  /* Product lookup by recorded id first (exact), then SKU, then name. Orders
     written before the id was recorded only carry the SKU. */
  function productIndex(){
    var byId={},bySku={},byName={};
    allProducts().forEach(function(p){
      byId[String(p.id)]=p;
      if(p.sku)bySku[String(p.sku).toLowerCase()]=p;
      if(p.name)byName[String(p.name).toLowerCase()]=p;
    });
    return function(item){
      return byId[String(item.id||'')]||
             bySku[String(item.sku||'').toLowerCase()]||
             byName[String(item.name||'').toLowerCase()]||null;
    };
  }

  function salesSummary(rows){
    var pieces=0,revenue=0,lines=0;
    rows.forEach(function(o){
      pieces+=Number(o.pieces)||0;
      revenue+=Number(o.total)||0;
      lines+=(o.items||[]).length;
    });
    return {orders:rows.length,pieces:pieces,revenue:revenue,lines:lines,
            average:rows.length?revenue/rows.length:0};
  }

  /* Daily revenue across the whole window, including days with no orders — a
     line drawn only through the days that happened would imply a steady trade
     that the gaps contradict. */
  function dailySeries(rows,days){
    if(!rows.length)return [];
    var stamps=rows.map(function(o){return Date.parse(o.time)}).filter(isFinite);
    if(!stamps.length)return [];
    var end=new Date(); end.setHours(0,0,0,0);
    var earliest=new Date(Math.min.apply(null,stamps)); earliest.setHours(0,0,0,0);
    var start=days?new Date(Math.max(earliest.getTime(),end.getTime()-(days-1)*DAY)):earliest;
    var buckets={},cursor=new Date(start),series=[];
    rows.forEach(function(o){
      var t=Date.parse(o.time); if(!isFinite(t))return;
      var d=new Date(t); d.setHours(0,0,0,0);
      var key=d.getTime();
      if(!buckets[key])buckets[key]={total:0,orders:0};
      buckets[key].total+=Number(o.total)||0;
      buckets[key].orders++;
    });
    while(cursor.getTime()<=end.getTime()){
      var key=cursor.getTime(),b=buckets[key]||{total:0,orders:0};
      series.push({time:key,total:b.total,orders:b.orders});
      cursor=new Date(key+DAY);
      if(series.length>400)break;                 // guard against a bad clock
    }
    return series;
  }

  function topProducts(rows,lookup){
    var map={};
    rows.forEach(function(o){
      (o.items||[]).forEach(function(i){
        var p=lookup(i),key=p?'id:'+p.id:'name:'+String(i.name||'').toLowerCase();
        if(!map[key])map[key]={name:(p&&p.name)||i.name||'Unknown',pieces:0,revenue:0,slug:p?p.category:''};
        map[key].pieces+=Number(i.quantity)||0;
        map[key].revenue+=Number(i.line_total)||0;
      });
    });
    return Object.keys(map).map(function(k){return map[k]})
      .sort(function(a,b){return b.pieces-a.pieces});
  }

  function topCategories(rows,lookup){
    var map={};
    rows.forEach(function(o){
      (o.items||[]).forEach(function(i){
        var p=lookup(i),name=p?p.categoryName:'No longer in the catalog';
        if(!map[name])map[name]={name:name,revenue:0,pieces:0};
        map[name].revenue+=Number(i.line_total)||0;
        map[name].pieces+=Number(i.quantity)||0;
      });
    });
    return Object.keys(map).map(function(k){return map[k]})
      .sort(function(a,b){return b.revenue-a.revenue});
  }

  /* Days of cover = stock on hand / pieces sold per day over the window. Only
     products that actually sold in the window can be rated; the rest have no
     rate to divide by and are left out rather than shown as "infinite". */
  function restockRows(rows,lookup,windowDays){
    var map={};
    rows.forEach(function(o){
      (o.items||[]).forEach(function(i){
        var p=lookup(i); if(!p)return;
        var key=String(p.id);
        if(!map[key])map[key]={product:p,pieces:0,orders:0};
        map[key].pieces+=Number(i.quantity)||0;
        map[key].orders++;
      });
    });
    return Object.keys(map).map(function(k){
      var r=map[k],p=r.product,
          stock=Number(p.stock_quantity)||0,
          rate=r.pieces/Math.max(1,windowDays),
          state,cover;
      /* A stock_quantity of 0 means one of two very different things: genuinely
         none left, or never counted. The catalog's own status says which. Calling
         an uncounted product "out of stock" would flag most of the catalog and
         make the report worthless, so those are set aside as unrateable — the
         useful thing to tell the owner is which sellers still need a count. */
      if((p.stock||'in-stock')==='out-of-stock'){state='out';cover=0}
      else if(stock<=0){state='untracked';cover=Infinity}
      else{
        cover=rate>0?stock/rate:Infinity;
        state=cover<7?'out':(cover<21?'warn':'good');
      }
      return {product:p,name:p.name,category:p.categoryName,stock:stock,tracked:stock>0,
              pieces:r.pieces,rate:rate,cover:cover,state:state};
    }).sort(function(a,b){return a.cover-b.cover});
  }

  /* One column per day, not a line. Two reasons: a day's takings are a discrete
     magnitude rather than a continuous signal, and with quiet days at zero a line
     dives to the axis and back, which reads as volatility the trade did not have.
     Columns also survive preserveAspectRatio="none" — a stretched rectangle is
     still a rectangle, where a stretched circle becomes an ellipse.
     Single series, so no legend: the panel title names it. */
  function revenueChart(series){
    if(series.length<2)return '<p class="viz-empty">At least two days of orders are needed to draw a trend.</p>';
    var W=100,H=40,pad=1.5,
        max=Math.max.apply(null,series.map(function(d){return d.total})),
        top=max>0?max:1,
        slot=(W-pad*2)/series.length,
        gap=Math.min(slot*0.3,0.5),                 // a surface gap between columns
        width=Math.max(0.2,slot-gap);

    var peak=0; series.forEach(function(d,i){if(d.total>series[peak].total)peak=i});

    var cols=series.map(function(d,i){
      var h=d.total>0?Math.max(0.4,(H-pad*2)*(d.total/top)):0,
          x=pad+i*slot,
          fill=(i===peak||i===series.length-1)?VIZ.ink:VIZ.seq;
      var title='<title>'+esc(new Date(d.time).toLocaleDateString())+': '+
        (d.total>0?esc(money(d.total))+' · '+d.orders+(d.orders===1?' order':' orders'):'no orders')+'</title>';
      if(!h)return '<rect x="'+x.toFixed(3)+'" y="'+(H-pad-0.25)+'" width="'+width.toFixed(3)+'" height="0.25"'+
        ' fill="'+VIZ.grid+'">'+title+'</rect>';
      return '<rect x="'+x.toFixed(3)+'" y="'+(H-pad-h).toFixed(3)+'" width="'+width.toFixed(3)+
        '" height="'+h.toFixed(3)+'" fill="'+fill+'">'+title+'</rect>';
    }).join('');

    return '<svg class="viz-line" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" role="img"'+
        ' aria-label="Order value per day from '+esc(new Date(series[0].time).toLocaleDateString())+
        ' to '+esc(new Date(series[series.length-1].time).toLocaleDateString())+', peak '+esc(money(series[peak].total))+'">'+
      '<line x1="0" y1="'+(H-pad)+'" x2="'+W+'" y2="'+(H-pad)+'" stroke="'+VIZ.grid+'" stroke-width="0.5"'+
        ' vector-effect="non-scaling-stroke"/>'+
      cols+
    '</svg>'+
    '<div class="viz-axis"><span>'+esc(new Date(series[0].time).toLocaleDateString())+'</span>'+
      '<span>peak '+esc(money(series[peak].total))+'</span>'+
      '<span>'+esc(new Date(series[series.length-1].time).toLocaleDateString())+'</span></div>';
  }

  function magnitudeBars(rows,valueOf,labelOf,formatOf,tailLabel){
    if(!rows.length)return '<p class="viz-empty">Nothing ordered yet.</p>';
    var top=rows.slice(0,10),rest=rows.slice(10),
        max=valueOf(top[0])||1;
    var bars='<div class="viz-bars">'+top.map(function(r){
      var w=Math.max(1.5,valueOf(r)/max*100);
      return '<div class="viz-bar-row">'+
        '<span class="viz-bar-label" title="'+esc(labelOf(r))+'">'+esc(labelOf(r))+'</span>'+
        '<span class="viz-bar-track"><span class="viz-bar-fill" style="width:'+w.toFixed(2)+'%;background:'+VIZ.seq+'"></span></span>'+
        '<b class="viz-bar-value">'+esc(formatOf(r))+'</b></div>';
    }).join('')+'</div>';
    if(rest.length){
      var tail=rest.reduce(function(t,r){return t+valueOf(r)},0);
      bars+='<p class="viz-tail"><span>'+rest.length+' '+esc(tailLabel)+'</span><b>'+esc(formatOf({__tail:tail}))+'</b></p>';
    }
    return bars;
  }

  var salesWindow=30;

  function renderSales(){
    var box=document.getElementById('admin-sales');
    if(!box)return;
    if(!toolsLoaded){
      box.innerHTML='<section class="glass-panel span-2"><p class="viz-empty">Loading orders…</p></section>';
      ensureTools().then(function(){if(activeTab==='sales')renderSales()});
      return;
    }

    var windowRows=ordersInWindow(salesWindow),
        rows=countable(windowRows),
        pendingRows=windowRows.filter(function(o){return statusOf(o)==='unconfirmed'}),
        pendingValue=pendingRows.reduce(function(t,o){return t+(Number(o.total)||0)},0),
        lookup=productIndex(),
        sum=salesSummary(rows),
        series=dailySeries(rows,salesWindow),
        windowDays=Math.max(1,series.length),
        ranges=[[7,'7 days'],[30,'30 days'],[90,'90 days'],[0,'All time']];

    var picker='<div class="range-picker" role="group" aria-label="Time range">'+ranges.map(function(r){
      return '<button type="button" data-sales-range="'+r[0]+'" class="'+(salesWindow===r[0]?'active':'')+'"'+
        ' aria-pressed="'+(salesWindow===r[0])+'">'+esc(r[1])+'</button>';
    }).join('')+'</div>';

    if(!orders.length){
      box.innerHTML='<div class="sales-head"><div><h2>Sales</h2>'+
        '<p class="panel-note">Orders appear here once a customer sends one from the catalog.</p></div></div>'+
        '<section class="glass-panel span-2"><p class="viz-empty">No orders recorded yet. '+
        'Nothing is stored until a customer taps WhatsApp on their cart.</p></section>';
      return;
    }

    var products=topProducts(rows,lookup),
        categories=topCategories(rows,lookup),
        restock=restockRows(rows,lookup,windowDays);

    box.innerHTML=
      '<div class="sales-head"><div><h2>Sales</h2>'+
        '<p class="panel-note">From the order log — references, items and totals. No customer details are stored.</p></div>'+
        picker+'</div>'+

      (pendingRows.length
        ? '<button type="button" class="sales-pending" data-sales-pending>'+
            '<b>'+pendingRows.length+'</b> '+(pendingRows.length===1?'order is':'orders are')+
            ' waiting to be confirmed, worth '+esc(money(Math.round(pendingValue*100)/100))+
            '. They are not counted below. <i>Review them</i>'+
          '</button>'
        : '')+

      '<div class="stat-grid">'+
        salesTile('Orders',sum.orders)+
        salesTile('Pieces',sum.pieces)+
        salesTile('Revenue',money(Math.round(sum.revenue*100)/100))+
        salesTile('Average order',money(Math.round(sum.average*100)/100))+
      '</div>'+

      '<div class="panel-grid">'+
        '<section class="glass-panel span-2"><h2>Order value per day</h2>'+
          '<p class="panel-note">'+windowDays+' days · '+sum.orders+(sum.orders===1?' order':' orders')+'</p>'+
          revenueChart(series)+'</section>'+

        '<section class="glass-panel"><h2>Most ordered products</h2>'+
          '<p class="panel-note">By pieces ordered</p>'+
          magnitudeBars(products,function(r){return r.__tail!==undefined?r.__tail:r.pieces},
            function(r){return r.name},
            function(r){return String(r.__tail!==undefined?r.__tail:r.pieces)},
            'other products')+'</section>'+

        '<section class="glass-panel"><h2>Categories by revenue</h2>'+
          '<p class="panel-note">Share of the money taken</p>'+
          magnitudeBars(categories,function(r){return r.__tail!==undefined?r.__tail:r.revenue},
            function(r){return r.name},
            function(r){return money(Math.round((r.__tail!==undefined?r.__tail:r.revenue)*100)/100)},
            'other categories')+'</section>'+

        '<section class="glass-panel span-2"><h2>What to reorder</h2>'+
          '<p class="panel-note">Stock on hand against how fast it actually sold over these '+windowDays+
            ' days. Products that did not sell in this period have no rate to measure and are not listed.</p>'+
          restockList(restock)+'</section>'+
      '</div>';
  }

  function coverLabel(r){
    if(r.state==='out')return 'Out of stock';
    if(r.state==='untracked')return 'No stock count';
    if(!isFinite(r.cover))return 'No recent sales';
    if(r.cover<1)return 'Under a day left';
    return Math.round(r.cover)+(Math.round(r.cover)===1?' day left':' days left');
  }

  function restockRow(r){
    var glyph=r.state==='out'?'▲':r.state==='warn'?'●':r.state==='untracked'?'?':'✓';
    return '<div class="restock-row state-'+r.state+'">'+
      '<span class="restock-flag" aria-hidden="true">'+glyph+'</span>'+
      '<span class="restock-main"><b>'+esc(r.name)+'</b><span>'+esc(r.category||'')+'</span></span>'+
      '<span class="restock-nums">'+
        '<span><i>'+(r.tracked?r.stock:'—')+'</i> in stock</span>'+
        '<span><i>'+r.pieces+'</i> sold</span>'+
        '<span><i>'+(r.rate<10?r.rate.toFixed(1):Math.round(r.rate))+'</i> a day</span>'+
      '</span>'+
      '<span class="restock-cover">'+esc(coverLabel(r))+'</span>'+
    '</div>';
  }

  function restockList(rows){
    if(!rows.length)return '<p class="viz-empty">Nothing sold in this period, so there is no rate to measure.</p>';

    var urgent=rows.filter(function(r){return r.state==='out'||r.state==='warn'}),
        untracked=rows.filter(function(r){return r.state==='untracked'}),
        fine=rows.length-urgent.length-untracked.length,
        html='';

    html+=urgent.length
      ? '<p class="restock-lead"><b>'+urgent.length+'</b> '+(urgent.length===1?'product is':'products are')+
        ' out or down to under three weeks of cover.</p>'+
        '<div class="restock-list">'+urgent.slice(0,12).map(restockRow).join('')+'</div>'
      : '<p class="restock-lead restock-ok">Nothing with a stock count is running short.</p>';

    /* Most of this catalog carries a stock status but no exact quantity, so
       these cannot be given a reorder date. Naming the best sellers among them
       is the actionable part: count those first. */
    if(untracked.length){
      var worth=untracked.slice().sort(function(a,b){return b.pieces-a.pieces}).slice(0,6);
      html+='<p class="restock-lead restock-untracked">'+
        '<b>'+untracked.length+'</b> '+(untracked.length===1?'product sold but has':'products sold but have')+
        ' no stock quantity recorded, so they cannot be given a reorder date. '+
        'Your best sellers among them are worth counting first.</p>'+
        '<div class="restock-list">'+worth.map(restockRow).join('')+'</div>';
    }

    if(fine>0)html+='<p class="viz-tail"><span>'+fine+' other '+(fine===1?'product has':'products have')+
      ' over three weeks of cover</span><b>OK</b></p>';
    return html;
  }

  /* Records written before confirmation existed carry no status. They are read
     as confirmed, matching order_status() on the server, so installing this
     version does not blank the shop's sales history. */
  function statusOf(o){
    var s=String((o&&o.status)||'');
    return (s==='unconfirmed'||s==='confirmed'||s==='cancelled')?s:'confirmed';
  }
  var STATUS_LABEL={unconfirmed:'Unconfirmed',confirmed:'Confirmed',cancelled:'Cancelled'};
  var orderStatusFilter='';

  function renderOrders(){
    var box=document.getElementById('orders-list');
    if(!box)return;
    var q=(document.getElementById('orders-search')||{}).value||'';
    var needle=q.trim().toLowerCase();
    var rows=orders.filter(function(o){
      if(orderStatusFilter&&statusOf(o)!==orderStatusFilter)return false;
      if(!needle)return true;
      return String(o.reference||'').toLowerCase().indexOf(needle)>=0;
    });
    var summary=document.getElementById('orders-summary');
    if(summary){
      var pending=orders.filter(function(o){return statusOf(o)==='unconfirmed'}).length;
      summary.textContent=orders.length
        ? orders.length+' orders recorded'+(pending?' · '+pending+' unconfirmed':'')+
          ((needle||orderStatusFilter)?' · '+rows.length+' shown':'')
        : 'No orders recorded yet. Orders appear here when a customer sends one on WhatsApp.';
    }
    box.innerHTML=rows.slice(0,40).map(function(o){
      var st=statusOf(o);
      return '<div class="order-row status-'+st+'"><div><strong>'+esc(o.reference)+
        ' <span class="order-status">'+esc(STATUS_LABEL[st])+'</span></strong>'+
        '<span>'+new Date(o.time).toLocaleString()+' · '+o.item_count+' items · '+o.pieces+' pieces</span></div>'+
        '<b>'+esc(o.currency||'USD')+' '+Number(o.total||0).toFixed(2)+'</b>'+
        (st==='confirmed'?'':'<button type="button" class="order-mark confirm" data-order-status="confirmed" data-reference="'+esc(o.reference)+'">Confirm</button>')+
        (st==='cancelled'
          ? '<button type="button" class="order-mark" data-order-status="unconfirmed" data-reference="'+esc(o.reference)+'">Restore</button>'
          : '<button type="button" class="order-mark cancel" data-order-status="cancelled" data-reference="'+esc(o.reference)+'">Cancel</button>')+
        '<button type="button" class="order-open" data-order-detail="'+esc(o.reference)+'">Items</button>'+
        '<button type="button" class="order-del" data-order-delete="'+esc(o.reference)+'" aria-label="Delete order permanently">×</button>'+
        '<div class="order-items" hidden>'+o.items.map(function(i){
          var variant=[i.option,i.color,i.flavor].filter(Boolean).join(' · ');
          return '<span>'+esc(i.sku||'')+' '+esc(i.name)+(variant?' ('+esc(variant)+')':'')+
            ' × '+i.quantity+' — '+Number(i.line_total).toFixed(2)+'</span>';
        }).join('')+'</div></div>';
    }).join('')||'<p class="viz-empty">'+(needle?'No order matches that reference.':'Nothing yet.')+'</p>';
  }

  function exportOrdersCsv(){
    var rows=[['reference','time','currency','total','sku','name','option','color','flavor','quantity','unit_price','line_total']];
    orders.forEach(function(o){
      o.items.forEach(function(i){
        rows.push([o.reference,o.time,o.currency||'USD',o.total,i.sku,i.name,i.option,i.color,i.flavor,i.quantity,i.unit_price,i.line_total]);
      });
    });
    var csv=rows.map(function(r){return r.map(function(v){return '"'+String(v==null?'':v).replace(/"/g,'""')+'"'}).join(',')}).join('\r\n');
    var url=URL.createObjectURL(new Blob(['﻿'+csv],{type:'text/csv'}));
    var a=document.createElement('a');a.href=url;a.download='DR-PHONE-orders-'+new Date().toISOString().slice(0,10)+'.csv';
    document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url)},1000);
  }

  /* Moves one product within its category. Sends the whole ordered list so the
     server can verify nothing was added or dropped by a stale tab. */
  function moveProduct(id,direction){
    var category=null;
    catalog.some(function(c){return c.products.some(function(p){if(Number(p.id)===Number(id)){category=c;return true}return false})});
    if(!category)return;
    var ids=category.products.map(function(p){return Number(p.id)}),
        from=ids.indexOf(Number(id)),
        to=from+(direction==='up'?-1:1);
    if(from<0||to<0||to>=ids.length)return;
    ids.splice(to,0,ids.splice(from,1)[0]);
    var data=new FormData();
    data.set('action','set_product_order');
    data.set('slug',category.slug);
    data.set('ids',ids.join(','));
    request(data).then(function(j){consume(j)}).catch(function(e){tell(e.message,true)});
  }

  /* ---- inline price / stock editing ------------------------------------ */

  /* Products whose prices live on their options have no single price to edit
     inline - editing one here would be ambiguous, so the cell says so and links
     to the full dialog instead. */
  function quickEditCell(p){
    var hasOptions=Array.isArray(p.options)&&p.options.length,
        price=p.price==null?'':p.price;
    return '<div class="quick-edit" data-quick="'+p.id+'">'+
      (hasOptions
        ? '<span class="quick-multi">'+p.options.length+' option prices</span>'
        : '<label class="quick-field"><span>Price</span>'+
          '<input class="quick-input" type="text" inputmode="decimal" data-quick-price value="'+esc(price)+'" aria-label="Price for '+esc(p.name)+'"></label>')+
      '<label class="quick-field"><span>Qty</span>'+
        '<input class="quick-input" type="text" inputmode="numeric" data-quick-stock value="'+esc(Number(p.stock_quantity||0))+'" aria-label="Stock quantity for '+esc(p.name)+'"></label>'+
      '<select class="quick-select" data-quick-status aria-label="Stock status for '+esc(p.name)+'">'+
        ['in-stock','low-stock','out-of-stock'].map(function(v){
          return '<option value="'+v+'"'+((p.stock||'in-stock')===v?' selected':'')+'>'+v.replace(/-/g,' ')+'</option>';
        }).join('')+'</select>'+
    '</div>';
  }

  function findProductById(id){
    var found=null;
    catalog.some(function(c){return c.products.some(function(p){if(Number(p.id)===Number(id)){found=p;return true}return false})});
    return found;
  }

  /* Commits one row's inline edits. Deliberately NOT save_product: that action
     rebuilds a product from the whole POST and would wipe options, colors,
     flavors and images that this row never sends. */
  function commitQuickEdit(cell){
    var id=Number(cell.dataset.quick),product=findProductById(id);
    if(!product)return;
    var priceInput=cell.querySelector('[data-quick-price]'),
        stockInput=cell.querySelector('[data-quick-stock]'),
        statusSelect=cell.querySelector('[data-quick-status]');
    var payload=new FormData();
    payload.set('action','quick_update');
    payload.set('id',String(id));
    if(priceInput)payload.set('price',priceInput.value.trim());
    payload.set('stock_quantity',String(Math.max(0,parseInt(stockInput.value,10)||0)));
    payload.set('stock',statusSelect.value);

    // Nothing actually changed - don't spend a request or a catalog backup.
    var unchanged=(!priceInput||String(product.price==null?'':product.price)===priceInput.value.trim())&&
      Number(product.stock_quantity||0)===Math.max(0,parseInt(stockInput.value,10)||0)&&
      (product.stock||'in-stock')===statusSelect.value;
    if(unchanged)return;

    cell.classList.add('is-saving');
    request(payload).then(function(j){
      cell.classList.remove('is-saving');
      cell.classList.add('is-saved');
      setTimeout(function(){cell.classList.remove('is-saved')},1200);
      if(j.product){
        // Patch in place: a full re-render here would fight the person still typing.
        var target=findProductById(id);
        if(target){target.price=j.product.price;target.stock=j.product.stock;target.stock_quantity=j.product.stock_quantity;target.stock_updated_at=j.product.stock_updated_at}
        if(stockInput)stockInput.value=String(Number(j.product.stock_quantity||0));
        if(priceInput)priceInput.value=j.product.price==null?'':String(j.product.price);
      }
      if(j.stats)stats=j.stats;
    }).catch(function(e){
      cell.classList.remove('is-saving');
      cell.classList.add('is-error');
      setTimeout(function(){cell.classList.remove('is-error')},2000);
      tell(e.message,true);
    });
  }

  function bindQuickEdit(){
    var coarse=window.matchMedia&&window.matchMedia('(pointer: coarse)').matches;
    content.addEventListener('focusin',function(e){
      var input=e.target.closest&&e.target.closest('.quick-input');
      if(!input)return;
      try{input.select()}catch(err){}
      /* The phone keyboard hides the bottom of the screen. A price or stock
         box on a lower row would sit behind it while you type. */
      if(coarse)setTimeout(function(){
        var row=input.closest('.admin-product')||input;
        try{row.scrollIntoView({block:'center',behavior:'smooth'})}catch(err){}
      },180);
    });
    content.addEventListener('focusout',function(e){
      var cell=e.target.closest&&e.target.closest('.quick-edit');
      if(cell&&(e.target.matches('[data-quick-price]')||e.target.matches('[data-quick-stock]')))commitQuickEdit(cell);
    });
    content.addEventListener('change',function(e){
      var cell=e.target.closest&&e.target.closest('.quick-edit');
      if(cell&&e.target.matches('[data-quick-status]'))commitQuickEdit(cell);
    });
    content.addEventListener('keydown',function(e){
      if(e.key!=='Enter')return;
      var input=e.target.closest&&e.target.closest('.quick-input');
      if(input){e.preventDefault();input.blur()}
    });
  }

  /* ---- product rows ---------------------------------------------------- */

  function productRow(p){
    var visibility=p.visibility||'published',
        review=p.stock_updated_at?'Reviewed '+new Date(p.stock_updated_at).toLocaleDateString():'Stock not reviewed';
    return '<article class="admin-product" data-id="'+p.id+'">'+
      // Wrapped in a label so the tap area is the full grid cell, not the 16px
      // box: Chrome ignores an author border on a native checkbox, so the hit
      // area cannot be grown on the input itself.
      '<label class="row-check-tap"><input class="row-check" type="checkbox" data-select="'+p.id+'" aria-label="Select '+esc(p.name)+'"'+(selected.has(Number(p.id))?' checked':'')+'></label>'+
      // width/height + lazy: without these the browser eagerly fetched every one of
      // the catalog's product images (15.6 MB) on each dashboard load.
      (p.image
        ? '<img src="../'+esc(p.image)+'" alt="" loading="lazy" decoding="async" width="58" height="58">'
        : '<div class="admin-image-placeholder">No image</div>')+
      '<div class="admin-product-body">'+
        '<h3>'+esc(p.name)+'</h3>'+
        '<p><b>'+esc(p.sku||('DR-'+p.id))+'</b> · '+esc(p.brand||'No brand')+
          ' <span class="stock-pill '+esc(p.stock||'in-stock')+'">'+esc((p.stock||'in-stock').replace(/-/g,' '))+'</span>'+
          ' <span class="visibility-pill '+visibility+'">'+esc(visibility)+'</span></p>'+
        '<p>'+(p.colors||[]).length+' colors'+((p.flavors||[]).length?' · '+p.flavors.length+' flavors':'')+
          ' · <span class="review-state '+(p.stock_updated_at?'verified':'')+'">'+esc(review)+'</span></p>'+
      '</div>'+
      quickEditCell(p)+
      '<div class="admin-actions">'+
        '<button type="button" class="row-move" data-move="up" data-id="'+p.id+'" aria-label="Move up">↑</button>'+
        '<button type="button" class="row-move" data-move="down" data-id="'+p.id+'" aria-label="Move down">↓</button>'+
        '<button type="button" class="edit secondary">Edit</button>'+
        '<button type="button" class="delete">Remove</button>'+
      '</div></article>';
  }

  function renderProducts(){
    var groups=visibleProducts(),counts=filterCounts(),total=groups.reduce(function(t,g){return t+g.products.length},0);
    document.getElementById('summary').textContent=
      (stats.products||allProducts().length)+' products · '+(stats.categories||catalog.length)+' categories · '+
      (stats.low||0)+' low · '+(stats.out||0)+' out · '+(stats.unreviewed||0)+' stock unreviewed';

    var chips='<div class="filter-chips" role="tablist" aria-label="Filter products">'+Object.keys(FILTERS).map(function(key){
      return '<button type="button" class="chip'+(activeFilter===key?' active':'')+'" data-filter="'+key+'" role="tab" aria-selected="'+(activeFilter===key)+'">'+
        esc(FILTERS[key].label)+'<b>'+counts[key]+'</b></button>';
    }).join('')+'</div>';

    // Only the first `renderLimit` rows are built; a sentinel appends the next
    // batch as it scrolls into view, so one filter change never lays out 1157 rows.
    var shown=0,truncated=false,body='';
    body=groups.map(function(g){
      if(shown>=renderLimit){truncated=true;return''}
      var slice=g.products.slice(0,Math.max(0,renderLimit-shown));
      if(slice.length<g.products.length)truncated=true;
      shown+=slice.length;
      var c=g.category;
      // The box has to reflect the selection, or render() rebuilds it unchecked
      // and the next click selects the category again instead of clearing it.
      var picked=g.products.filter(function(p){return selected.has(Number(p.id))}).length,
          allPicked=g.products.length>0&&picked===g.products.length;
      return '<section class="category-section" data-category="'+esc(c.slug)+'">'+
        '<h2><label class="select-category"><input type="checkbox" data-select-category="'+esc(c.slug)+'"'+(allPicked?' checked':'')+
          (picked&&!allPicked?' data-partial':'')+'> '+esc(c.name)+'</label>'+
        '<span>'+esc(c.group||'Other')+' · '+g.products.length+' items</span>'+
        '<span class="category-tools">'+
          '<button type="button" data-category-edit="'+esc(c.slug)+'">Edit</button>'+
          '<button type="button" data-category-order="up" data-category="'+esc(c.slug)+'">↑</button>'+
          '<button type="button" data-category-order="down" data-category="'+esc(c.slug)+'">↓</button>'+
          '<button type="button" class="danger" data-category-delete="'+esc(c.slug)+'">Delete</button>'+
        '</span></h2>'+
        '<div class="admin-products">'+slice.map(productRow).join('')+'</div></section>';
    }).join('');

    content.innerHTML=chips+(body||'<div class="notice">No products match this filter.</div>')+
      (truncated?'<div class="list-sentinel" id="list-sentinel">Loading more of '+total+'…</div>':
        (total?'<p class="list-end">'+total+' products shown.</p>':''));

    // A part-selected category shows the dash rather than a tick. `indeterminate`
    // is a property, not an attribute, so it has to be set after the markup lands.
    content.querySelectorAll('[data-select-category][data-partial]').forEach(function(box){box.indeterminate=true});

    observeSentinel();
    updateBulkBar();
  }

  /* Appends the next batch when the sentinel scrolls into view. */
  function observeSentinel(){
    if(listObserver){listObserver.disconnect();listObserver=null}
    var sentinel=document.getElementById('list-sentinel');
    if(!sentinel||!('IntersectionObserver' in window))return;
    listObserver=new IntersectionObserver(function(entries){
      if(!entries[0].isIntersecting)return;
      renderLimit+=100;
      renderProducts();
    },{rootMargin:'600px 0px'});
    listObserver.observe(sentinel);
  }

  function render(){
    document.body.dataset.tab=activeTab;
    document.querySelectorAll('[data-tab-button]').forEach(function(b){
      var on=b.dataset.tabButton===activeTab;
      b.classList.toggle('active',on);
      b.setAttribute('aria-selected',String(on));
    });
    if(activeTab==='overview'){renderOverview()}
    else if(activeTab==='sales'){renderSales()}
    else{renderProducts()}
  }
  function formSnapshot(form){return new URLSearchParams(new FormData(form)).toString()}
  function openDialog(dialog,form){if(form)snapshots.set(form,formSnapshot(form));dialog.showModal()}
  function closeDialog(dialog){var form=dialog.querySelector('form');if(form===productForm)try{syncVariantEditors()}catch(error){}var dirty=form&&snapshots.has(form)&&snapshots.get(form)!==formSnapshot(form);if(dirty&&!confirm('You have unsaved changes. Close without saving?'))return;dialog.close()}
  function openEdit(id){var p=allProducts().find(function(x){return Number(x.id)===id});if(!p)return;productForm.reset();productForm.id.value=p.id;productForm.category.value=p.category;productForm.name.value=p.name||'';productForm.sku.value=p.sku||'';productForm.brand.value=p.brand||'';productForm.price.value=p.price==null?'':p.price;productForm.type.value=p.type||'';productForm.stock.value=p.stock||'in-stock';productForm.stock_quantity.value=p.stock_quantity||0;productForm.visibility.value=p.visibility||'published';productForm.tiers.value=(p.tiers||[]).map(function(t){return t.min+' | '+t.price}).join('\n');populateVariantEditors(p);syncVariantEditors();document.getElementById('product-title').textContent='Edit product';openDialog(productDialog,productForm)}
  /* Single choke point for every POST, so 401 (session expired) and 419 (stale
     CSRF) can be recovered from in one place instead of losing the open form. */
  function request(form,isRetry){
    var data=form instanceof FormData?form:new FormData(form);
    function send(){
      var body=form instanceof FormData?data:new FormData(form);
      body.set('csrf',window.ADMIN_CSRF||'');
      return fetch('api.php',{method:'POST',body:body,credentials:'same-origin'}).then(function(r){
        return r.json().then(function(j){
          if((r.status===401||r.status===419)&&!isRetry)return promptReauth(function(){return request(form,true)});
          if(!r.ok||!j.ok)throw Error(j.error||'Request failed');
          return j;
        });
      });
    }
    return send();
  }
  function consume(j){if(j.catalog)catalog=j.catalog;if(j.settings)settings=j.settings;if(j.backups)backups=j.backups;if(j.activity)activity=j.activity;if(j.image_audit)audit=j.image_audit;syncCurrencyLabel();refreshSelects();render();renderOperations();tell(j.message||'Saved.')}
  function saveProduct(e){e.preventDefault();try{syncVariantEditors()}catch(error){tell(error.message||'Check the product variations.',true);return}request(productForm).then(function(j){snapshots.delete(productForm);productDialog.close();consume(j);reloadTools()}).catch(function(e){tell(e.message,true)})}
  function saveCategory(e){e.preventDefault();request(categoryForm).then(function(j){snapshots.delete(categoryForm);categoryDialog.close();consume(j);reloadTools()}).catch(function(e){tell(e.message,true)})}
  function saveSettings(e){e.preventDefault();request(settingsForm).then(function(j){snapshots.delete(settingsForm);settingsDialog.close();['current_password','new_password','confirm_password','new_customer_passcode','confirm_customer_passcode'].forEach(function(name){if(settingsForm[name])settingsForm[name].value=''});consume(j);if(j.settings&&j.settings.two_factor_enabled&&j.settings.two_factor_secret)alert('Authenticator setup key:\n\n'+j.settings.two_factor_secret+'\n\nAdd this key to your authenticator app before logging out.');reloadTools()}).catch(function(e){tell(e.message,true)})}
  function removeProduct(id){if(!confirm('Remove this product permanently? A backup will be created first.'))return;var data=new FormData();data.set('action','delete_product');data.set('id',String(id));request(data).then(function(j){selected.delete(id);consume(j);reloadTools()}).catch(function(e){tell(e.message,true)})}
  function renderOperations(){document.getElementById('audit-summary').textContent=audit.length?audit.length+' products need attention.':'No missing or low-resolution local images found.';document.getElementById('audit-list').innerHTML=audit.slice(0,30).map(function(i){return'<button data-edit-audit="'+i.id+'"><strong>'+esc(i.name)+'</strong><span>'+esc(i.reason)+'</span></button>'}).join('')||'<p>All checked images look usable.</p>';document.getElementById('backup-list').innerHTML=backups.slice(0,15).map(function(b){return'<button data-restore="'+esc(b.name)+'"><strong>'+new Date(b.time).toLocaleString()+'</strong><span>Restore this copy</span></button>'}).join('')||'<p>No backups yet.</p>';document.getElementById('activity-list').innerHTML=activity.slice(0,30).map(function(a){return'<div><strong>'+esc(a.action)+'</strong><span>'+new Date(a.time).toLocaleString()+(a.admin?' · '+esc(a.admin):'')+(a.ip?' · IP '+esc(a.ip):'')+(a.detail?' · '+esc(a.detail):'')+'</span></div>'}).join('')||'<p>No activity recorded yet.</p>'}
  /* Backups, the activity log and the image audits are an order of magnitude more
     expensive to build than the catalog, so they live behind ?tools=1 and are only
     fetched when something actually needs them. */
  function reloadTools(){if(!toolsLoaded)return Promise.resolve();return fetchTools()}
  function fetchTools(){
    return fetch('api.php?tools=1',{credentials:'same-origin'}).then(function(r){return r.json()}).then(function(j){
      backups=j.backups||[];activity=j.activity||[];audit=j.image_audit||[];orders=j.orders||[];
      toolsLoaded=true;renderOperations();renderOverviewTools();renderOrders();
    }).catch(function(){/* tools are supplementary; never block the dashboard */})
  }
  function ensureTools(){return toolsLoaded?Promise.resolve():fetchTools()}
  function exportCsv(){var rows=[['product_id','sku','category','category_slug','category_group','name','brand','price','options_json','tiers_json','stock','stock_quantity','stock_updated_at','visibility','colors_json','flavors_json','variant_stock_json','variant_quantity_json','details','image','images_json','added_at','restocked_at']];allProducts().forEach(function(p){var category=catalog.find(function(c){return c.slug===p.category});rows.push([p.id,p.sku||'',p.categoryName,p.category,(category&&category.group)||'Other',p.name,p.brand||'',p.price==null?'':p.price,JSON.stringify(p.options||[]),JSON.stringify(p.tiers||[]),p.stock||'in-stock',p.stock_quantity||0,p.stock_updated_at||'',p.visibility||'published',JSON.stringify(p.colors||[]),JSON.stringify(p.flavors||[]),JSON.stringify(p.variant_stock||{}),JSON.stringify(p.variant_quantity||{}),p.type||'',p.image||'',JSON.stringify(p.images||[]),p.added_at||'',p.restocked_at||''])});var csv=rows.map(function(row){return row.map(function(v){return'"'+String(v).replace(/"/g,'""')+'"'}).join(',')}).join('\r\n'),link=document.createElement('a');link.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));link.download='DR-PHONE-catalog-'+new Date().toISOString().slice(0,10)+'.csv';link.click();URL.revokeObjectURL(link.href)}
  function printPrices(){var body=allProducts().filter(function(p){return(p.visibility||'published')==='published'}).map(function(p){return'<tr><td>'+esc(p.sku||'')+'</td><td>'+esc(p.categoryName)+'</td><td>'+esc(p.name)+'</td><td>'+esc(p.brand||'')+'</td><td>'+esc(productPrice(p))+'</td><td>'+esc((p.stock||'in-stock').replace(/-/g,' '))+'</td></tr>'}).join(''),win=window.open('','_blank');if(!win)return;win.document.write('<title>DR PHONE Price List</title><style>body{font:12px Arial;padding:24px}h1{color:#e00000}table{width:100%;border-collapse:collapse}th,td{padding:7px;border-bottom:1px solid #ddd;text-align:left}</style><h1>DR PHONE Wholesale Price List</h1><p>'+new Date().toLocaleDateString()+'</p><table><thead><tr><th>SKU</th><th>Category</th><th>Product</th><th>Brand</th><th>Price</th><th>Stock</th></tr></thead><tbody>'+body+'</tbody></table>');win.document.close();win.print()}
  function categoryRequest(action,slug,extra){var data=new FormData();data.set('action',action);data.set('slug',slug);Object.keys(extra||{}).forEach(function(k){data.set(k,extra[k])});return request(data).then(function(j){consume(j);reloadTools()}).catch(function(e){tell(e.message,true)})}
  content.onclick=function(e){var categoryEdit=e.target.closest('[data-category-edit]');if(categoryEdit){var cat=catalog.find(function(c){return c.slug===categoryEdit.dataset.categoryEdit});if(!cat)return;categoryForm.reset();categoryForm.elements.action.value='update_category';categoryForm.elements.original_slug.value=cat.slug;categoryForm.elements.name.value=cat.name;categoryForm.elements.group.value=cat.group||'Other';categoryDialog.querySelector('h2').textContent='Edit category';openDialog(categoryDialog,categoryForm);return}var categoryDelete=e.target.closest('[data-category-delete]');if(categoryDelete){var target=catalog.find(function(c){return c.slug===categoryDelete.dataset.categoryDelete});if(target&&confirm('Delete '+target.name+'? Only empty categories can be deleted.'))categoryRequest('delete_category',target.slug);return}var categoryOrder=e.target.closest('[data-category-order]');if(categoryOrder){categoryRequest('reorder_category',categoryOrder.dataset.category,{direction:categoryOrder.dataset.categoryOrder});return}var edit=e.target.closest('.edit');if(edit){openEdit(Number(edit.closest('article').dataset.id));return}var del=e.target.closest('.delete');if(del){removeProduct(Number(del.closest('article').dataset.id));return}var check=e.target.closest('[data-select]');if(check){var id=Number(check.dataset.select);check.checked?selected.add(id):selected.delete(id);updateBulkBar();return}var category=e.target.closest('[data-select-category]');if(category){var g=visibleProducts().find(function(x){return x.category.slug===category.dataset.selectCategory});var on=category.checked;((g&&g.products)||[]).forEach(function(p){on?selected.add(Number(p.id)):selected.delete(Number(p.id))});render()}}
  enhanceForms();
  document.getElementById('apply-bulk').onclick=function(){var data=new FormData();data.set('action','bulk_update');data.set('ids',Array.from(selected).join(','));data.set('stock',document.getElementById('bulk-stock').value);data.set('visibility',document.getElementById('bulk-visibility').value);data.set('category',document.getElementById('bulk-category').value);request(data).then(function(j){selected.clear();consume(j);reloadTools()}).catch(function(e){tell(e.message,true)})};
  document.getElementById('verify-stock').onclick=function(){var data=new FormData();data.set('action','verify_inventory');data.set('ids',Array.from(selected).join(','));request(data).then(function(j){selected.clear();consume(j);reloadTools()}).catch(function(e){tell(e.message,true)})};
  document.addEventListener('click',function(e){
    var range=e.target.closest&&e.target.closest('[data-sales-range]');
    if(range){salesWindow=Number(range.dataset.salesRange)||0;renderSales();return}
    var chip=e.target.closest&&e.target.closest('[data-filter]');
    if(chip){setFilter(chip.dataset.filter);return}
    var tab=e.target.closest&&e.target.closest('[data-tab-button]');
    if(tab){activeTab=tab.dataset.tabButton;renderLimit=100;render();window.scrollTo({top:0,behavior:'smooth'})}
  });
  document.getElementById('clear-selection').onclick=function(){selected.clear();render()};
  document.getElementById('add-product').onclick=function(){productForm.reset();productForm.id.value='';productForm.stock.value='in-stock';productForm.visibility.value='published';productForm.stock_quantity.value='0';populateVariantEditors({colors:['Standard']});syncVariantEditors();document.getElementById('product-title').textContent='Add product';refreshSelects();openDialog(productDialog,productForm)};
  document.getElementById('add-category').onclick=function(){categoryForm.reset();categoryForm.elements.action.value='add_category';categoryForm.elements.original_slug.value='';categoryForm.elements.group.value='Other';categoryDialog.querySelector('h2').textContent='Add category';openDialog(categoryDialog,categoryForm)};
  document.getElementById('open-settings').onclick=function(){settingsForm.reset();['admin_username','phone','location','map_url','currency','minimum_order','payment_terms','delivery_terms'].forEach(function(k){if(settingsForm[k])settingsForm[k].value=settings[k]||''});renderTwoFactor();openDialog(settingsDialog,settingsForm)};
  document.getElementById('open-operations').onclick=function(){operationsDialog.showModal();ensureTools().then(renderOperations)};document.getElementById('export-csv').onclick=exportCsv;
  var ordersExport=document.getElementById('orders-export');
  if(ordersExport)ordersExport.onclick=exportOrdersCsv;
  var ordersClear=document.getElementById('orders-clear');
  if(ordersClear)ordersClear.onclick=function(){
    if(!confirm('Clear the whole order log? The catalog and products are not affected.'))return;
    var data=new FormData();data.set('action','clear_orders');
    request(data).then(function(j){orders=j.orders||[];renderOrders();tell(j.message)}).catch(function(e){tell(e.message,true)});
  };document.getElementById('print-prices').onclick=printPrices;
  operationsDialog.onclick=function(e){var auditButton=e.target.closest('[data-edit-audit]');if(auditButton){operationsDialog.close();openEdit(Number(auditButton.dataset.editAudit));return}var cvButton=e.target.closest('[data-cv-edit]');if(cvButton){operationsDialog.close();openEdit(Number(cvButton.dataset.cvEdit));return}var restore=e.target.closest('[data-restore]');if(restore&&confirm('Restore this catalog backup? The current catalog will also be backed up first.')){var data=new FormData();data.set('action','restore_backup');data.set('backup',restore.dataset.restore);request(data).then(consume).then(reloadTools).catch(function(e){tell(e.message,true)})}};
  importForm.onsubmit=function(e){e.preventDefault();if(!confirm('Import products from this CSV? A backup will be created first.'))return;request(importForm).then(function(j){importForm.reset();consume(j);reloadTools()}).catch(function(e){tell(e.message,true)})};
  var imageImportForm=document.getElementById('image-import-form'),imageImportResult=document.getElementById('image-import-result');
  imageImportForm.onsubmit=function(e){e.preventDefault();var count=imageImportForm.querySelector('[type="file"]').files.length;if(!count){tell('Choose at least one picture.',true);return}var submit=imageImportForm.querySelector('[type="submit"]');submit.disabled=true;submit.textContent='Uploading '+count+' picture'+(count===1?'':'s')+'…';imageImportResult.textContent='Matching filenames to product codes…';request(imageImportForm).then(function(j){var lines=[j.message];if(j.unmatched&&j.unmatched.length)lines.push('Not matched: '+j.unmatched.join(', '));if(j.errors&&j.errors.length)lines.push('Could not import: '+j.errors.join(' | '));imageImportResult.textContent=lines.join('\n');imageImportResult.classList.toggle('has-warning',!!((j.unmatched&&j.unmatched.length)||(j.errors&&j.errors.length)));imageImportForm.reset();consume(j);reloadTools()}).catch(function(error){imageImportResult.textContent=error.message;imageImportResult.classList.add('has-warning');tell(error.message,true)}).finally(function(){submit.disabled=false;submit.textContent='Match and upload pictures'})};
  document.getElementById('prune-images').onclick=function(){if(!confirm('Delete every uploaded picture that is not used by the current catalog? Old catalog backups may still mention those pictures.'))return;var data=new FormData();data.set('action','prune_orphan_images');request(data).then(function(j){imageImportResult.textContent=j.message;imageImportResult.classList.remove('has-warning');tell(j.message);reloadTools()}).catch(function(error){tell(error.message,true)})};
  document.querySelectorAll('[data-close]').forEach(function(b){b.onclick=function(){closeDialog(b.closest('dialog'))}});[productDialog,categoryDialog,settingsDialog,operationsDialog].forEach(function(d){d.addEventListener('cancel',function(e){e.preventDefault();closeDialog(d)})});
  search.oninput=render;productForm.onsubmit=saveProduct;categoryForm.onsubmit=saveCategory;settingsForm.onsubmit=saveSettings;
  /* Overview -> Products deep links, and the category bars. */
  document.addEventListener('click',function(e){
    var tile=e.target.closest&&e.target.closest('[data-stat]');
    if(tile){activeTab='products';setFilter(tile.dataset.stat);window.scrollTo({top:0,behavior:'smooth'});return}
    var bar=e.target.closest&&e.target.closest('[data-jump-category]');
    if(bar){
      categoryFilter=bar.dataset.jumpCategory;
      var jump=document.getElementById('admin-category-filter');
      if(jump)jump.value=categoryFilter;
      activeTab='products';setFilter('all');window.scrollTo({top:0,behavior:'smooth'});
    }
  });
  document.addEventListener('keydown',function(e){
    if(e.key!=='Enter'&&e.key!==' ')return;
    var bar=e.target.closest&&e.target.closest('[data-jump-category]');
    if(bar){e.preventDefault();bar.click()}
  });

  bindQuickEdit();

  content.addEventListener('click',function(e){
    var move=e.target.closest&&e.target.closest('[data-move]');
    if(move){moveProduct(move.dataset.id,move.dataset.move)}
  });

  document.addEventListener('click',function(e){
    var detail=e.target.closest&&e.target.closest('[data-order-detail]');
    if(detail){var items=detail.parentNode.querySelector('.order-items');items.hidden=!items.hidden;return}
    var pending=e.target.closest&&e.target.closest('[data-sales-pending]');
    if(pending){
      orderStatusFilter='unconfirmed';
      var filter=document.getElementById('orders-status');
      if(filter)filter.value='unconfirmed';
      renderOrders();
      ensureTools().then(function(){renderOrders();openDialog(document.getElementById('operations-dialog'))});
      return;
    }
    var mark=e.target.closest&&e.target.closest('[data-order-status]');
    if(mark){
      var body=new FormData();
      body.set('action','set_order_status');
      body.set('reference',mark.dataset.reference);
      body.set('status',mark.dataset.orderStatus);
      request(body).then(function(j){orders=j.orders||[];renderOrders();if(activeTab==='sales')renderSales();tell(j.message)})
        .catch(function(err){tell(err.message,true)});
      return;
    }
    var del=e.target.closest&&e.target.closest('[data-order-delete]');
    if(del){
      if(!confirm('Delete this order from the log? The catalog is not affected.'))return;
      var data=new FormData();data.set('action','delete_order');data.set('reference',del.dataset.orderDelete);
      request(data).then(function(j){orders=j.orders||[];renderOrders();tell(j.message)}).catch(function(err){tell(err.message,true)});
    }
  });
  document.addEventListener('input',function(e){if(e.target.id==='orders-search')renderOrders()});
  document.addEventListener('change',function(e){
    if(e.target.id!=='orders-status')return;
    orderStatusFilter=e.target.value;renderOrders();
  });

  /* ---- session survival (A5) ------------------------------------------- */

  /* is_admin() expires after 30 minutes idle. A heartbeat keeps an actively used
     tab alive (each request refreshes admin_last_seen server-side) while an
     abandoned tab is still allowed to expire. */
  var lastActivity=Date.now();
  ['pointerdown','keydown','focusin'].forEach(function(type){
    document.addEventListener(type,function(){lastActivity=Date.now()},{passive:true});
  });
  setInterval(function(){
    if(Date.now()-lastActivity>10*60*1000)return;
    fetch('api.php?ping=1',{credentials:'same-origin'}).catch(function(){});
  },5*60*1000);

  /* A 401 used to surface as a raw error toast and the open dialog's contents
     were lost. Instead: keep everything on screen, re-authenticate in place, and
     replay the request that failed. */
  var reauthDialog=document.getElementById('reauth-dialog'),
      reauthForm=document.getElementById('reauth-form'),
      pendingRetry=null;

  function promptReauth(retry){
    pendingRetry=retry;
    if(!reauthDialog){location.href='login.php';return Promise.reject(Error('Session expired.'))}
    reauthForm.reset();
    document.getElementById('reauth-error').textContent='';
    if(!reauthDialog.open)reauthDialog.showModal();
    var user=reauthForm.querySelector('[name="username"]');
    if(user&&settings.admin_username&&!user.value)user.value=settings.admin_username;
    return new Promise(function(resolve,reject){pendingRetry={run:retry,resolve:resolve,reject:reject}});
  }

  if(reauthForm){
    reauthForm.onsubmit=function(e){
      e.preventDefault();
      var data=new FormData(reauthForm);
      data.set('action','reauth');
      data.set('csrf',window.ADMIN_CSRF||'');
      fetch('api.php',{method:'POST',body:data,credentials:'same-origin'})
        .then(function(r){return r.json()})
        .then(function(j){
          if(!j.ok)throw Error(j.error||'Sign-in failed.');
          if(j.csrf)window.ADMIN_CSRF=j.csrf;
          reauthDialog.close();
          tell('Signed back in.');
          var queued=pendingRetry;pendingRetry=null;
          if(queued&&queued.run)queued.run().then(queued.resolve,queued.reject);
        })
        .catch(function(err){document.getElementById('reauth-error').textContent=err.message});
    };
    // Covers Escape, the Cancel button and any other path that closes it.
    reauthDialog.addEventListener('close',function(){
      if(pendingRetry&&pendingRetry.reject)pendingRetry.reject(Error('Sign-in cancelled — your changes are still on screen.'));
      pendingRetry=null;
    });
  }

  fetch('api.php',{credentials:'same-origin'}).then(function(r){if(r.status===401){location.href='login.php';throw Error('Locked')}return r.json()}).then(function(j){
    catalog=j.catalog;settings=j.settings||{};stats=j.stats||{};window.ADMIN_CSRF=j.csrf;
    syncCurrencyLabel();refreshSelects();render();
    // Tools arrive separately so the first paint is not blocked by the audits.
    ensureTools();
  }).catch(function(e){if(e.message!=='Locked')tell(e.message,true)});
})();
