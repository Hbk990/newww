<?php
declare(strict_types=1);
require_once __DIR__ . '/inc/bootstrap.php';
$error='';
if($_SERVER['REQUEST_METHOD']==='POST'&&isset($_POST['catalog_login'])){
    if(!hash_equals((string)($_SESSION['login_csrf']??''),(string)($_POST['csrf']??'')))$error='Session expired. Refresh and try again.';
    elseif(!auth_allowed('catalog'))$error='Too many incorrect attempts. Please wait 15 minutes.';
    else{
        $passcode=(string)($_POST['passcode']??''); $siteSettings=settings();
        if(!empty($siteSettings['admin_password_hash'])&&password_verify($passcode,(string)$siteSettings['admin_password_hash'])){
            auth_clear_failures('catalog'); session_regenerate_id(true); $_SESSION['customer_authenticated']=true; $_SESSION['admin_entry_allowed']=true; unset($_SESSION['admin_authenticated'],$_SESSION['admin_last_seen']); header('Location: ./'); exit;
        }
        if(password_verify($passcode,(string)($siteSettings['customer_password_hash']??CUSTOMER_PASSWORD_HASH))){
            auth_clear_failures('catalog'); session_regenerate_id(true); $_SESSION['customer_authenticated']=true; unset($_SESSION['admin_entry_allowed'],$_SESSION['admin_authenticated'],$_SESSION['admin_last_seen']); header('Location: ./'); exit;
        }
        auth_record_failure('catalog'); usleep(600000); $error='Incorrect passcode.';
    }
}
if(empty($_SESSION['login_csrf']))$_SESSION['login_csrf']=bin2hex(random_bytes(24));
$unlocked=is_customer(); $admin=is_admin(); $adminEntry=$admin||!empty($_SESSION['admin_entry_allowed']); $siteSettings=settings();
?>
<!doctype html>
<html lang="en" data-motion="full">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#ff0000">
<?php if($unlocked):?>
<title>DR PHONE Mobile Catalog</title>
<meta name="description" content="DR PHONE wholesale product catalog">
<?php else:
/* Locked, this is the page the public and the search engines see, and the one
   that gets previewed when the link is pasted into WhatsApp. */
$lpSummary=catalog_summary();
$lpProducts=(int)($lpSummary['products']??0);
$lpBlurb=($lpProducts?number_format($lpProducts).' products across '.(int)$lpSummary['categories'].' categories &mdash; p':'P')
        .'hone accessories, audio, gaming and home electronics, wholesale to shops and resellers. Trade accounts only.';
