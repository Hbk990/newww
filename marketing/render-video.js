#!/usr/bin/env node
/**
 * DR PHONE — "Kinetic Red" marketing video renderer.
 *
 * Produces a 42.000 s vertical (1080x1920) promo from the REAL catalog,
 * scored to the original soundtrack written by compose-music.py.
 *
 * Why frames and not screen recording
 * -----------------------------------
 * Playwright's recordVideo drops frames under load. For fast kinetic motion
 * that reads as stutter, and it makes beat-synced cutting impossible. Instead
 * this renders each frame deterministically: every moving value is a pure
 * function of the frame number, so the output is smooth and exactly the
 * intended length.
 *
 * The shared clock (both files derive from it, so cuts land on the beat):
 *
 *     120 BPM @ 30 fps  ->  beat = 15 frames, bar = 60 frames
 *                           21 bars = 1260 frames = 42.000 s
 *
 * Pipeline
 * --------
 *   1. capturePlates()  drive the live site, screenshot the pieces we need
 *   2. buildFilm()      write a standalone film page referencing those plates
 *   3. renderFrames()   1260 deterministic frames, encoded scene by scene
 *                       with each scene's frames deleted immediately after
 *                       (peak disk ~60 MB instead of ~2 GB)
 *   4. encode()         concat the scene clips, mux the audio, cut the 28 s
 *
 * Usage:  node render-video.js            (expects the site on :8080)
 */

const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ------------------------------------------------------------------ config

const BASE = process.env.DRP_BASE || 'http://127.0.0.1:8080/wholesale-7nQ4vK9mP2xR8cL5/';
const PASSCODE = process.env.DRP_PASSCODE || 'test1234';
const ADMIN_USER = process.env.DRP_ADMIN_USER || 'drphone';
const ADMIN_PASS = process.env.DRP_ADMIN_PASS || 'admin-test-pass-123';
const CHROME = '/opt/pw-browsers/chromium';

const FPS = 30;
const BEAT = 15;            // frames
const BAR = 60;             // frames
const BARS = 21;
const TOTAL = BARS * BAR;   // 1260 frames = 42.000 s

// Phone layout at 3x so the output is a true 1080x1920 with mobile styling.
const VW = 360, VH = 640, DPR = 3;
const OUT_W = VW * DPR, OUT_H = VH * DPR;

const DIR = __dirname;
const PLATES = path.join(DIR, 'plates');
const FRAMES = path.join(DIR, 'frames');
const OUT = path.join(DIR, 'out');
const SEGS = path.join(OUT, 'segments');

// Scene boundaries, in bars. Every scene starts on a downbeat by construction.
const SCENES = [
  { id: 's1', name: 'open',      bars: [0, 2] },
  { id: 's2', name: 'type',      bars: [2, 5] },
  { id: 's3', name: 'numbers',   bars: [5, 7] },
  { id: 's4', name: 'grid',      bars: [7, 11] },
  { id: 's5', name: 'strobe',    bars: [11, 14] },
  { id: 's6', name: 'payoff',    bars: [14, 17] },
  { id: 's7', name: 'dashboard', bars: [17, 19] },
  { id: 's8', name: 'endcard',   bars: [19, 21] },
].map(s => ({ ...s, from: s.bars[0] * BAR, to: s.bars[1] * BAR }));

const log = (...a) => console.log(...a);
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();

