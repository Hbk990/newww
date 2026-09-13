<div class="admin-head">
  <div>
    <p class="admin-eyebrow">Your people</p>
    <h1>Customers</h1>
    <p class="quiet"><?= count($customers) ?> customer file<?= count($customers) === 1 ? '' : 's' ?>, one per phone number.</p>
  </div>
</div>
<form class="admin-toolbar" method="get" action="<?= e(url('/admin/customers')) ?>">
  <label class="search-box">
    <span aria-hidden="true">⌕</span>
    <input name="q" value="<?= e($query) ?>" placeholder="Search by name, number or address…" aria-label="Search customers">
  </label>
  <button class="btn btn-outline" type="submit">Search</button>
</form>
<?php if ($shown): ?>
  <div class="admin-list">
    <?php foreach ($shown as $customer): ?>
      <a class="admin-row" href="<?= e(url('/admin/customer?phone=' . rawurlencode($customer['phone']))) ?>">
        <span class="admin-row-body">
          <strong><?= e($customer['name']) ?></strong>
          <small><?= e(display_phone($customer['phone'])) ?></small>
        </span>
        <span class="cell-muted"><?= (int)$customer['orderCount'] ?> order<?= (int)$customer['orderCount'] === 1 ? '' : 's' ?></span>
        <strong class="order-total"><?= e(money((float)$customer['totalSpent'])) ?></strong>
        <span class="cell-muted">Last <?= e(date('d M Y', (int)($customer['lastOrderAt'] / 1000))) ?></span>
      </a>
    <?php endforeach ?>
  </div>
<?php else: ?>
  <p class="grid-empty"><?= $customers ? 'Nobody matched that search.' : 'No customer files yet.' ?></p>
<?php endif ?>
