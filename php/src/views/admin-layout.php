<?php $counts = []; foreach (category_groups() as $g) $counts[$g] = count(array_filter($products, fn($p) => str_starts_with($p['category'], $g))); ?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title><?= e($title) ?> · <?= e($settings['storeName']) ?> admin</title>
<link rel="icon" href="<?= e(url('/assets/favicon.svg')) ?>">
<link rel="stylesheet" href="<?= e(url('/assets/shop.css')) ?>">
<link rel="stylesheet" href="<?= e(url('/assets/admin.css')) ?>">
</head>
<body class="admin-body">
<aside class="admin-side">
  <div class="admin-brand">
    <img src="<?= e(url('/assets/huqa-logo.jpeg')) ?>" alt="" width="54" height="54">
    <span>INVENTORY<br>WORKSPACE</span>
  </div>
  <nav class="admin-nav">
    <p class="admin-nav-label">Workspace</p>
    <a href="<?= e(url('/admin/products')) ?>" class="<?= ($section ?? '') === 'products' ? 'is-active' : '' ?>">Inventory <span><?= count($products) ?></span></a>
    <a href="<?= e(url('/admin/bundles')) ?>" class="<?= ($section ?? '') === 'bundles' ? 'is-active' : '' ?>">Bundles &amp; offers <span><?= count($bundles) ?></span></a>
    <a href="<?= e(url('/admin/orders')) ?>" class="<?= ($section ?? '') === 'orders' ? 'is-active' : '' ?>">Orders</a>
    <a href="<?= e(url('/admin/customers')) ?>" class="<?= ($section ?? '') === 'customers' ? 'is-active' : '' ?>">Customers</a>

    <p class="admin-nav-label">Categories</p>
    <?php foreach ($counts as $group => $count): ?>
      <a href="<?= e(url('/admin/products?category=' . rawurlencode($group))) ?>"><?= e($group) ?> <span><?= $count ?></span></a>
    <?php endforeach ?>
  </nav>
  <div class="admin-side-foot">
    <a href="<?= e(url('/admin/settings')) ?>" class="<?= ($section ?? '') === 'settings' ? 'is-active' : '' ?>">Storefront<?= empty($settings['published']) ? ' <span class="tag-hidden">Hidden</span>' : '' ?></a>
    <a href="<?= e(url('/admin/account')) ?>" class="<?= ($section ?? '') === 'account' ? 'is-active' : '' ?>">Admin account</a>
    <a href="<?= e(url('/')) ?>" target="_blank" rel="noreferrer">View the shop ↗</a>
    <form method="post" action="<?= e(url('/admin/logout')) ?>"><?= csrf_field() ?><button type="submit">Sign out</button></form>
    <div class="admin-who"><span><?= e(mb_strtoupper(mb_substr((string)$admin, 0, 1))) ?></span><div><strong><?= e((string)$admin) ?></strong><small>Administrator</small></div></div>
  </div>
</aside>
<main class="admin-main">
  <?php if (!empty($flash)): ?><p class="admin-flash"><?= e($flash) ?></p><?php endif ?>
  <?= $content ?>
</main>
<script src="<?= e(url('/assets/admin.js')) ?>" defer></script>
</body>
</html>