function fresh(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

// ------------------------------------------------------- 1. capture plates

async function capturePlates() {
  log('\n[1/4] Capturing plates from the live catalog...');
  fresh(PLATES);

  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({
    viewport: { width: VW, height: VH },
    deviceScaleFactor: DPR,
  });
  const page = await ctx.newPage();

  // Freeze the site's own animation so plates are stable and nothing in them
  // can desync from the film's frame clock.
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () =>
      document.documentElement.setAttribute('data-motion', 'off'));
  });

  // --- customer side
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.fill('#access-password', PASSCODE);
  await page.click('button[name="catalog_login"]');
  await page.waitForSelector('.category-row', { timeout: 20000 });
  await page.evaluate(() => document.documentElement.setAttribute('data-motion', 'off'));
  await page.waitForTimeout(900);

  await page.screenshot({ path: path.join(PLATES, 'hero.jpg'), quality: 92, type: 'jpeg' });

  // Category names for the strobe — real data, not invented.
  const categories = await page.$$eval('.category-row', els =>
    els.slice(0, 14).map(e => ({
      name: e.querySelector('.category-name').textContent.trim(),
      count: e.querySelector('.category-count').textContent.trim(),
    })));
  fs.writeFileSync(path.join(PLATES, 'categories.json'), JSON.stringify(categories, null, 2));

  // --- product grid + individual cards for the 3D assembly
  await page.locator('.category-row').first().click();
  await page.waitForSelector('.product-card');
  await page.evaluate(() => document.documentElement.setAttribute('data-motion', 'off'));
  // Let every lazy image above the fold decode before we shoot.
  await page.evaluate(async () => {
    document.querySelectorAll('.product-card img').forEach(i => { i.loading = 'eager'; });
    await Promise.all([...document.querySelectorAll('.product-card img')].slice(0, 14)
      .map(i => i.complete ? null : new Promise(r => { i.onload = r; i.onerror = r; })));
  });
  await page.waitForTimeout(1200);

  const cards = await page.$$('.product-card');
  const wanted = Math.min(12, cards.length);
  for (let i = 0; i < wanted; i++) {
    await cards[i].scrollIntoViewIfNeeded();
    await page.waitForTimeout(120);
    await cards[i].screenshot({ path: path.join(PLATES, `card-${i}.jpg`), quality: 92, type: 'jpeg' });
  }
  log(`      ${wanted} product cards`);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(PLATES, 'grid.jpg'), quality: 92, type: 'jpeg' });

  // The hero product for the payoff scene.
  await cards[0].screenshot({ path: path.join(PLATES, 'hero-card.jpg'), quality: 95, type: 'jpeg' });

  // --- catalog stats, straight from the API (never hand-typed)
  const stats = await page.evaluate(async () => {
    const j = await (await fetch('api/catalog.php', { credentials: 'same-origin' })).json();
    const cats = j.catalog || [];
    return {
      products: cats.reduce((t, c) => t + c.products.length, 0),
      categories: cats.length,
      groups: new Set(cats.map(c => c.group || 'Other')).size,
      phone: (window.DR_PHONE || {}).phone || '',
    };
  });
  fs.writeFileSync(path.join(PLATES, 'stats.json'), JSON.stringify(stats, null, 2));
  log(`      stats: ${stats.products} products / ${stats.categories} categories / ${stats.groups} departments`);

  // --- dashboard beat
  const admin = await ctx.newPage();
  await admin.goto(BASE + 'admin/', { waitUntil: 'networkidle' });
  await admin.fill('input[name="username"]', ADMIN_USER);
  await admin.fill('input[name="password"]', ADMIN_PASS);
  await admin.click('button[type="submit"]');
  await admin.waitForSelector('.stat-tile', { timeout: 20000 });
  await admin.evaluate(() => document.documentElement.setAttribute('data-motion', 'off'));
  // data-motion=off makes runCounters print final values immediately.
  await admin.waitForTimeout(1500);
  await admin.screenshot({ path: path.join(PLATES, 'dash.jpg'), quality: 92, type: 'jpeg' });
  await admin.close();

  await browser.close();

  // Assets the film page needs locally (file:// can't reach the server).
  fs.copyFileSync(path.join(DIR, '..', 'wholesale-7nQ4vK9mP2xR8cL5', 'dr-phone-logo.png'),
                  path.join(PLATES, 'logo.png'));
  fs.copyFileSync(path.join(DIR, '..', 'wholesale-7nQ4vK9mP2xR8cL5', 'assets', 'fonts', 'outfit-latin.woff2'),
                  path.join(PLATES, 'outfit-latin.woff2'));
  fs.copyFileSync(path.join(DIR, 'director.css'), path.join(PLATES, 'director.css'));

  log(`      plates written to ${PLATES}`);
  return { cards: wanted, stats, categories };
}

