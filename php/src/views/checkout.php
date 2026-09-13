<?php require_once __DIR__ . '/partials.php'; $noindex = true; $old = $old ?? []; ?>
<div class="checkout" id="checkout">
  <div class="page-head">
    <h1>Checkout</h1>
    <p>We deliver across Lebanon. Give us an address we can actually find.</p>
  </div>

  <div class="checkout-empty" id="checkout-empty" hidden>
    <h2>Your cart is empty</h2>
    <p>Pick a few things first and they will show up here.</p>
    <a class="hero-cta" href="<?= e(url('/')) ?>">Browse the shop</a>
  </div>

  <div class="checkout-grid" id="checkout-grid" hidden>
    <form class="checkout-form" method="post" action="<?= e(url('/checkout')) ?>" id="checkout-form">
      <input type="hidden" name="cart" id="cart-field" value="[]">
      <h2>Your details</h2>
      <label class="field">Full name
        <input name="name" required maxlength="80" autocomplete="name" placeholder="How should we greet you?" value="<?= e((string)($old['name'] ?? '')) ?>">
      </label>
      <label class="field">WhatsApp number
        <input name="phone" required maxlength="24" inputmode="tel" autocomplete="tel" placeholder="71 392 434" value="<?= e((string)($old['phone'] ?? '')) ?>">
        <small>We use this to confirm the order — it is how we recognise you next time.</small>
      </label>
      <label class="field">Delivery area
        <select name="area" required>
          <option value="">Choose your area</option>
          <?php foreach (DELIVERY_AREAS as $area): ?>
            <option value="<?= e($area) ?>"<?= ($old['area'] ?? '') === $area ? ' selected' : '' ?>><?= e($area) ?></option>
          <?php endforeach ?>
        </select>
      </label>
      <label class="field">Full address
        <textarea name="address" required rows="4" maxlength="400" placeholder="Street, building, floor, and a landmark that helps the driver find you."><?= e((string)($old['address'] ?? '')) ?></textarea>
      </label>
      <label class="field">Anything else? <span class="field-optional">Optional</span>
        <textarea name="note" rows="2" maxlength="500" placeholder="Delivery time, a second number, a request…"><?= e((string)($old['note'] ?? '')) ?></textarea>
      </label>

      <?php if (!empty($error)): ?><p class="error" role="alert"><?= e($error) ?></p><?php endif ?>
      <p class="error" role="alert" id="stock-warning" hidden>Something in your cart went out of stock. Open the cart and remove it to continue.</p>

      <button type="submit" class="btn btn-big btn-block" id="place-order">Place order</button>
      <p class="checkout-legal">By ordering you confirm you are 18 or older. Your name, number and address are kept so we can deliver and so you do not have to type them again.</p>
    </form>

    <aside class="checkout-summary">
      <h2>Your order</h2>
      <div id="summary-lines"></div>
      <div class="summary-totals">
        <div><span>Subtotal</span><span id="summary-subtotal">$0.00</span></div>
        <div><span>Delivery</span><span id="summary-delivery">Free</span></div>
        <div class="summary-grand"><span>Total</span><span id="summary-total">$0.00</span></div>
      </div>
      <button type="button" class="link-button" id="summary-edit">Edit cart</button>
    </aside>
  </div>
</div>
