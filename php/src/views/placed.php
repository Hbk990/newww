<?php require_once __DIR__ . '/partials.php'; $noindex = true; ?>
<div class="checkout-done" data-clear-cart="1">
  <div class="done-tick">✓</div>
  <h1>Order <?= e($order['ref']) ?> is with us</h1>
  <p>We have your order saved. Send it on WhatsApp now so we can confirm your address and get it moving — it opens with everything already written out.</p>
  <a class="whatsapp-cta" href="<?= e($whatsapp) ?>" target="_blank" rel="noreferrer">Send my order on WhatsApp</a>
  <p class="checkout-done-note">Total <?= e(money((float)$order['total'])) ?> · Keep your reference <?= e($order['ref']) ?> for when we call.</p>
  <a class="link-button" href="<?= e(url('/')) ?>">Back to the shop</a>
</div>
