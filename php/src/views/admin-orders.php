<?php
$labels = ['new' => 'New', 'confirmed' => 'Confirmed', 'delivered' => 'Delivered', 'cancelled' => 'Cancelled'];
$counts = array_fill_keys(ORDER_STATUSES, 0);
foreach ($orders as $order) if (isset($counts[$order['status']])) $counts[$order['status']]++;
?>
<div class="admin-head">
  <div>
    <p class="admin-eyebrow">Customer orders</p>
    <h1>Orders</h1>
    <p class="quiet"><?= count($orders) ?> order<?= count($orders) === 1 ? '' : 's' ?> · <?= $counts['new'] ?> waiting to be confirmed.</p>
  </div>
</div>

<form class="admin-toolbar" method="get" action="<?= e(url('/admin/orders')) ?>">
  <label class="search-box">
    <span aria-hidden="true">⌕</span>
    <input name="q" value="<?= e($query) ?>" placeholder="Search by reference, name, number or address…" aria-label="Search orders">
  </label>
  <?php if ($status !== ''): ?><input type="hidden" name="status" value="<?= e($status) ?>"><?php endif ?>
  <button class="btn btn-outline" type="submit">Search</button>
</form>

<div class="chip-row admin-chips">
  <a class="chip<?= $status === '' ? ' chip-on' : '' ?>" href="<?= e(url('/admin/orders' . ($query !== '' ? '?q=' . rawurlencode($query) : ''))) ?>">All <?= count($orders) ?></a>
  <?php foreach (ORDER_STATUSES as $value): ?>
    <a class="chip<?= $status === $value ? ' chip-on' : '' ?>"
       href="<?= e(url('/admin/orders?status=' . $value . ($query !== '' ? '&q=' . rawurlencode($query) : ''))) ?>"><?= e($labels[$value]) ?> <?= $counts[$value] ?></a>
  <?php endforeach ?>
</div>

<?php if ($shown): ?>
  <div class="admin-list">
    <?php foreach ($shown as $order):
      $items = array_sum(array_column($order['lines'], 'quantity')); ?>
      <a class="admin-row" href="<?= e(url('/admin/order?file=' . rawurlencode($order['file']))) ?>">
        <span class="order-ref"><?= e($order['ref']) ?><small><?= e(date('d M Y, H:i', (int)($order['createdAt'] / 1000))) ?></small></span>
        <span class="admin-row-body">
          <strong><?= e($order['contact']['name']) ?></strong>
          <small><?= e(display_phone($order['contact']['phone'])) ?> · <?= e($order['contact']['area']) ?></small>
        </span>
        <span class="cell-muted"><?= $items ?> item<?= $items === 1 ? '' : 's' ?></span>
        <strong class="order-total"><?= e(money((float)$order['total'])) ?></strong>
        <span class="badge status-<?= e($order['status']) ?>"><?= e($labels[$order['status']] ?? $order['status']) ?></span>
      </a>
    <?php endforeach ?>
  </div>
<?php else: ?>
  <p class="grid-empty"><?= $orders ? 'No orders match that filter.' : 'No orders yet. They appear here the moment a customer checks out.' ?></p>
<?php endif ?>
