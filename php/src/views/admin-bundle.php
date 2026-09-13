<?php
$rows = [];
foreach ($products as $product) {
    foreach ($product['variants'] as $variant) {
        $rows[] = ['productId' => $product['id'], 'variantId' => $variant['id'],
                   'label' => $product['name'] . ' — ' . variant_label($product, $variant),
                   'price' => (float)$product['price']];
    }
}
?>
<div class="admin-head">
  <div>
    <p class="admin-eyebrow"><a href="<?= e(url('/admin/bundles')) ?>">Offers</a> / Offer editor</p>
    <h1><?= $bundle ? 'Edit offer' : 'New offer' ?></h1>
  </div>
</div>

<form class="editor" method="post" enctype="multipart/form-data" action="<?= e(url('/admin/bundle/save')) ?>" id="bundle-form">
  <?= csrf_field() ?>
  <input type="hidden" name="_back" value="/bundle<?= $bundle ? '?id=' . e($bundle['id']) : '' ?>">
  <?php if ($bundle): ?><input type="hidden" name="id" value="<?= e($bundle['id']) ?>"><?php endif ?>
  <input type="hidden" name="items" id="items-field" value="<?= e(json_encode($bundle['items'] ?? [])) ?>">

  <section class="editor-card">
    <h2><span class="section-number">01</span> The offer</h2>
    <div class="editor-fields">
      <label class="field">Offer name<input name="name" required maxlength="120" value="<?= e($bundle['name'] ?? '') ?>" placeholder="e.g. Two bars, one free"></label>
      <label class="field">Badge <span class="field-optional">Optional</span><input name="badge" maxlength="40" value="<?= e($bundle['badge'] ?? '') ?>" placeholder="BUY 2 GET 1 FREE"></label>
      <label class="field">Description <span class="field-optional">Optional</span><textarea name="description" rows="2" maxlength="1000"><?= e($bundle['description'] ?? '') ?></textarea></label>
      <?php if (($bundle['image'] ?? '') !== ''): ?>
        <img class="editor-photo" src="<?= e(url('/image?id=' . $bundle['image'])) ?>" alt="">
        <label class="switch-row"><input type="checkbox" name="removeImage" value="1"><span><strong>Remove this photo</strong></span></label>
      <?php endif ?>
      <label class="field">Photo <span class="field-optional">Optional — falls back to the first product's</span>
        <input type="file" name="photo" accept="image/png,image/jpeg,image/webp">
      </label>
      <label class="switch-row">
        <input type="checkbox" name="active" value="1"<?= !empty($bundle['active']) || $bundle === null ? ' checked' : '' ?>>
        <span><strong>Show in the shop</strong><small>Hidden offers stay saved but customers cannot order them.</small></span>
      </label>
    </div>
  </section>

  <section class="editor-card">
    <div class="editor-card-head">
      <h2><span class="section-number">02</span> What is inside</h2>
      <button type="button" class="btn btn-small btn-outline" id="add-item">+ Add item</button>
    </div>
    <div id="item-rows" data-options='<?= e(json_encode($rows, JSON_UNESCAPED_SLASHES)) ?>'></div>
    <p class="quiet">Pick the exact flavour that ships. Mark an item free for a buy-two-get-one deal.</p>
  </section>

  <section class="editor-card">
    <h2><span class="section-number">03</span> Pricing</h2>
    <div class="mode-row">
      <?php foreach ([
        ['items', 'Free item', 'The customer pays for the items you did not mark free.'],
        ['percent', 'Percent off', 'A percentage off the full price of everything inside.'],
        ['fixed', 'Fixed price', 'One price for the whole bundle.'],
      ] as [$value, $label, $hint]): ?>
        <label class="mode-option<?= ($bundle['mode'] ?? 'items') === $value ? ' mode-on' : '' ?>">
          <input type="radio" name="mode" value="<?= e($value) ?>"<?= ($bundle['mode'] ?? 'items') === $value ? ' checked' : '' ?>>
          <strong><?= e($label) ?></strong><small><?= e($hint) ?></small>
        </label>
      <?php endforeach ?>
    </div>
    <label class="field" id="value-field">Discount or price
      <input name="value" type="number" min="0" step="0.01" inputmode="decimal" value="<?= e((string)($bundle['value'] ?? '0')) ?>">
      <small id="value-hint">Percent off, or the flat bundle price.</small>
    </label>
    <p class="price-preview" id="price-preview"></p>
  </section>

  <div class="editor-actions">
    <a class="btn btn-outline" href="<?= e(url('/admin/bundles')) ?>">Cancel</a>
    <button class="btn btn-big" type="submit">Save offer</button>
  </div>
</form>

<?php if ($bundle): ?>
  <form class="danger-zone" method="post" action="<?= e(url('/admin/bundle/delete')) ?>"
        onsubmit="return confirm('Delete this offer?')">
    <?= csrf_field() ?>
    <input type="hidden" name="id" value="<?= e($bundle['id']) ?>">
    <button class="btn btn-danger" type="submit">Delete this offer</button>
  </form>
<?php endif ?>
