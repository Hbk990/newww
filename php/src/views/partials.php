<?php
declare(strict_types=1);

/** The mega-menu tree. Coil brands come from the catalogue, so it stays current. */
function nav_entries(array $products): array {
    $coilBrands = [];
    foreach ($products as $product) {
        if (($product['category'] ?? '') === 'Coils & accessories / Coils & pods' && ($product['brand'] ?? '') !== '') {
            $coilBrands[$product['brand']] = true;
        }
    }
    $coilBrands = array_keys($coilBrands);
    sort($coilBrands);

    $kinds = array_map(fn($k) => ['label' => $k === 'Shisha' ? 'Shisha flavours' : $k,
                                  'href' => '/shop/disposables?f=' . rawurlencode($k)], disposable_kinds());
    $strengths = array_map(fn($s) => ['label' => $s . ' nicotine',
                                      'href' => '/shop/liquids?f=' . rawurlencode($s)], liquid_strengths());
    $brands = array_map(fn($b) => ['label' => $b, 'href' => '/shop/coils?f=' . rawurlencode($b)], $coilBrands);

    return [
        ['label' => 'Disposables', 'href' => '/shop/disposables', 'children' => $kinds],
        ['label' => 'E-Liquids', 'href' => '/shop/liquids', 'children' => $strengths],
        ['label' => 'Machines', 'href' => '/shop/machines', 'children' => []],
        ['label' => 'Coils & Pods', 'href' => '/shop/coils', 'children' => $brands],
        ['label' => 'Accessories', 'href' => '/shop/accessories', 'children' => []],
        ['label' => 'Pouches', 'href' => '/shop/pouches', 'children' => []],
        ['label' => 'Offers', 'href' => '/bundles', 'children' => []],
        ['label' => 'HUQA Shisha', 'href' => '/huqa', 'children' => []],
    ];
}

function image_src(string $id): string {
    return $id === '' ? '' : url('/image?id=' . rawurlencode($id));
}

function stock_badge(bool $available): string {
    return '<span class="stock-badge' . ($available ? '' : ' stock-badge-out') . '">'
        . ($available ? 'In stock' : 'Out of stock') . '</span>';
}

function product_card(array $product): void {
    $available = in_stock($product);
    $single = count($product['variants']) === 1 ? $product['variants'][0] : null;
    $href = url('/product/' . $product['id']);
    ?>
    <article class="product-card<?= $available ? '' : ' product-card-out' ?>">
      <a class="product-card-media" href="<?= e($href) ?>">
        <?php if ($product['image'] !== ''): ?>
          <img src="<?= e(image_src($product['image'])) ?>" alt="<?= e($product['name']) ?>" loading="lazy">
        <?php else: ?>
          <span class="product-card-blank"><?= e(mb_strtoupper(mb_substr($product['name'], 0, 2))) ?></span>
        <?php endif ?>
        <?= stock_badge($available) ?>
      </a>
      <div class="product-card-body">
        <?php if ($product['brand'] !== ''): ?><p class="product-card-brand"><?= e($product['brand']) ?></p><?php endif ?>
        <h3><a href="<?= e($href) ?>"><?= e($product['name']) ?></a></h3>
        <p class="product-card-meta">
          <?= e(variant_count($product['category'], count($product['variants']))) ?><?php
          if (($product['bottleSize'] ?? '') !== '') echo ' · ' . e($product['bottleSize']); ?>
        </p>
        <div class="product-card-foot">
          <strong><?= e(money((float)$product['price'])) ?></strong>
          <?php if ($single && $available): ?>
            <button type="button" class="btn btn-small" data-add-product="<?= e($product['id']) ?>"
                    data-variant="<?= e($single['id']) ?>">Add</button>
          <?php else: ?>
            <a class="btn btn-small btn-outline" href="<?= e($href) ?>"><?= $available ? 'Choose' : 'View' ?></a>
          <?php endif ?>
        </div>
      </div>
    </article>
    <?php
}

