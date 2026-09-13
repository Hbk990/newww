<div class="admin-head">
  <div>
    <p class="admin-eyebrow">Storefront</p>
    <h1>Storefront</h1>
    <p class="quiet">What customers see, how they reach you, and what delivery costs.</p>
  </div>
</div>

<form class="editor" method="post" action="<?= e(url('/admin/settings/save')) ?>">
  <?= csrf_field() ?>
  <input type="hidden" name="_back" value="/settings">

  <label class="publish-row<?= !empty($settings['published']) ? ' publish-on' : '' ?>">
    <div>
      <strong><?= !empty($settings['published']) ? 'Your shop is live' : 'Your shop is hidden' ?></strong>
      <p><?= !empty($settings['published'])
        ? 'Customers can browse and order right now.'
        : 'Visitors see a “coming soon” page until you switch this on.' ?></p>
    </div>
    <input type="checkbox" name="published" value="1"<?= !empty($settings['published']) ? ' checked' : '' ?>>
  </label>

  <section class="editor-card">
    <h2>Shop identity</h2>
    <div class="editor-fields">
      <label class="field">Shop name<input name="storeName" required maxlength="80" value="<?= e($settings['storeName']) ?>"></label>
      <label class="field">Tagline<input name="tagline" maxlength="160" value="<?= e($settings['tagline']) ?>" placeholder="Arguileh &amp; Vapes"></label>
      <label class="field">Announcement bar <span class="field-optional">Optional</span>
        <input name="announcement" maxlength="200" value="<?= e($settings['announcement']) ?>" placeholder="Free delivery in Beirut this week">
      </label>
    </div>
  </section>

  <section class="editor-card">
    <h2>Contact</h2>
    <div class="editor-fields">
      <label class="field">WhatsApp number
        <input name="whatsapp" required maxlength="24" inputmode="tel" value="<?= e($settings['whatsapp']) ?>" placeholder="96171392434">
        <small>International format, digits only. Orders arrive here.</small>
      </label>
      <label class="field">Instagram handle <span class="field-optional">Optional</span><input name="instagram" maxlength="60" value="<?= e($settings['instagram']) ?>" placeholder="huqa.lb"></label>
      <label class="field">Address <span class="field-optional">Optional</span><input name="address" maxlength="200" value="<?= e($settings['address']) ?>"></label>
      <label class="field">Opening hours <span class="field-optional">Optional</span><input name="hours" maxlength="120" value="<?= e($settings['hours']) ?>" placeholder="Every day, 10:00 – 23:00"></label>
    </div>
  </section>

  <section class="editor-card">
    <h2>Delivery</h2>
    <div class="field-grid">
      <label class="field">Delivery fee (USD)
        <input name="deliveryFee" type="number" min="0" max="1000" step="0.01" inputmode="decimal" value="<?= e((string)$settings['deliveryFee']) ?>">
      </label>
      <label class="field">Free delivery over (USD)
        <input name="freeDeliveryOver" type="number" min="0" max="100000" step="0.01" inputmode="decimal" value="<?= e((string)$settings['freeDeliveryOver']) ?>">
        <small>Set 0 to always charge the fee.</small>
      </label>
    </div>
  </section>

  <div class="editor-actions"><button class="btn btn-big" type="submit">Save storefront</button></div>
</form>
