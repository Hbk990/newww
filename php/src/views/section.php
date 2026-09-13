<?php
require_once __DIR__ . '/partials.php';
$mine = array_values(array_filter($products, fn($p) => in_array($p['category'], $section['categories'], true)));

$facetOptions = [];
if ($section['facet'] === 'brand') {
    foreach ($mine as $p) if (($p['brand'] ?? '') !== '') $facetOptions[$p['brand']] = true;
    $facetOptions = array_keys($facetOptions); sort($facetOptions);
} elseif ($section['facet'] !== 'none') {
    foreach ($mine as $p) { $sub = sub_of($p['category']); if ($sub !== '') $facetOptions[$sub] = true; }
    $facetOptions = array_keys($facetOptions);
    usort($facetOptions, fn($a, $b) => ((int)$a <=> (int)$b) ?: strcmp($a, $b));
}

$afterFacet = $facet === '' ? $mine : array_values(array_filter($mine, fn($p) =>
    $section['facet'] === 'brand' ? ($p['brand'] ?? '') === $facet : sub_of($p['category']) === $facet));

$brandOptions = [];
if ($section['facet'] !== 'brand') {
    foreach ($afterFacet as $p) if (($p['brand'] ?? '') !== '') $brandOptions[$p['brand']] = true;
    $brandOptions = array_keys($brandOptions); sort($brandOptions);
}

$brand = (string)($_GET['brand'] ?? '');
$stockOnly = ($_GET['stock'] ?? '') === '1';
$sort = (string)($_GET['sort'] ?? 'featured');

$shown = array_values(array_filter($afterFacet, fn($p) =>
    ($brand === '' || ($p['brand'] ?? '') === $brand) && (!$stockOnly || in_stock($p))));

usort($shown, match ($sort) {
    'low' => fn($a, $b) => (float)$a['price'] <=> (float)$b['price'],
    'high' => fn($a, $b) => (float)$b['price'] <=> (float)$a['price'],
    'name' => fn($a, $b) => strcmp($a['name'], $b['name']),
    default => fn($a, $b) => (int)!empty($b['featured']) <=> (int)!empty($a['featured'])
        ?: ($b['updatedAt'] ?? 0) <=> ($a['updatedAt'] ?? 0),
});

// Brand-led shelves stay grouped by brand until a brand is chosen.
$groupByBrand = in_array($section['slug'], ['liquids', 'coils'], true) && $brand === ''
    && ($section['facet'] !== 'brand' || $facet === '');

$link = function (array $changes) use ($section, $facet, $brand, $stockOnly, $sort): string {
    $params = array_filter([
        'f' => $changes['f'] ?? $facet,
        'brand' => $changes['brand'] ?? $brand,
        'stock' => ($changes['stock'] ?? ($stockOnly ? '1' : '')) ?: '',
        'sort' => ($changes['sort'] ?? $sort) === 'featured' ? '' : ($changes['sort'] ?? $sort),
    ], fn($v) => $v !== '' && $v !== null);
    return url('/shop/' . $section['slug']) . ($params ? '?' . http_build_query($params) : '');
};
?>
<div class="page-head">
  <h1><?= e($section['title']) ?></h1>
  <p><?= e($section['blurb']) ?></p>
</div>

<div class="section-view">
  <?php if ($facetOptions): ?>
    <div class="facet-block">
      <p class="facet-label"><?= e($section['facet'] === 'brand' ? 'Brand' : ($section['facet'] === 'strength' ? 'Step 1 — nicotine strength' : 'Type')) ?></p>
      <div class="chip-row">
        <a class="chip<?= $facet === '' ? ' chip-on' : '' ?>" href="<?= e($link(['f' => '', 'brand' => ''])) ?>">All</a>
        <?php foreach ($facetOptions as $option): ?>
          <a class="chip<?= $facet === $option ? ' chip-on' : '' ?>" href="<?= e($link(['f' => $option, 'brand' => ''])) ?>"><?= e($option) ?></a>
        <?php endforeach ?>
      </div>
    </div>
  <?php endif ?>

  <?php if (count($brandOptions) > 1): ?>
    <div class="facet-block">
      <p class="facet-label"><?= e($section['facet'] === 'strength' ? 'Step 2 — brand' : 'Brand') ?></p>
      <div class="chip-row">
        <a class="chip<?= $brand === '' ? ' chip-on' : '' ?>" href="<?= e($link(['brand' => ''])) ?>">All brands</a>
        <?php foreach ($brandOptions as $option): ?>
          <a class="chip<?= $brand === $option ? ' chip-on' : '' ?>" href="<?= e($link(['brand' => $option])) ?>"><?= e($option) ?></a>
        <?php endforeach ?>
      </div>
    </div>
  <?php endif ?>

  <div class="section-toolbar">
    <span class="section-count"><?= count($shown) ?> product<?= count($shown) === 1 ? '' : 's' ?></span>
    <a class="stock-toggle<?= $stockOnly ? ' stock-toggle-on' : '' ?>" href="<?= e($link(['stock' => $stockOnly ? '' : '1'])) ?>">
      <span class="tickbox"><?= $stockOnly ? '✓' : '' ?></span> In stock only
    </a>
    <form class="sort-control" method="get" action="<?= e(url('/shop/' . $section['slug'])) ?>">
      <?php if ($facet !== ''): ?><input type="hidden" name="f" value="<?= e($facet) ?>"><?php endif ?>
      <?php if ($brand !== ''): ?><input type="hidden" name="brand" value="<?= e($brand) ?>"><?php endif ?>
      <?php if ($stockOnly): ?><input type="hidden" name="stock" value="1"><?php endif ?>
      <label for="sort">Sort</label>
      <select id="sort" name="sort" onchange="this.form.submit()">
        <?php foreach (['featured' => 'Featured', 'low' => 'Price: low to high', 'high' => 'Price: high to low', 'name' => 'Name A–Z'] as $value => $label): ?>
          <option value="<?= e($value) ?>"<?= $sort === $value ? ' selected' : '' ?>><?= e($label) ?></option>
        <?php endforeach ?>
      </select>
      <noscript><button class="btn btn-small" type="submit">Apply</button></noscript>
    </form>
  </div>

  <?php if ($groupByBrand && $shown):
    $groups = [];
    foreach ($shown as $p) $groups[($p['brand'] ?? '') !== '' ? $p['brand'] : 'Other'][] = $p;
    ksort($groups);
    foreach ($groups as $name => $items): ?>
      <section class="brand-group"><h2><?= e($name) ?></h2><?php product_grid($items) ?></section>
    <?php endforeach;
  else:
    product_grid($shown, $stockOnly
      ? 'Everything here is out of stock right now — turn off “In stock only” to see it all.'
      : 'Nothing in this section yet.');
  endif ?>
</div>
