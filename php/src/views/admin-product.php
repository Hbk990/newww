<?php $variants = $product['variants'] ?? [['id' => '', 'label' => '', 'strength' => '', 'available' => true]]; ?>
<div class="admin-head">
  <div>
    <p class="admin-eyebrow"><a href="<?= e(url('/admin/products')) ?>">Inventory</a> / Product editor</p>
    <h1><?= $product ? 'Edit product' : 'New product' ?></h1>
  </div>
</div>

<form class="editor" method="post" enctype="multipart/form-data" action="<?= e(url('/admin/product/save')) ?>">
  <?= csrf_field() ?>
  <input type="hidden" name="_back" value="/product<?= $product ? '?id=' . e($product['id']) : '' ?>">
  <?php if ($product): ?><input type="hidden" name="id" value="<?= e($product['id']) ?>"><?php endif ?>

  <section class="editor-card">
    <h2><span class="section-number">01</span> Product details</h2>
    <div class="editor-fields">
      <label class="field">Product name
        <input name="name" required maxlength="150" value="<?= e($product['name'] ?? '') ?>" placeholder="Give your product a name">
      </label>
      <label class="field">Price (USD)
        <input name="price" required type="number" min="0" max="1000000" step="0.01" inputmode="decimal"
               value="<?= e(isset($product['price']) ? (string)$product['price'] : '') ?>" placeholder="e.g. 12.50">
      </label>
      <label class="field">Category
        <select name="category" id="category" required>
          <?php foreach (array_merge(CATEGORIES, LEGACY_CATEGORIES) as $option): ?>
            <option value="<?= e($option) ?>"<?= ($product['category'] ?? '') === $option ? ' selected' : '' ?>><?= e($option) ?></option>
          <?php endforeach ?>
        </select>
      </label>
      <label class="field" id="bottle-field" hidden>Bottle size
        <select name="bottleSize">
          <option value="">Choose a size</option>
          <?php foreach (BOTTLE_SIZES as $size): ?>
            <option value="<?= e($size) ?>"<?= ($product['bottleSize'] ?? '') === $size ? ' selected' : '' ?>><?= e($size) ?></option>
          <?php endforeach ?>
        </select>
      </label>
      <label class="field">Brand <span class="field-optional">Optional</span>
        <input name="brand" maxlength="100" value="<?= e($product['brand'] ?? '') ?>" placeholder="Enter brand name">
      </label>
      <label class="field">Description <span class="field-optional">Optional</span>
        <textarea name="description" rows="3" maxlength="3000"><?= e($product['description'] ?? '') ?></textarea>
      </label>
      <label class="switch-row">
        <input type="checkbox" name="featured" value="1"<?= !empty($product['featured']) ? ' checked' : '' ?>>
        <span><strong>Feature on the home page</strong><small>Featured products fill the “Picked for you” shelf.</small></span>
      </label>
    </div>
  </section>

  <section class="editor-card">
    <h2><span class="section-number">02</span> Product photo</h2>
    <?php if (($product['image'] ?? '') !== ''): ?>
      <img class="editor-photo" src="<?= e(url('/image?id=' . $product['image'])) ?>" alt="Current photo">
      <label class="switch-row"><input type="checkbox" name="removeImage" value="1"><span><strong>Remove this photo</strong></span></label>
    <?php endif ?>
    <label class="field">Upload a photo <span class="field-optional">JPG, PNG or WebP · max 5 MB</span>
      <input type="file" name="photo" accept="image/png,image/jpeg,image/webp">
    </label>
  </section>

  <section class="editor-card">
    <div class="editor-card-head">
      <h2><span class="section-number">03</span> Flavours &amp; availability</h2>
      <button type="button" class="btn btn-small btn-outline" id="add-variant">+ Add flavour</button>
    </div>
    <div id="variant-rows">
      <?php foreach ($variants as $i => $variant): ?>
        <div class="variant-row">
          <input type="hidden" name="variants[<?= $i ?>][id]" value="<?= e($variant['id'] ?? '') ?>">
          <label class="field">Name
            <input name="variants[<?= $i ?>][label]" maxlength="120" value="<?= e($variant['label'] ?? '') ?>" placeholder="Flavour, colour or option">
          </label>
          <label class="field">Strength <span class="field-optional">Optional</span>
            <input name="variants[<?= $i ?>][strength]" maxlength="30" value="<?= e($variant['strength'] ?? '') ?>" placeholder="50mg">
          </label>
          <label class="switch-row switch-inline">
            <input type="checkbox" name="variants[<?= $i ?>][available]" value="1"<?= !empty($variant['available']) ? ' checked' : '' ?>>
            <span>In stock</span>
          </label>
          <button type="button" class="btn btn-small btn-ghost remove-variant" aria-label="Remove this flavour">Remove</button>
        </div>
      <?php endforeach ?>
    </div>
    <p class="quiet">Leave a name blank to drop that row. Availability is per flavour.</p>
  </section>

  <div class="editor-actions">
    <a class="btn btn-outline" href="<?= e(url('/admin/products')) ?>">Cancel</a>
    <button class="btn btn-big" type="submit">Save product</button>
  </div>
</form>

<?php if ($product): ?>
  <form class="danger-zone" method="post" action="<?= e(url('/admin/product/delete')) ?>"
        onsubmit="return confirm('Delete <?= e(addslashes($product['name'])) ?>? This cannot be undone.')">
    <?= csrf_field() ?>
    <input type="hidden" name="id" value="<?= e($product['id']) ?>">
    <button class="btn btn-danger" type="submit">Delete this product</button>
  </form>
<?php endif ?>
