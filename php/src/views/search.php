<?php require_once __DIR__ . '/partials.php'; $noindex = true; ?>
<div class="page-head">
  <h1>Results for “<?= e($query) ?>”</h1>
  <?php if ($query === ''): ?>
    <p>Type a brand, flavour or device in the bar above.</p>
  <?php elseif ($effective !== $query): ?>
    <p>Nothing matched that spelling, so we searched for <strong><?= e($effective) ?></strong> instead.
       <a href="<?= e(url('/search?q=' . rawurlencode($query) . '&exact=1')) ?>">Search “<?= e($query) ?>” anyway</a></p>
  <?php else: ?>
    <p><?= count($results) + count($offers) ?> match<?= count($results) + count($offers) === 1 ? '' : 'es' ?>.</p>
  <?php endif ?>
</div>
<?php if ($offers): ?>
  <section class="shop-section">
    <div class="section-head"><h2>Offers</h2></div>
    <div class="bundle-grid"><?php foreach ($offers as $bundle) bundle_card($bundle, $products); ?></div>
  </section>
<?php endif ?>
<?php if ($query !== '') product_grid($results, 'No products matched. Try a brand or a flavour name.'); ?>
