<?php require_once __DIR__ . '/partials.php'; $nav = nav_entries($products ?? []); ?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e($title ?? ($settings['storeName'] . ' — ' . $settings['tagline'])) ?></title>
<meta name="description" content="<?= e($metaDescription ?? 'Disposables, e-liquids, machines, coils and nicotine pouches. Order on WhatsApp with delivery across Lebanon.') ?>">
<?php if (!empty($noindex)): ?><meta name="robots" content="noindex"><?php endif ?>
<link rel="icon" href="<?= e(url('/assets/favicon.svg')) ?>">
<link rel="stylesheet" href="<?= e(url('/assets/shop.css')) ?>">
</head>
<body>
<div class="age-gate" id="age-gate" hidden role="dialog" aria-modal="true" aria-labelledby="age-gate-title">
  <div class="age-gate-card">
    <img src="<?= e(url('/assets/huqa-logo.jpeg')) ?>" alt="" width="96" height="96">
    <h2 id="age-gate-title">Are you 18 or older?</h2>
    <p>This shop sells nicotine and tobacco products. You must be at least 18 years old to enter.</p>
    <div class="age-gate-actions">
      <button type="button" class="btn btn-big" id="age-yes">Yes, I am 18 or older</button>
      <a class="btn btn-big btn-outline" href="https://www.google.com">No</a>
    </div>
  </div>
</div>

<header class="shop-header">
  <?php if (($settings['announcement'] ?? '') !== ''): ?>
    <div class="shop-announcement"><?= e($settings['announcement']) ?></div>
  <?php endif ?>
  <div class="shop-header-bar">
    <button type="button" class="icon-button menu-button" aria-label="Open menu" id="menu-open"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg></button>
    <a class="shop-brand" href="<?= e(url('/')) ?>">
      <img src="<?= e(url('/assets/huqa-logo.jpeg')) ?>" alt="" width="42" height="42">
      <span><strong><?= e($settings['storeName']) ?></strong><small><?= e($settings['tagline']) ?></small></span>
    </a>
    <div class="shop-header-search">
      <div class="shop-search">
        <form role="search" action="<?= e(url('/search')) ?>" method="get">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input type="search" name="q" value="<?= e($query ?? '') ?>" placeholder="Search flavours, brands, devices…" aria-label="Search products" autocomplete="off">
        </form>
      </div>
    </div>
    <div class="shop-header-actions">
      <a class="icon-button whatsapp-button" href="https://wa.me/<?= e($settings['whatsapp']) ?>" target="_blank" rel="noreferrer" aria-label="Chat on WhatsApp"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.1A8.4 8.4 0 0 1 12 3.1a8.38 8.38 0 0 1 9 8.4Z"/></svg></a>
      <button type="button" class="cart-button" id="cart-open" aria-label="Open cart"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg><span id="cart-count" hidden>0</span></button>
    </div>
  </div>
  <div class="shop-nav-bar">
    <nav class="shop-nav">
      <?php foreach ($nav as $entry): ?>
        <?php if ($entry['children']): ?>
          <div class="shop-nav-item">
            <button type="button" aria-expanded="false" aria-haspopup="true" data-href="<?= e(url($entry['href'])) ?>"><?= e($entry['label']) ?> ▾</button>
            <div class="shop-nav-drop">
              <a class="shop-nav-all" href="<?= e(url($entry['href'])) ?>">All <?= e(mb_strtolower($entry['label'])) ?></a>
              <?php foreach ($entry['children'] as $child): ?>
                <a href="<?= e(url($child['href'])) ?>"><?= e($child['label']) ?></a>
              <?php endforeach ?>
            </div>
          </div>
        <?php else: ?>
          <a class="shop-nav-link" href="<?= e(url($entry['href'])) ?>"><?= e($entry['label']) ?></a>
        <?php endif ?>
      <?php endforeach ?>
    </nav>
  </div>
</header>

