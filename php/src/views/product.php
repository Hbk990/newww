<?php
require_once __DIR__ . '/partials.php';
$section = section_for($product['category']);
$available = in_stock($product);
$strengths = [];
foreach ($product['variants'] as $v) if (trim($v['strength']) !== '') $strengths[trim($v['strength'])] = true;
$strengths = array_keys($strengths);
$twoAxis = count($strengths) > 1;         // pouches and multi-strength lines pick on two rows
$labels = [];
foreach ($product['variants'] as $v) $labels[$v['label']] = true;
$labels = array_keys($labels);
?>
<nav class="crumbs" aria-label="Breadcrumb">
  <a href="<?= e(url('/')) ?>">Home</a> ›
  <?php if ($section): ?><a href="<?= e(url('/shop/' . $section['slug'])) ?>"><?= e($section['title']) ?></a> › <?php endif ?>
  <span><?= e($product['name']) ?></span>
</nav>

<div class="product-detail" id="buy-box"
     data-product="<?= e($product['id']) ?>"
     data-variants='<?= e(json_encode(array_map(fn($v) => [
        'id' => $v['id'], 'label' => $v['label'], 'strength' => trim($v['strength']), 'available' => !empty($v['available']),
     ], $product['variants']), JSON_UNESCAPED_SLASHES)) ?>'>
  <div class="product-detail-media">
    <?php if ($product['image'] !== ''): ?>
      <img src="<?= e(image_src($product['image'])) ?>" alt="<?= e($product['name']) ?>">
    <?php else: ?>
      <span class="product-card-blank product-card-blank-lg"><?= e(mb_strtoupper(mb_substr($product['name'], 0, 2))) ?></span>
    <?php endif ?>
  </div>
  <div class="product-detail-body">
    <?php if ($product['brand'] !== ''): ?><p class="detail-brand"><?= e($product['brand']) ?></p><?php endif ?>
    <h1><?= e($product['name']) ?></h1>
    <div class="detail-meta">
      <strong class="detail-price"><?= e(money((float)$product['price'])) ?></strong>
      <?= stock_badge($available) ?>
    </div>
    <p class="detail-tags">
      <span><?= e(str_replace(' / ', ' · ', $product['category'])) ?></span>
      <?php if (($product['bottleSize'] ?? '') !== ''): ?><span><?= e($product['bottleSize']) ?></span><?php endif ?>
      <span><?= e(variant_count($product['category'], count($product['variants']))) ?></span>
    </p>

    <div class="buy-box">
      <?php if ($twoAxis): ?>
        <fieldset class="variant-picker">
          <legend>Flavour</legend>
          <div class="chip-row" data-axis="label">
            <?php foreach ($labels as $label):
              $any = false;
              foreach ($product['variants'] as $v) if ($v['label'] === $label && !empty($v['available'])) $any = true; ?>
              <button type="button" class="chip<?= $any ? '' : ' chip-out' ?>" data-value="<?= e($label) ?>"<?= $any ? '' : ' disabled' ?>>
                <?= e($label) ?><?= $any ? '' : ' <small>Out</small>' ?>
              </button>
            <?php endforeach ?>
          </div>
        </fieldset>
        <fieldset class="variant-picker">
          <legend>Strength</legend>
          <div class="chip-row" data-axis="strength">
            <?php foreach ($strengths as $strength): ?>
              <button type="button" class="chip" data-value="<?= e($strength) ?>"><?= e($strength) ?></button>
            <?php endforeach ?>
          </div>
        </fieldset>
      <?php else: ?>
        <fieldset class="variant-picker">
          <legend><?= e(variant_word($product['category'])) ?></legend>
          <div class="chip-row" data-axis="variant">
            <?php foreach ($product['variants'] as $v): ?>
              <button type="button" class="chip<?= !empty($v['available']) ? '' : ' chip-out' ?>" data-variant="<?= e($v['id']) ?>"<?= !empty($v['available']) ? '' : ' disabled' ?>>
                <?= e($v['label']) ?><?php if (trim($v['strength']) !== ''): ?><em><?= e($v['strength']) ?></em><?php endif ?><?= !empty($v['available']) ? '' : ' <small>Out</small>' ?>
              </button>
            <?php endforeach ?>
          </div>
        </fieldset>
      <?php endif ?>

      <div class="buy-row">
        <div class="qty qty-lg">
          <button type="button" data-qty="-1" aria-label="Decrease quantity">−</button>
          <span id="buy-qty">1</span>
          <button type="button" data-qty="1" aria-label="Increase quantity">+</button>
        </div>
        <button type="button" class="btn btn-big btn-grow" id="add-to-cart"<?= $available ? '' : ' disabled' ?>>
          <?= $available ? (count($product['variants']) === 1 ? 'Add to cart' : 'Choose an option') : 'Out of stock' ?>
        </button>
      </div>
      <a class="ask-link" target="_blank" rel="noreferrer"
         href="https://wa.me/<?= e($settings['whatsapp']) ?>?text=<?= e(rawurlencode('Hello! I have a question about ' . $product['name'] . '.')) ?>">
        Ask about this on WhatsApp
      </a>
    </div>

    <?php if ($product['description'] !== ''): ?>
      <div class="detail-description">
        <h2>About this product</h2>
        <p><?= nl2br(e($product['description'])) ?></p>
      </div>
    <?php endif ?>
  </div>
</div>

<?php if ($related): ?>
  <section class="shop-section">
    <div class="section-head"><h2>You might also like</h2></div>
    <?php product_grid($related) ?>
  </section>
<?php endif ?>