// ---------------------------------------------------------- 2. build film

function buildFilm({ cards, stats, categories }) {
  log('[2/4] Building the film page...');

  const cardImgs = Array.from({ length: cards },
    (_, i) => `<img class="card" src="card-${i}.jpg" alt="">`).join('\n      ');

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><link rel="stylesheet" href="director.css"></head>
<body><div id="film">

  <section class="scene" id="s1">
    <div class="red-panel"></div>
    <img class="logo" src="logo.png" alt="">
    <div class="rule"></div>
    <div class="tag label">Private wholesale catalog</div>
  </section>

  <section class="scene" id="s2">
    <div class="block">
      <span class="line display">Phones,</span>
      <span class="line display">Tech &amp;</span>
      <span class="line display">Lots <em>more.</em></span>
      <div class="swipe"></div>
    </div>
  </section>

  <section class="scene" id="s3">
    <img class="plate" src="grid.jpg" alt="">
    <div class="stats">
      <div class="stat"><b data-to="${stats.products}">0</b><span class="label">Products in stock</span></div>
      <div class="stat"><b data-to="${stats.categories}">0</b><span class="label">Categories</span></div>
      <div class="stat hot"><b data-to="${stats.groups}">0</b><span class="label">Departments</span></div>
    </div>
  </section>

  <section class="scene" id="s4">
    <div class="grid">
      ${cardImgs}
    </div>
    <div class="banner display">Everything in one place</div>
  </section>

  <section class="scene" id="s5">
    <div class="bg"></div>
    <div class="word display"></div>
    <div class="count label"></div>
  </section>

  <section class="scene" id="s6">
    <div class="stagewrap"><img class="card" src="hero-card.jpg" alt=""></div>
    <div class="cartpill">CART <b>0</b></div>
    <div class="qtybox"><div class="step">&minus;</div><div class="val">0</div><div class="step">+</div></div>
    <div class="cap display">Type it.<br><em>Don't tap it.</em></div>
  </section>

  <section class="scene" id="s7">
    <div class="glow"></div>
    <img class="plate" src="dash.jpg" alt="">
    <div class="cap display">Run the <em>whole shop.</em></div>
  </section>

  <section class="scene" id="s8">
    <img class="logo" src="logo.png" alt="">
    <div class="tag">phones, tech &amp; lots more!</div>
    <div class="rule"></div>
    <div class="phone label">${stats.phone || ''}</div>
  </section>

  <div id="wipe"></div>
  <div id="flash"></div>
</div>

<script>
const FPS=${FPS}, BEAT=${BEAT}, BAR=${BAR}, TOTAL=${TOTAL};
const CATS=${JSON.stringify(categories)};
const SCENES=${JSON.stringify(SCENES.map(s => ({ id: s.id, from: s.from, to: s.to })))};

/* ---- easing (pure functions of progress) ---- */
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const lerp=(a,b,p)=>a+(b-a)*p;
const outExpo=p=>p>=1?1:1-Math.pow(2,-10*p);
const outBack=p=>{const c=1.70158+1;return 1+ (c+1)*Math.pow(p-1,3)+c*Math.pow(p-1,2)};
const inOut=p=>p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;
const outCubic=p=>1-Math.pow(1-p,3);
/* progress of frame f across [a,b) */
const seg=(f,a,b)=>clamp((f-a)/(b-a));

/* A subtle pulse on every kick. Applied broadly, this is most of what makes
   the picture feel locked to the music. */
const kickPulse=f=>{const p=(f%BEAT)/BEAT;return Math.exp(-p*7)*0.022};

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];

function showOnly(id){
  SCENES.forEach(s=>{const el=document.getElementById(s.id);
    if(s.id===id){el.classList.add('on')}else{el.classList.remove('on')}});
}