<div class="mobile-drawer" id="mobile-drawer" hidden>
  <div class="mobile-drawer-panel">
    <div class="mobile-drawer-head">
      <strong>Browse <?= e($settings['storeName']) ?></strong>
      <button type="button" class="icon-button" id="menu-close" aria-label="Close menu"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="shop-search mobile-search">
      <form role="search" action="<?= e(url('/search')) ?>" method="get">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input type="search" name="q" placeholder="Search flavours, brands…" aria-label="Search products">
      </form>
    </div>
    <div class="mobile-nav">
      <?php foreach ($nav as $entry): ?>
        <div>
          <a class="mobile-nav-head" href="<?= e(url($entry['href'])) ?>"><?= e($entry['label']) ?></a>
          <?php foreach ($entry['children'] as $child): ?>
            <a class="mobile-nav-child" href="<?= e(url($child['href'])) ?>"><?= e($child['label']) ?></a>
          <?php endforeach ?>
        </div>
      <?php endforeach ?>
    </div>
  </div>
</div>

<main class="shop-main"><?= $content ?></main>

<footer class="shop-footer">
  <div class="shop-footer-grid">
    <div>
      <img class="footer-logo" src="<?= e(url('/assets/huqa-logo.jpeg')) ?>" alt="" width="66" height="66">
      <p class="footer-tag"><?= e($settings['tagline']) ?></p>
    </div>
    <div>
      <h3>Shop</h3>
      <?php foreach ($nav as $entry): ?>
        <a href="<?= e(url($entry['href'])) ?>"><?= e($entry['label']) ?></a>
      <?php endforeach ?>
    </div>
    <div>
      <h3>Reach us</h3>
      <a href="https://wa.me/<?= e($settings['whatsapp']) ?>" target="_blank" rel="noreferrer"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.1A8.4 8.4 0 0 1 12 3.1a8.38 8.38 0 0 1 9 8.4Z"/></svg> <?= e(display_phone($settings['whatsapp'])) ?></a>
      <?php if (($settings['instagram'] ?? '') !== ''): ?>
        <a href="https://instagram.com/<?= e($settings['instagram']) ?>" target="_blank" rel="noreferrer">@<?= e($settings['instagram']) ?></a>
      <?php endif ?>
      <?php if (($settings['address'] ?? '') !== ''): ?><span><?= e($settings['address']) ?></span><?php endif ?>
      <?php if (($settings['hours'] ?? '') !== ''): ?><span><?= e($settings['hours']) ?></span><?php endif ?>
    </div>
  </div>
  <div class="shop-footer-base">
    <span>© <?= date('Y') ?> <?= e($settings['storeName']) ?>. All rights reserved.</span>
    <span class="footer-age">18+ only · Nicotine is an addictive substance</span>
  </div>
</footer>

<div class="cart-drawer" id="cart-drawer" hidden>
  <div class="cart-panel" role="dialog" aria-modal="true" aria-label="Your cart">
    <div class="cart-head">
      <strong>Your cart</strong>
      <button type="button" class="icon-button" id="cart-close" aria-label="Close cart"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="cart-lines" id="cart-lines"></div>
    <div class="cart-foot" id="cart-foot" hidden>
      <div class="cart-total"><span>Subtotal</span><strong id="cart-subtotal">$0.00</strong></div>
      <div class="cart-total cart-total-muted"><span>Delivery</span><strong id="cart-delivery">Free</strong></div>
      <p class="cart-hint" id="cart-hint" hidden></p>
      <div class="cart-total cart-total-grand"><span>Total</span><strong id="cart-grand">$0.00</strong></div>
      <a class="btn btn-big btn-block" id="cart-checkout" href="<?= e(url('/checkout')) ?>">Continue to checkout</a>
    </div>
  </div>
</div>

<script id="catalogue" type="application/json"><?= cart_catalogue($products ?? [], $bundles ?? []) ?></script>
<script>
  window.HUQA = {
    base: <?= json_encode(base_path()) ?>,
    deliveryFee: <?= json_encode((float)$settings['deliveryFee']) ?>,
    freeDeliveryOver: <?= json_encode((float)$settings['freeDeliveryOver']) ?>
  };
</script>
<script src="<?= e(url('/assets/shop.js')) ?>" defer></script>
</body>
</html>
