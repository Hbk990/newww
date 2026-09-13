<div class="admin-head">
  <div>
    <p class="admin-eyebrow"><a href="<?= e(url('/admin/customers')) ?>">Customers</a> / <?= e($customer['name']) ?></p>
    <h1><?= e($customer['name']) ?></h1>
    <p class="quiet"><?= e(display_phone($customer['phone'])) ?> · customer since <?= e(date('d M Y', (int)($customer['firstOrderAt'] / 1000))) ?></p>
  </div>
  <a class="btn btn-big" target="_blank" rel="noreferrer" href="https://wa.me/<?= e($customer['phone']) ?>">Message <?= e(explode(' ', $customer['name'])[0]) ?></a>
</div>

<div class="detail-columns">
  <section class="editor-card">
    <h2>Summary</h2>
    <dl class="detail-list">
      <div><dt>Orders</dt><dd><?= (int)$customer['orderCount'] ?></dd></div>
      <div><dt>Spent</dt><dd><?= e(money((float)$customer['totalSpent'])) ?></dd></div>
      <div><dt>Last order</dt><dd><?= e(date('d M Y, H:i', (int)($customer['lastOrderAt'] / 1000))) ?></dd></div>
      <?php if (($customer['lastIp'] ?? '') !== ''): ?><div><dt>Last IP</dt><dd><?= e($customer['lastIp']) ?></dd></div><?php endif ?>
    </dl>
  </section>
  <section class="editor-card">
    <h2>Addresses</h2>
    <?php foreach ($customer['addresses'] ?? [] as $address): ?>
      <p class="address-line"><strong><?= e($address['area']) ?></strong><span><?= e($address['address']) ?></span></p>
    <?php endforeach ?>
  </section>
</div>

<section class="editor-card">
  <h2>Order history</h2>
  <?php foreach ($customer['orders'] ?? [] as $past): ?>
    <div class="summary-line">
      <span class="summary-name">
        <a href="<?= e(url('/admin/order?file=' . rawurlencode($past['file'] ?? ''))) ?>"><strong><?= e($past['ref']) ?></strong></a>
        <small><?= e(date('d M Y, H:i', (int)($past['createdAt'] / 1000))) ?></small>
      </span>
      <span class="summary-price"><?= e(money((float)$past['total'])) ?></span>
    </div>
  <?php endforeach ?>
</section>