function product_grid(array $products, string $empty = 'Nothing here yet.'): void {
    if (!$products) { echo '<p class="grid-empty">' . e($empty) . '</p>'; return; }
    echo '<div class="product-grid">';
    foreach ($products as $product) product_card($product);
    echo '</div>';
}

function bundle_card(array $bundle, array $products): void {
    $priced = price_bundle($bundle, $products);
    if (!$priced) return;
    $available = bundle_in_stock($priced);
    $saving = round($priced['fullPrice'] - $priced['price'], 2);
    $image = $priced['image'] !== '' ? $priced['image'] : ($priced['lines'][0]['product']['image'] ?? '');
    ?>
    <article class="bundle-card<?= $available ? '' : ' product-card-out' ?>">
      <div class="bundle-card-media">
        <?php if ($image !== ''): ?>
          <img src="<?= e(image_src($image)) ?>" alt="<?= e($priced['name']) ?>" loading="lazy">
        <?php else: ?><span class="product-card-blank">★</span><?php endif ?>
        <?php if ($priced['badge'] !== ''): ?><span class="bundle-badge"><?= e($priced['badge']) ?></span><?php endif ?>
      </div>
      <div class="bundle-card-body">
        <h3><?= e($priced['name']) ?></h3>
        <?php if ($priced['description'] !== ''): ?>
          <p class="bundle-card-text"><?= e($priced['description']) ?></p>
        <?php endif ?>
        <ul class="bundle-contents">
          <?php foreach ($priced['lines'] as $line): ?>
            <li>
              <span><?= e($line['product']['name']) ?> — <?= e(variant_label($line['product'], $line['variant'])) ?></span>
              <em>× <?= (int)$line['quantity'] ?><?= $line['free'] ? ' free' : '' ?></em>
            </li>
          <?php endforeach ?>
        </ul>
        <div class="bundle-card-foot">
          <div class="bundle-price">
            <strong><?= e(money($priced['price'])) ?></strong>
            <?php if ($saving > 0.004): ?>
              <s><?= e(money($priced['fullPrice'])) ?></s>
              <span class="bundle-save">Save <?= e(money($saving)) ?></span>
            <?php endif ?>
          </div>
          <?php if ($available): ?>
            <button type="button" class="btn" data-add-bundle="<?= e($priced['id']) ?>">Add offer</button>
          <?php else: ?>
            <button type="button" class="btn" disabled>Out of stock</button>
          <?php endif ?>
        </div>
      </div>
    </article>
    <?php
}

/** The compact catalogue the cart script prices against in the browser. */
function cart_catalogue(array $products, array $bundles): string {
    $slim = [];
    foreach ($products as $product) {
        $variants = [];
        foreach ($product['variants'] as $variant) {
            $variants[$variant['id']] = [
                'label' => variant_label($product, $variant),
                'available' => !empty($variant['available']),
            ];
        }
        $slim[$product['id']] = [
            'name' => $product['name'],
            'price' => (float)$product['price'],
            'image' => image_src($product['image']),
            'href' => url('/product/' . $product['id']),
            'variants' => $variants,
        ];
    }
    $offers = [];
    foreach ($bundles as $bundle) {
        $priced = price_bundle($bundle, $products);
        if (!$priced) continue;
        $contents = [];
        foreach ($priced['lines'] as $line) {
            $contents[] = $line['product']['name'] . ' — ' . variant_label($line['product'], $line['variant'])
                . ' × ' . $line['quantity'] . ($line['free'] ? ' (free)' : '');
        }
        $offers[$priced['id']] = [
            'name' => $priced['name'],
            'detail' => $priced['badge'] !== '' ? $priced['badge'] : 'Offer',
            'price' => $priced['price'],
            'image' => image_src($priced['image'] !== '' ? $priced['image'] : ($priced['lines'][0]['product']['image'] ?? '')),
            'href' => url('/bundles'),
            'available' => bundle_in_stock($priced),
            'contents' => $contents,
        ];
    }
    return json_encode(['products' => $slim, 'bundles' => $offers], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}
