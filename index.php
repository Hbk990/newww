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
<title>DR PHONE Mobile Catalog</title>
<meta name="description" content="DR PHONE wholesale product catalog">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23ff0000'/%3E%3Crect x='23' y='14' width='18' height='36' rx='4' fill='%23fff'/%3E%3C/svg%3E">
<link rel="preload" href="assets/fonts/outfit-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="assets/styles.css?v=19">
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
      <p class="gate-foot"><strong>DR PHONE</strong> by hassan bitar</p>
    </div>
  </section>
</main>
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
<script src="assets/catalog.js?v=19"></script>
<?php endif;?>
</body>
</html>
