<div class="admin-head">
  <div>
    <p class="admin-eyebrow">Bundles &amp; offers</p>
    <h1>Your offers</h1>
    <p class="quiet">Group products into deals. Only active offers appear in the shop.</p>
  </div>
  <a class="btn btn-big" href="<?= e(url('/admin/bundle')) ?>">+ New offer</a>
</div>
<?php if ($bundles): ?>
  <div class="admin-list">
    <?php foreach ($bundles as $bundle): $priced = price_bundle($bundle, $products); ?>
      <a class="admin-row" href="<?= e(url('/admin/bundle?id=' . $bundle['id'])) ?>">
        <span class="admin-row-icon"><?php if (($bundle['image'] ?? '') !== ''): ?>
          <img src="<?= e(url('/image?id=' . $bundle['image'])) ?>" alt=""><?php else: ?>★<?php endif ?></span>
        <span class="admin-row-body">
          <strong><?= e($bundle['name']) ?></strong>
          <small><?= count($bundle['items']) ?> item<?= count($bundle['items']) === 1 ? '' : 's' ?><?php
            if ($bundle['badge'] !== '') echo ' · ' . e($bundle['badge']);
            if (!$priced) echo ' · one item is missing'; ?></small>
        </span>
        <?php if ($priced): ?>
          <span class="admin-row-price"><strong><?= e(money($priced['price'])) ?></strong><?php
            if ($priced['fullPrice'] > $priced['price'] + 0.004): ?><s><?= e(money($priced['fullPrice'])) ?></s><?php endif ?></span>
        <?php endif ?>
        <span class="badge<?= !empty($bundle['active']) ? '' : ' off' ?>"><?= !empty($bundle['active']) ? 'Live' : 'Hidden' ?></span>
      </a>
    <?php endforeach ?>
  </div>
<?php else: ?>
  <p class="grid-empty">No offers yet. Create one to show a deal on the shop.</p>
<?php endif ?>
