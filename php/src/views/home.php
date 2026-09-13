<?php require_once __DIR__ . '/partials.php'; ?>
<section class="hero">
  <div class="hero-inner">
    <p class="hero-eyebrow"><?= e($settings['tagline'] !== '' ? $settings['tagline'] : 'Arguileh & Vapes') ?></p>
    <h1>Everything you vape,<br>delivered across Lebanon.</h1>
    <p class="hero-text">Disposables, e-liquids, machines, coils and pouches — picked in a few taps and sent straight to our WhatsApp. No account, no checkout forms you will regret.</p>
    <div class="hero-actions">
      <a class="hero-cta" href="<?= e(url('/shop/disposables')) ?>">Start shopping →</a>
      <a class="hero-cta hero-cta-ghost" href="<?= e(url('/huqa')) ?>">HUQA Shisha</a>
    </div>
  </div>
</section>

<section class="shop-section">
  <div class="section-head"><h2>Browse the shop</h2><p>Six shelves, everything in its place.</p></div>
  <div class="category-grid">
    <?php foreach (sections() as $section):
      $count = count(array_filter($products, fn($p) => in_array($p['category'], $section['categories'], true))); ?>
      <a class="category-tile" href="<?= e(url('/shop/' . $section['slug'])) ?>">
        <div><h3><?= e($section['title']) ?></h3><p><?= e($section['blurb']) ?></p></div>
        <span><?= $count ?> product<?= $count === 1 ? '' : 's' ?> →</span>
      </a>
    <?php endforeach ?>
  </div>
</section>

<?php if ($bundles): ?>
<section class="shop-section">
  <div class="section-head"><h2>Bundles &amp; offers</h2><a class="section-more" href="<?= e(url('/bundles')) ?>">All offers →</a></div>
  <div class="bundle-grid">
    <?php foreach (array_slice($bundles, 0, 3) as $bundle) bundle_card($bundle, $products); ?>
  </div>
</section>
<?php endif ?>

<section class="shop-section">
  <div class="section-head"><h2><?= e($shelfTitle) ?></h2></div>
  <?php product_grid($shelf, 'Products are on their way.') ?>
</section>

<?php if ($huqa): ?>
<section class="huqa-band">
  <div>
    <p class="hero-eyebrow">Our own line</p>
    <h2>HUQA Shisha</h2>
    <p>Blended and packed under our own name — the flavours our regulars keep coming back for.
       <?= count($huqa) ?> product<?= count($huqa) === 1 ? '' : 's' ?> from <?= e(money(min(array_map(fn($p) => (float)$p['price'], $huqa)))) ?>.</p>
    <a class="hero-cta" href="<?= e(url('/huqa')) ?>">Meet the range →</a>
  </div>
  <?php if (($huqa[0]['image'] ?? '') !== ''): ?>
    <img src="<?= e(image_src($huqa[0]['image'])) ?>" alt="" loading="lazy">
  <?php endif ?>
</section>
<?php endif ?>

<section class="promise-strip">
  <div><h3>Delivery across Lebanon</h3><p><?php
    if ((float)$settings['freeDeliveryOver'] > 0) echo 'Free over ' . e(money((float)$settings['freeDeliveryOver'])) . '. Flat ' . e(money((float)$settings['deliveryFee'])) . ' otherwise.';
    elseif ((float)$settings['deliveryFee'] > 0) echo 'Flat ' . e(money((float)$settings['deliveryFee'])) . ' anywhere we reach.';
    else echo 'We deliver to every area we cover.'; ?></p></div>
  <div><h3>Order on WhatsApp</h3><p>Build your cart here, confirm in one message. We reply fast.</p></div>
  <div><h3>Only the real thing</h3><p>Authentic devices and liquids. 18+ only.</p></div>
</section>
