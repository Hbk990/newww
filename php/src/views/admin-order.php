<?php $labels = ['new' => 'New', 'confirmed' => 'Confirmed', 'delivered' => 'Delivered', 'cancelled' => 'Cancelled']; ?>
<div class="admin-head">
  <div>
    <p class="admin-eyebrow"><a href="<?= e(url('/admin/orders')) ?>">Orders</a> / <?= e($order['ref']) ?></p>
    <h1>Order <?= e($order['ref']) ?></h1>
    <p class="quiet"><?= e(date('d M Y, H:i', (int)($order['createdAt'] / 1000))) ?> · <?= e(money((float)$order['total'])) ?></p>
  </div>
  <a class="btn btn-big" target="_blank" rel="noreferrer" href="https://wa.me/<?= e($order['contact']['phone']) ?>">Message <?= e(explode(' ', $order['contact']['name'])[0]) ?></a>
</div>

<div class="detail-columns">
  <section class="editor-card">
    <h2>Customer</h2>
    <dl class="detail-list">
      <div><dt>Name</dt><dd><?= e($order['contact']['name']) ?></dd></div>
      <div><dt>Phone</dt><dd><a href="https://wa.me/<?= e($order['contact']['phone']) ?>" target="_blank" rel="noreferrer"><?= e(display_phone($order['contact']['phone'])) ?></a></dd></div>
      <div><dt>Area</dt><dd><?= e($order['contact']['area']) ?></dd></div>
      <div><dt>Address</dt><dd class="pre-wrap"><?= e($order['contact']['address']) ?></dd></div>
      <?php if (($order['contact']['note'] ?? '') !== ''): ?>
        <div><dt>Note</dt><dd class="pre-wrap"><?= e($order['contact']['note']) ?></dd></div>
      <?php endif ?>
      <?php if (($order['ip'] ?? '') !== ''): ?><div><dt>IP</dt><dd><?= e($order['ip']) ?></dd></div><?php endif ?>
    </dl>
    <p class="quiet">Saved as <code><?= e($order['file']) ?></code></p>
  </section>

  <section class="editor-card">
    <h2>Items</h2>
    <?php foreach ($order['lines'] as $line): ?>
      <div class="summary-line">
        <span class="summary-qty"><?= (int)$line['quantity'] ?>×</span>
        <span class="summary-name">
          <strong><?= e($line['name']) ?></strong>
          <?php if (($line['detail'] ?? '') !== ''): ?><small><?= e($line['detail']) ?></small><?php endif ?>
          <?php foreach ($line['contents'] ?? [] as $content): ?><small><?= e($content) ?></small><?php endforeach ?>
        </span>
        <span class="summary-price"><?= e(money((float)$line['total'])) ?></span>
      </div>
    <?php endforeach ?>
    <div class="summary-totals">
      <div><span>Subtotal</span><span><?= e(money((float)$order['subtotal'])) ?></span></div>
      <div><span>Delivery</span><span><?= (float)$order['deliveryFee'] > 0 ? e(money((float)$order['deliveryFee'])) : 'Free' ?></span></div>
      <div class="summary-grand"><span>Total</span><span><?= e(money((float)$order['total'])) ?></span></div>
    </div>
  </section>
</div>

<section class="editor-card">
  <h2>Status</h2>
  <form method="post" action="<?= e(url('/admin/order/status')) ?>" class="status-form">
    <?= csrf_field() ?>
    <input type="hidden" name="file" value="<?= e($order['file']) ?>">
    <input type="hidden" name="_back" value="/order?file=<?= e(rawurlencode($order['file'])) ?>">
    <div class="chip-row">
      <?php foreach (ORDER_STATUSES as $value): ?>
        <button class="chip<?= $order['status'] === $value ? ' chip-on' : '' ?>" name="status" value="<?= e($value) ?>"
                type="submit"<?= $order['status'] === $value ? ' disabled' : '' ?>><?= e($labels[$value]) ?></button>
      <?php endforeach ?>
    </div>
  </form>
</section>
