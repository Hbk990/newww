<div class="admin-head">
  <div>
    <p class="admin-eyebrow">Product management</p>
    <h1>Your inventory</h1>
    <p class="quiet"><?= count($products) ?> product<?= count($products) === 1 ? '' : 's' ?> · manage flavours and availability.</p>
  </div>
  <a class="btn btn-big" href="<?= e(url('/admin/product')) ?>">+ Add product</a>
</div>

<form class="admin-toolbar" method="get" action="<?= e(url('/admin/products')) ?>">
  <label class="search-box">
    <span aria-hidden="true">⌕</span>
    <input name="q" value="<?= e($query) ?>" placeholder="Search products, brands, flavours or categories…" aria-label="Search products">
  </label>
  <select name="category" onchange="this.form.submit()" aria-label="Filter by category">
    <option value="">All categories</option>
    <?php foreach (category_groups() as $group): ?>
      <option value="<?= e($group) ?>"<?= $category === $group ? ' selected' : '' ?>><?= e($group) ?></option>
    <?php endforeach ?>
  </select>
  <button class="btn btn-outline" type="submit">Search</button>
</form>

<?php if ($shown): ?>
  <div class="admin-table-wrap">
    <table class="admin-table">
      <thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th></th></tr></thead>
      <tbody>
      <?php foreach ($shown as $product):
        $available = count(array_filter($product['variants'], fn($v) => !empty($v['available']))); ?>
        <tr>
          <td>
            <a class="table-product" href="<?= e(url('/admin/product?id=' . $product['id'])) ?>">
              <?php if ($product['image'] !== ''): ?>
                <img src="<?= e(url('/image?id=' . $product['image'])) ?>" alt="">
              <?php else: ?><span class="iconbox">▤</span><?php endif ?>
              <span>
                <strong><?= e($product['name']) ?></strong>
                <small><?= e($product['brand'] !== '' ? $product['brand'] : 'No brand') ?><?php
                  if (str_starts_with($product['category'], 'Liquids / ')) echo ' · ' . e($product['bottleSize'] !== '' ? $product['bottleSize'] : 'Size not set'); ?></small>
              </span>
            </a>
          </td>
          <td class="cell-muted"><?= e($product['category']) ?></td>
          <td><?= e(money((float)$product['price'])) ?></td>
          <td><span class="badge<?= $available === 0 ? ' off' : '' ?>"><?= $available ?> / <?= count($product['variants']) ?> in stock</span></td>
          <td class="cell-right"><a class="link-button" href="<?= e(url('/admin/product?id=' . $product['id'])) ?>">Edit</a></td>
        </tr>
      <?php endforeach ?>
      </tbody>
    </table>
  </div>
<?php else: ?>
  <p class="grid-empty"><?= $products ? 'No products matched that search.' : 'No products yet. Add your first one.' ?></p>
<?php endif ?>
