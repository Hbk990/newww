<?php $products = $products ?? []; $bundles = $bundles ?? []; ?>
<div class="page-head">
  <h1><?= e($title) ?></h1>
  <p><?= e($message) ?></p>
  <p><a class="hero-cta" href="<?= e(url('/')) ?>">Back to the shop</a></p>
</div>
