<?php require_once __DIR__ . '/partials.php'; ?>
<div class="page-head">
  <h1>Bundles &amp; offers</h1>
  <p>Sets we have put together — some discounted, some with something thrown in for free.</p>
</div>
<?php if ($bundles): ?>
  <div class="bundle-grid">
    <?php foreach ($bundles as $bundle) bundle_card($bundle, $products); ?>
  </div>
<?php else: ?>
  <p class="grid-empty">No offers running right now. Check back soon.</p>
<?php endif ?>