function render(f){
  const sc=SCENES.find(s=>f>=s.from&&f<s.to)||SCENES[SCENES.length-1];
  showOnly(sc.id);
  const l=f-sc.from;                 // local frame within the scene
  const len=sc.to-sc.from;
  const pulse=1+kickPulse(f);

  /* Continuous camera breathe on every scene. Real footage is never perfectly
     still; without this, held shots encode as identical frames and read as a
     freeze even though the cut timing is correct. */
  const br=f/FPS;
  const sceneEl=document.getElementById(sc.id);
  sceneEl.style.transform=
    'scale('+(1.015+0.018*Math.sin(br*0.62))+') '
    +'translate3d('+(6*Math.sin(br*0.41))+'px,'+(9*Math.cos(br*0.33))+'px,0)';

  /* ---------------- S1  open ---------------- */
  if(sc.id==='s1'){
    const panel=$('#s1 .red-panel'), logo=$('#s1 .logo'),
          rule=$('#s1 .rule'), tag=$('#s1 .tag');
    const wipe=outExpo(seg(l,0,16));
    panel.style.transform='scaleX('+wipe+')';
    const lp=outBack(seg(l,12,38));
    logo.style.opacity=String(clamp(seg(l,12,24)));
    logo.style.transform='perspective(1200px) translateZ('+lerp(-700,0,lp)+'px) '
      +'rotateX('+lerp(-58,0,lp)+'deg) scale('+(lerp(.72,1,lp)*pulse)+')';
    rule.style.transform='scaleX('+outExpo(seg(l,34,58))+')';
    tag.style.opacity=String(outCubic(seg(l,48,72)));
    const out=seg(l,len-16,len);
    $('#s1').style.opacity=String(1-out);
    // continuous push through the hold so the shot never sits still
    const push=1+0.055*(l/len)+lerp(0,0.06,out);
    logo.style.transform='perspective(1200px) translateZ('+lerp(-700,0,lp)+'px) '
      +'rotateX('+lerp(-58,0,lp)+'deg) scale('+(lerp(.72,1,lp)*pulse*push)+')';
  }

  /* ---------------- S2  type slams (one line per bar) ---------------- */
  if(sc.id==='s2'){
    const lines=$$('#s2 .line'), block=$('#s2 .block'), swipe=$('#s2 .swipe');
    lines.forEach((el,i)=>{
      const start=i*BAR;                       // exactly on the downbeat
      const p=outExpo(seg(l,start,start+11));
      el.style.opacity=String(clamp(seg(l,start,start+5)));
      el.style.transform='perspective(1000px) rotateX('+lerp(-92,0,p)+'deg) '
        +'translateY('+lerp(70,0,p)+'px)';
    });
    // camera push across the whole scene
    block.style.transform='translateY(-50%) scale('+(lerp(1,1.09,inOut(l/len))*pulse)+')';
    // red bar sweeps under the last line as it lands
    swipe.style.top=(lines[2].offsetTop+lines[2].offsetHeight+18)+'px';
    swipe.style.transform='scaleX('+outExpo(seg(l,2*BAR+12,2*BAR+34))+')';
  }

  /* ---------------- S3  counters, one per beat ---------------- */
  if(sc.id==='s3'){
    $$('#s3 .stat').forEach((el,i)=>{
      const start=i*BEAT*2;                    // a new stat every half bar
      const p=outExpo(seg(l,start,start+10));
      el.style.opacity=String(clamp(seg(l,start,start+6)));
      el.style.transform='perspective(1200px) rotateY('+lerp(-38,0,p)+'deg) '
        +'translateX('+lerp(-90,0,p)+'px)';
      const b=el.querySelector('b');
      const to=+b.dataset.to;
      const cp=outCubic(seg(l,start,start+34));
      b.textContent=Math.round(to*cp).toLocaleString('en-US');
    });
    $('#s3 .plate').style.transform='scale('+lerp(1.18,1.0,l/len)+') '
      +'translateY('+lerp(-30,30,l/len)+'px)';
  }

  /* ---------------- S4  cards fly in from depth ---------------- */
  if(sc.id==='s4'){
    const cards=$$('#s4 .card'), grid=$('#s4 .grid');
    cards.forEach((el,i)=>{
      const start=6+i*7;
      const p=outExpo(seg(l,start,start+26));
      el.style.opacity=String(clamp(seg(l,start,start+10)));
      el.style.transform='translateZ('+lerp(-900,0,p)+'px) '
        +'rotateY('+lerp(i%2?46:-46,0,p)+'deg) rotateX('+lerp(18,0,p)+'deg)';
    });
    // once assembled, a slow drift up through the grid
    const drift=inOut(seg(l,90,len));
    grid.style.transform='translateY('+lerp(-46,-64,drift)+'%) '
      +'rotateX('+lerp(9,2,drift)+'deg) scale('+(lerp(.96,1.04,drift)*pulse)+')';
    const bn=$('#s4 .banner');
    const bp=outBack(seg(l,len-46,len-16));
    bn.style.opacity=String(clamp(seg(l,len-46,len-36)));
    bn.style.transform='scaleY('+clamp(bp,0,1.2)+')';
  }

  /* ---------------- S5  category strobe, one per beat ---------------- */
  if(sc.id==='s5'){
    const idx=Math.floor(l/BEAT);
    const cat=CATS[idx%CATS.length]||{name:'',count:''};
    const w=$('#s5 .word');
    const bg=$('#s5 .bg'), cnt=$('#s5 .count');
    const odd=idx%2===1;
    bg.style.background=odd?'#ff0000':'#000';
    w.textContent=cat.name.toUpperCase();
    w.style.color=odd?'#fff':'#fff';
    cnt.textContent=cat.count.toUpperCase();
    cnt.style.color=odd?'rgba(255,255,255,.75)':'rgba(255,255,255,.6)';
    const p=outExpo(seg(l%BEAT,0,7));
    w.style.opacity=String(clamp(seg(l%BEAT,0,3)));
    // keep drifting for the whole beat rather than settling after 7 frames
    const hold=(l%BEAT)/BEAT;
    w.style.transform='translateY(-50%) perspective(1000px) '
      +'rotateX('+lerp(odd?52:-52,0,p)+'deg) '
      +'scale('+(lerp(.86,1,p)*(1+0.085*hold))+') '
      +'translateX('+lerp(0,odd?-26:26,hold)+'px)';
    cnt.style.opacity=String(clamp(seg(l%BEAT,3,8))*0.9);
  }

  /* ---------------- S6  the payoff: dive, then the drop ---------------- */
  if(sc.id==='s6'){
    const DROP=2*BAR;                          // bar 17 downbeat, local frame 120
    const card=$('#s6 .card'), qty=$('#s6 .qtybox'),
          cap=$('#s6 .cap'), pill=$('#s6 .cartpill'), val=$('#s6 .qtybox .val');

    // bars 15-16: camera dives toward the card
    const dive=inOut(seg(l,0,DROP));
    card.style.transform='perspective(1300px) translateZ('+lerp(-160,520,dive)+'px) '
      +'rotateY('+lerp(16,0,dive)+'deg) rotateX('+lerp(-10,0,dive)+'deg)';
    card.style.filter='blur('+lerp(0,7,clamp(seg(l,DROP-30,DROP)))+'px)';
    card.style.opacity=String(1-clamp(seg(l,DROP+6,DROP+26))*0.55);

    // the drop: the control lands hard on the downbeat
    const qp=outBack(seg(l,DROP,DROP+13));
    qty.style.opacity=String(clamp(seg(l,DROP,DROP+5)));
    qty.style.transform='perspective(1200px) scale('+clamp(qp,0,1.25)+') '
      +'rotateX('+lerp(34,0,outExpo(seg(l,DROP,DROP+18)))+'deg)';

    // 60 counts up over the first beat after the drop, then holds
    const n=Math.round(60*outCubic(seg(l,DROP+6,DROP+6+BEAT)));
    val.textContent=String(n);
    val.style.transform='scale('+(1+kickPulse(f)*3)+')';

    pill.style.opacity=String(clamp(seg(l,DROP+8,DROP+18)));
    pill.style.transform='translateY('+lerp(-40,0,outBack(seg(l,DROP+8,DROP+26)))+'px)';
    pill.querySelector('b').textContent=String(n);

    const cp=outBack(seg(l,DROP+22,DROP+42));
    cap.style.opacity=String(clamp(seg(l,DROP+22,DROP+32)));
    cap.style.transform='scale('+clamp(cp,0,1.15)+')';
  }

  /* ---------------- S7  dashboard ---------------- */
  if(sc.id==='s7'){
    const plate=$('#s7 .plate'), cap=$('#s7 .cap');
    const p=inOut(l/len);
    const inP=outExpo(seg(l,0,26));
    plate.style.opacity=String(clamp(seg(l,0,14)));
    plate.style.transform='perspective(1500px) translateZ('+lerp(-420,60,inP)+'px) '
      +'rotateY('+lerp(26,-8,p)+'deg) rotateX('+lerp(12,-3,p)+'deg) '
      +'translateY('+lerp(0,-90,p)+'px) scale('+(lerp(.92,1.02,p)*pulse)+')';
    const cp=outBack(seg(l,BEAT*2,BEAT*2+22));
    cap.style.opacity=String(clamp(seg(l,BEAT*2,BEAT*2+12)));
    cap.style.transform='translateY('+lerp(60,0,cp)+'px)';
  }

  /* ---------------- S8  end card ---------------- */
  if(sc.id==='s8'){
    const logo=$('#s8 .logo'), tag=$('#s8 .tag'),
          rule=$('#s8 .rule'), phone=$('#s8 .phone');
    const p=outBack(seg(l,0,20));
    logo.style.opacity=String(clamp(seg(l,0,8)));
    logo.style.transform='perspective(1200px) rotateX('+lerp(48,0,outExpo(seg(l,0,26)))+'deg) '
      +'scale('+(clamp(p,0,1.12)*pulse)+')';
    tag.style.opacity=String(outCubic(seg(l,16,36)));
    rule.style.transform='scaleX('+outExpo(seg(l,26,48))+')';
    phone.style.opacity=String(outCubic(seg(l,34,56)));
    // gentle continuous drift out, on the inner elements (the scene element
    // carries the breathe)
    const drift=1+0.05*(l/len);
    logo.style.transform='perspective(1200px) rotateX('+lerp(48,0,outExpo(seg(l,0,26)))+'deg) '
      +'scale('+(clamp(p,0,1.12)*pulse*drift)+')';
    // fade to black on the very last beat
    const fade=seg(l,len-BEAT,len);
    $('#flash').style.background='#000';
    $('#flash').style.opacity=String(fade);
  }

  /* ---------------- cuts: a red wipe on every scene change ------------- */
  const wipe=$('#wipe');
  const isFirst=sc.from===0;
  const w1=seg(l,0,7), w2=seg(l,7,20);
  if(!isFirst&&l<20){
    // panel covers the frame then slides off to reveal the new scene
    const cover=1-outExpo(w2);
    wipe.style.opacity='1';
    wipe.style.transform='scaleX('+(l<7?1:cover)+')';
    wipe.style.transformOrigin=l<7?'left center':'right center';
  }else{
    wipe.style.opacity='0';
  }
  if(sc.id!=='s8'){ $('#flash').style.opacity='0'; }
}