$lpTitle='DR PHONE &mdash; Wholesale phone accessories, audio and gaming';
$lpUrl=(!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off'?'https':'http').'://'.($_SERVER['HTTP_HOST']??'drphonewholesale.online').'/';
?>
<title><?=$lpTitle?></title>
<meta name="description" content="<?=htmlspecialchars(strip_tags(html_entity_decode($lpBlurb)))?>">
<link rel="canonical" href="<?=htmlspecialchars($lpUrl)?>">
<meta property="og:type" content="website">
<meta property="og:site_name" content="DR PHONE">
<meta property="og:title" content="<?=htmlspecialchars(html_entity_decode($lpTitle))?>">
<meta property="og:description" content="<?=htmlspecialchars(strip_tags(html_entity_decode($lpBlurb)))?>">
<meta property="og:url" content="<?=htmlspecialchars($lpUrl)?>">
<meta property="og:image" content="<?=htmlspecialchars($lpUrl)?>dr-phone-logo.png">
<meta name="twitter:card" content="summary">
<?php endif;?>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23ff0000'/%3E%3Crect x='23' y='14' width='18' height='36' rx='4' fill='%23fff'/%3E%3C/svg%3E">
<link rel="preload" href="assets/fonts/outfit-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="assets/styles.css?v=20">
<script nonce="<?=htmlspecialchars(CSP_NONCE)?>">
/* Motion tiering runs before first paint, so the page never flashes the full
   treatment before downgrading. "lite" drops only the animations that run
   continuously; "off" drops everything. */
(function(){var r=document.documentElement,m=window.matchMedia;
if(m&&m('(prefers-reduced-motion: reduce)').matches){r.setAttribute('data-motion','off');return}
var cores=navigator.hardwareConcurrency||8,mem=navigator.deviceMemory||8;
if(cores<=2||mem<=2)r.setAttribute('data-motion','lite')})();
</script>
</head>
<body<?=$unlocked?'':' class="gate-body"'?>>
<?php if(!$unlocked):?>
<main class="gate">
  <section class="gate-brand">
    <div class="gate-pattern" aria-hidden="true">
      <span class="gate-tile"></span><span class="gate-tile"></span><span class="gate-tile"></span><span class="gate-tile"></span>
      <span class="gate-tile"></span><span class="gate-tile"></span><span class="gate-tile"></span><span class="gate-tile"></span>
      <span class="gate-tile"></span><span class="gate-tile"></span><span class="gate-tile"></span><span class="gate-tile"></span>
    </div>
    <div class="gate-brand-inner">
      <img class="gate-logo" src="dr-phone-logo.png" alt="Dr. phone">
      <h1 class="gate-headline">
        <span class="reveal-line"><i style="--d:.05s">PHONES,</i></span>
        <span class="reveal-line"><i style="--d:.15s">TECH &amp;</i></span>
        <span class="reveal-line"><i style="--d:.25s">LOTS MORE.</i></span>
      </h1>
      <p class="gate-tagline">Private wholesale catalog &middot; Lebanon</p>
    </div>
  </section>
  <section class="gate-form">
    <div class="gate-form-inner">
      <p class="eyebrow">Members only</p>
      <h2>Enter your passcode</h2>
      <p class="gate-note">Use the customer passcode to browse the catalog, or the administrator password to unlock management.</p>
      <form method="post" novalidate>
        <input type="hidden" name="csrf" value="<?=htmlspecialchars($_SESSION['login_csrf'])?>">
        <div class="password-wrap">
          <input id="access-password" type="password" name="passcode" autocomplete="current-password" placeholder="Passcode" required autofocus>
          <button class="show-password" type="button" aria-label="Show password">Show</button>
        </div>
        <?php if($error):?><div class="form-error" role="alert"><?=htmlspecialchars($error)?></div><?php endif;?>
        <button class="gate-submit" type="submit" name="catalog_login"><span>Open catalog</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button>
      </form>
      <a class="lp-cue" href="#stock">Not a customer yet? See what we stock<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v13M6 12l6 6 6-6"/></svg></a>
      <p class="gate-foot"><strong>DR PHONE</strong> by hassan bitar</p>
    </div>
  </section>
</main>
<?php
/* ---- Public landing sections ------------------------------------------------
   These sit below the passcode form on the same URL, so a customer arriving with
   the passcode loses nothing — the field is still first and still autofocused —
   while a stranger can scroll and find out who we are and how to get in.
   Figures come from storage/catalog-summary.json, rewritten on every catalog
   save. When that file is missing the numbers are left out rather than made up. */
$lpGroupBlurbs=[
  'Mobile Accessories & Power'=>'Chargers, cables, power banks, holders, converters',
  'Audio & Wearables'=>'Airpods, headphones, speakers, microphones, smart watches',
  'Gaming & Computers'=>'Keyboards, mice, headsets, gaming accessories',
  'Home & Personal Care'=>'Lighting, trimmers, massage, coffee, kitchen',
  'Toys, Lifestyle & Miscellaneous'=>'Toys, bags and everyday lines',
  'Cameras, Security & Projection'=>'IP cameras, action cameras, tripods, gimbals, projectors',
  'Storage, Network & TV'=>'Memory, storage, network gear, TV boxes',
  'Car Electronics'=>'Car chargers, FM transmitters, mounts',
  /* Every category whose group is left as "Other" lands on this card. Reword the
     line to suit whatever ends up there; a group with no line here still renders,
     just without a description. */
  'Other'=>'Tablets and other devices',
];
$lpBrands=['XO','Green Lion','Porodo','Razer','Powerology','HyperX','Jmary','Apple',
           'Samsung','JBL','Anker','HP','Sony','Xiaomi','MeeTion','SanDisk'];
$lpPhone=trim((string)($siteSettings['phone']??''));
$lpWa=preg_replace('/^00/','',preg_replace('/\D/','',$lpPhone));
$lpMap=trim((string)($siteSettings['map_url']??''));
/* "DR PHONE Location" is the placeholder the app ships with. Printing it would
   be worse than printing nothing, so the address waits until it is set. */
$lpPlace=trim((string)($siteSettings['location']??''));
if($lpPlace===''||strcasecmp($lpPlace,'DR PHONE Location')===0)$lpPlace='';
$lpGroups=$lpSummary['groups']??[];
?>
<?php if($lpProducts):?>
<section class="lp-strip" id="stock">
  <div class="lp-shell lp-strip-inner">
    <div><b><?=number_format($lpProducts)?></b><span>products in the catalog</span></div>
    <div><b><?=(int)$lpSummary['categories']?></b><span>categories</span></div>
    <div><b>Trade</b><span>only &mdash; no retail</span></div>
  </div>
</section>
<?php endif;?>

<section class="lp-section"<?=$lpProducts?'':' id="stock"'?>>
  <div class="lp-shell">
    <p class="eyebrow">What we stock</p>
    <h2 class="lp-h2">Every aisle,<br>one supplier.</h2>
    <p class="lp-lead">Phone accessories, audio, gaming, home and car electronics &mdash; held in stock and
      sold to shops, repair counters and resellers.</p>
    <?php if($lpGroups):?>
    <div class="lp-groups">
      <?php foreach($lpGroups as $lpName=>$lpCount):?>
      <article class="lp-group">
        <b><?=(int)$lpCount?></b>
        <h3><?=htmlspecialchars($lpName)?></h3>
        <p><?=htmlspecialchars($lpGroupBlurbs[$lpName]??'')?></p>
      </article>
      <?php endforeach;?>
    </div>
    <?php endif;?>
  </div>
</section>

<section class="lp-section lp-dark">
  <div class="lp-shell">
    <p class="eyebrow lp-eyebrow-light">Brands on the shelf</p>
    <h2 class="lp-h2">Names your customers<br>already ask for.</h2>
    <ul class="lp-brands"><?php foreach($lpBrands as $lpBrand):?><li><?=htmlspecialchars($lpBrand)?></li><?php endforeach;?></ul>
    <p class="lp-note">Stock changes weekly. The live catalog always shows what is actually available.</p>
  </div>
</section>

<section class="lp-section">
  <div class="lp-shell">
    <p class="eyebrow">How it works</p>
    <h2 class="lp-h2">Three steps.</h2>
    <ol class="lp-steps">
      <li><b>01</b><h3>Get your passcode</h3><p>Message us on WhatsApp with your shop name. We send a
        passcode once, and it keeps working.</p></li>
      <li><b>02</b><h3>Browse wholesale prices</h3><p>The full catalog with trade prices, live stock and
        quantity price breaks. Prices are never shown publicly.</p></li>
      <li><b>03</b><h3>Send the order</h3><p>Build the order in the catalog and send it to us on WhatsApp.
        You get a reference and a receipt.</p></li>
    </ol>
  </div>
</section>

<section class="lp-section lp-cta">
  <div class="lp-shell lp-cta-inner">
    <div>
      <p class="eyebrow">Trade accounts</p>
      <h2 class="lp-h2">Want the passcode?</h2>
      <p class="lp-lead">Tell us your shop name and where you are.<?=$lpPlace?' We are at '.htmlspecialchars($lpPlace).'.':''?></p>
    </div>
    <div class="lp-cta-actions">
      <?php if($lpWa):?>
      <a class="lp-wa" href="https://wa.me/<?=htmlspecialchars($lpWa)?>?text=<?=rawurlencode('Hello DR PHONE, I would like a wholesale passcode.')?>">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.04 2a9.9 9.9 0 0 0-8.5 14.9L2 22l5.25-1.38A9.9 9.9 0 1 0 12.04 2Zm5.8 14.1c-.25.7-1.44 1.33-2 1.37-.51.04-1.16.06-1.87-.12a15.6 15.6 0 0 1-6.3-5.35c-.47-.63-1.2-1.77-1.2-2.95s.62-1.75.84-2c.22-.24.48-.3.64-.3h.46c.15 0 .35-.03.54.42.2.48.68 1.66.74 1.78.06.12.1.26.02.42-.34.68-.7.65-.52.96.7 1.2 1.4 1.62 2.46 2.15.18.09.29.08.4-.05.11-.13.46-.54.58-.72.12-.18.24-.15.4-.09.17.06 1.06.5 1.24.6.18.08.3.13.35.2.04.08.04.45-.2 1.15Z"/></svg>
        <?=htmlspecialchars($lpPhone)?></a>
      <?php endif;?>
      <?php if($lpMap):?><a class="lp-map" href="<?=htmlspecialchars($lpMap)?>" target="_blank" rel="noopener">Find us on the map</a><?php endif;?>
    </div>
  </div>
</section>

<footer class="lp-foot">
  <div class="lp-shell lp-foot-inner">
    <span><strong>DR PHONE</strong> &mdash; wholesale only</span>
    <span>Prices are shown to passcode holders only.</span>
  </div>
</footer>
<script nonce="<?=htmlspecialchars(CSP_NONCE)?>">
document.querySelector('.show-password').onclick=function(){var input=document.getElementById('access-password');input.type=input.type==='password'?'text':'password';this.textContent=input.type==='password'?'Show':'Hide'};
</script>
<?php else:?>
<a class="skip-link" href="#content">Skip to catalog</a>
<div id="header-sentinel" aria-hidden="true"></div>
<header class="site-header" id="site-header">
  <div class="header-inner">
    <button id="menu-open" class="icon-btn" aria-label="Open categories"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
    <a class="brand" href="./" aria-label="DR PHONE home"><img class="brand-logo" src="dr-phone-logo.png" alt="Dr. phone"></a>
    <label class="search-wrap">
      <svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/></svg>
      <input id="search" type="search" autocomplete="off" placeholder="Search all products" aria-label="Search products">
      <button id="search-clear" class="search-clear" type="button" aria-label="Clear search" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    </label>
    <a class="contact-pill" href="tel:<?=htmlspecialchars(preg_replace('/[^+\d]/','',(string)$siteSettings['phone']))?>"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h4l2 5-3 2a13 13 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 4 5a2 2 0 0 1 2-2Z"/></svg><span><?=htmlspecialchars((string)$siteSettings['phone'])?></span></a>
    <button id="cart-open" class="cart-trigger" aria-label="Open cart"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h2l2.2 10.4a2 2 0 0 0 2 1.6h7a2 2 0 0 0 2-1.6L21 8H7"/><circle cx="10" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/></svg><span>Cart</span><b id="cart-count">0</b></button>
    <?php if($adminEntry):?><a class="admin-link" href="admin/">Admin</a><?php endif;?>
    <a class="lock-link" href="logout.php" aria-label="Lock catalog"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></a>
  </div>
  <div class="header-rule" aria-hidden="true"></div>
</header>

<main id="content" class="content">
  <div class="skeleton-wrap" aria-busy="true" aria-label="Loading catalog">
    <div class="skeleton skeleton-hero"></div>
    <div class="skeleton-grid">
      <div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div>
      <div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div>
      <div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div>
    </div>
  </div>
</main>

<footer class="site-footer">
  <div class="footer-mark">DR<span>.</span>PHONE</div>
  <p>phones, tech &amp; lots more!</p>
  <span>Prices are listed in <?=htmlspecialchars((string)($siteSettings['currency']??'USD'))?> and may change without prior notice.</span>
</footer>

<aside id="category-menu" class="side-panel" aria-hidden="true" aria-label="Categories">
  <div class="panel-head">
    <div><p class="eyebrow">Browse</p><h2>Categories</h2></div>
    <button class="panel-close" data-close-panel="category-menu" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
  </div>
  <nav id="menu-categories"></nav>
  <div class="menu-contact">
    <a href="<?=htmlspecialchars((string)$siteSettings['map_url'])?>" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg><span><?=htmlspecialchars((string)$siteSettings['location'])?></span></a>
  </div>
</aside>

<aside id="cart-panel" class="side-panel right-panel" aria-hidden="true" aria-label="Your cart">
  <div class="panel-head">
    <div><p class="eyebrow">DR PHONE</p><h2>Your cart</h2></div>
    <button class="panel-close" data-close-panel="cart-panel" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
  </div>
  <div id="cart-content" class="cart-content"></div>
  <div class="cart-footer">
    <button id="cart-clear" class="secondary-button">Clear</button>
    <button id="cart-whatsapp" class="whatsapp-button">WhatsApp</button>
    <button id="cart-print">Export PDF</button>
  </div>
</aside>

<aside id="product-panel" class="side-panel right-panel product-panel" aria-hidden="true" aria-label="Product details">
  <div class="panel-head">
    <div><p class="eyebrow">Product details</p><h2>Choose variations</h2></div>
    <button class="panel-close" data-close-panel="product-panel" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
  </div>
  <div id="product-content" class="product-content"></div>
</aside>

<div id="panel-overlay" class="panel-overlay"></div>
<div id="fly-layer" class="fly-layer" aria-hidden="true"></div>
<button id="scroll-top" class="scroll-top" aria-label="Back to top"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V6M6 12l6-6 6 6"/></svg></button>

<script nonce="<?=htmlspecialchars(CSP_NONCE)?>">window.DR_PHONE={admin:<?=json_encode($admin)?>,phone:<?=json_encode((string)$siteSettings['phone'])?>};</script>
<script src="assets/catalog.js?v=20"></script>
<?php endif;?>
</body>
</html>
