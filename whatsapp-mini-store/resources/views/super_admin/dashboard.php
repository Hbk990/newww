<?php
$formatBytes=static function(int $bytes):string {
    if($bytes>=1073741824)return number_format($bytes/1073741824,2).' GB';
    if($bytes>=1048576)return number_format($bytes/1048576,2).' MB';
    if($bytes>=1024)return number_format($bytes/1024,1).' KB';
    return $bytes.' B';
};
$lifecycle=null;
foreach($system['tasks'] as $task)if($task['task_key']==='subscription_lifecycle'){$lifecycle=$task;break;}
?>
<section>
  <div class="page-heading">
    <div><p class="eyebrow">Super admin</p><h1>Platform overview</h1><p class="muted">Operational aggregates only. Password hashes, reset tokens, and provider secrets are never exposed.</p></div>
    <a class="button secondary" href="/sa/system">System status</a>
  </div>
  <div class="admin-metrics">
    <article><span>Merchants</span><strong><?= e($metrics['merchants']) ?></strong><small><?= e($metrics['new_merchants_30d']) ?> joined in 30 days</small></article>
    <article><span>Stores</span><strong><?= e($metrics['stores']) ?></strong><small><?= e($metrics['active_stores']) ?> active · <?= e($metrics['suspended_stores']) ?> suspended</small></article>
    <article><span>Active subscriptions</span><strong><?= e($metrics['active_subscriptions']) ?></strong><small>Active and trial records</small></article>
    <article><span>Orders</span><strong><?= e($metrics['orders']) ?></strong><small><?= e($metrics['orders_today']) ?> today</small></article>
  </div>
  <div class="admin-financial-grid">
    <section class="panel"><div class="panel-title"><h2>Configured MRR</h2><span>Active paid entitlements</span></div><?php if(!$mrr):?><div class="empty-inline">No active paid subscriptions.</div><?php else:?><div class="money-list"><?php foreach($mrr as $row):?><div><span><?= e($row['currency_code']) ?></span><strong><?= e($row['amount']) ?></strong><small><?= e($row['subscriptions']) ?> subscriptions</small></div><?php endforeach ?></div><?php endif ?><p class="admin-footnote">Configured recurring value is not proof of collected payment.</p></section>
    <section class="panel"><div class="panel-title"><h2>Platform order value</h2><span>Excludes cancelled orders</span></div><?php if(!$orderValue):?><div class="empty-inline">No orders have been created.</div><?php else:?><div class="money-list"><?php foreach($orderValue as $row):?><div><span><?= e($row['currency_code']) ?></span><strong><?= e($row['amount']) ?></strong><small><?= e($row['orders']) ?> orders</small></div><?php endforeach ?></div><?php endif ?></section>
  </div>
  <section class="admin-health-strip" aria-label="Platform health summary">
    <a href="/sa/system"><span class="status-indicator <?= $system['database']['ok']?'ok':'bad' ?>"></span><div><small>Database</small><strong><?= e($system['database']['message']) ?></strong></div></a>
    <a href="/sa/system"><span class="status-indicator <?= $system['https']?'ok':'warn' ?>"></span><div><small>HTTPS</small><strong><?= $system['https']?'Detected':'Not detected' ?></strong></div></a>
    <a href="/sa/system"><div><small>Uploaded assets</small><strong><?= e($formatBytes($system['storage']['uploads']['bytes'])) ?> · <?= e($system['storage']['uploads']['files']) ?> files</strong></div></a>
    <a href="/sa/system"><span class="status-indicator <?= $lifecycle&&in_array($lifecycle['last_status'],['SUCCESS','RUNNING'],true)?'ok':'warn' ?>"></span><div><small>Subscription task</small><strong><?= e($lifecycle['last_status']??'NEVER') ?></strong></div></a>
  </section>
  <div class="admin-split">
    <section class="panel flush"><div class="list-head"><span>Recent merchants</span><a href="/sa/merchants">View all</a></div><?php if(!$recent):?><div class="empty-inline padded">No merchants have registered.</div><?php else:?><div class="admin-list"><?php foreach($recent as $row):?><a href="/sa/merchants/<?= e($row['id']) ?>"><div><strong><?= e($row['name']) ?></strong><small><?= e($row['email']) ?></small></div><span class="badge <?= strtolower($row['status']) ?>"><?= e($row['status']) ?></span></a><?php endforeach ?></div><?php endif ?></section>
    <section class="panel flush"><div class="list-head"><span>Recent orders</span><a href="/sa/stores">Inspect stores</a></div><?php if(!$orders):?><div class="empty-inline padded">No orders have been created.</div><?php else:?><div class="admin-list"><?php foreach($orders as $row):?><a href="/sa/stores/<?= e($row['store_id']) ?>"><div><strong><?= e($row['reference']) ?> · <?= e($row['store_name']) ?></strong><small><?= e($row['customer_name']) ?> · <?= e($row['placed_at']) ?></small></div><span><?= e($row['currency_code']) ?> <?= e($row['total']) ?></span></a><?php endforeach ?></div><?php endif ?></section>
  </div>
</section>