window.__render=render;
window.__TOTAL=TOTAL;
</script></body></html>`;

  fs.writeFileSync(path.join(PLATES, 'film.html'), html);
  log(`      film page written (${SCENES.length} scenes, ${TOTAL} frames)`);
}

// -------------------------------------------------------- 3. render frames

async function renderFrames() {
  log('[3/4] Rendering 1260 deterministic frames...');
  fresh(FRAMES);
  fresh(SEGS);

  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({
    viewport: { width: OUT_W, height: OUT_H },
    deviceScaleFactor: 1,
  });
  await page.goto('file://' + path.join(PLATES, 'film.html'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);   // fonts + plates decoded

  const started = Date.now();
  for (const scene of SCENES) {
    // Render one scene, encode it, delete its frames. Keeps peak disk tiny.
    for (let f = scene.from; f < scene.to; f++) {
      await page.evaluate(n => window.__render(n), f);
      await page.screenshot({
        path: path.join(FRAMES, String(f).padStart(5, '0') + '.jpg'),
        type: 'jpeg', quality: 92,
      });
    }
    const list = fs.readdirSync(FRAMES).filter(n => n.endsWith('.jpg')).sort();
    const listFile = path.join(FRAMES, 'list.txt');
    fs.writeFileSync(listFile, list.map(n => `file '${path.join(FRAMES, n)}'`).join('\n'));
    sh('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
      '-r', String(FPS), '-f', 'concat', '-safe', '0', '-i', listFile,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '17',
      '-pix_fmt', 'yuv420p', '-r', String(FPS),
      path.join(SEGS, `${scene.id}.mp4`)]);
    for (const n of list) fs.unlinkSync(path.join(FRAMES, n));
    fs.unlinkSync(listFile);
    const done = scene.to;
    log(`      ${scene.name.padEnd(10)} frames ${scene.from}-${scene.to - 1}  (${done}/${TOTAL}, ${Math.round(done / TOTAL * 100)}%)`);
  }
  await browser.close();
  log(`      rendered in ${Math.round((Date.now() - started) / 1000)}s`);
}

// -------------------------------------------------------------- 4. encode

function encode() {
  log('[4/4] Encoding...');
  const audio = path.join(OUT, 'DR-PHONE-soundtrack.wav');
  if (!fs.existsSync(audio)) throw new Error('Soundtrack missing — run compose-music.py first.');

  const concatList = path.join(SEGS, 'concat.txt');
  fs.writeFileSync(concatList, SCENES.map(s => `file '${path.join(SEGS, s.id + '.mp4')}'`).join('\n'));

  const silent = path.join(SEGS, 'silent.mp4');
  sh('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'concat', '-safe', '0', '-i', concatList, '-c', 'copy', silent]);

  const full = path.join(OUT, 'DR-PHONE-kinetic-red-1080x1920.mp4');
  sh('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
    '-i', silent, '-i', audio,
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
    '-shortest', '-movflags', '+faststart', full]);
  log(`      ${path.basename(full)}`);

  // WhatsApp Status rejects video over 30s, so cut one that fits.
  // Start at 12.0s (bar 7 downbeat) so the cut still opens on a downbeat and
  // keeps the drop; fade in/out so it does not begin or end abruptly.
  const short = path.join(OUT, 'DR-PHONE-kinetic-red-30s.mp4');
  sh('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
    '-ss', '12.0', '-i', full, '-t', '28.0',
    '-vf', 'fade=t=in:st=0:d=0.5,fade=t=out:st=27.2:d=0.8',
    '-af', 'afade=t=in:st=0:d=0.5,afade=t=out:st=27.2:d=0.8',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', short]);
  log(`      ${path.basename(short)}`);

  // Contact sheet so the look can be judged without playing the file.
  const sheet = path.join(OUT, 'contact-sheet.jpg');
  sh('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', full,
    '-vf', "select='not(mod(n,60))',scale=216:384,tile=7x3", '-frames:v', '1', sheet]);
  log(`      ${path.basename(sheet)}`);

  fs.rmSync(SEGS, { recursive: true, force: true });
  fs.rmSync(FRAMES, { recursive: true, force: true });
  return { full, short, sheet };
}

// ------------------------------------------------------------------- main

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const meta = await capturePlates();
  buildFilm(meta);
  await renderFrames();
  const files = encode();
  log('\nDone.');
  for (const f of Object.values(files)) {
    log(`  ${f}  (${(fs.statSync(f).size / 1048576).toFixed(1)} MB)`);
  }
})().catch(e => { console.error('\nRENDER FAILED:', e); process.exit(1); });
