<div class="admin-head">
  <div>
    <p class="admin-eyebrow">Admin account</p>
    <h1>Your login</h1>
    <p class="quiet">This is the only account that can reach the admin.</p>
  </div>
</div>

<?php if (!empty($recovery)): ?>
  <section class="editor-card recovery-card">
    <h2>Save your recovery code</h2>
    <p class="quiet">Keep this somewhere safe. It is the only way back in if you forget your password, and it is shown once.</p>
    <code class="recovery-code"><?= e($recovery) ?></code>
  </section>
<?php endif ?>

<form class="editor" method="post" action="<?= e(url('/admin/account/save')) ?>">
  <?= csrf_field() ?>
  <input type="hidden" name="_back" value="/account">
  <section class="editor-card">
    <h2>Change username or password</h2>
    <div class="editor-fields">
      <label class="field">Current password<input name="currentPassword" type="password" required maxlength="128" autocomplete="current-password"></label>
      <label class="field">Username<input name="username" required maxlength="40" value="<?= e((string)$admin) ?>" autocomplete="username"></label>
      <label class="field">New password<input name="password" type="password" required maxlength="128" autocomplete="new-password"><small>At least 12 characters.</small></label>
    </div>
    <div class="editor-actions"><button class="btn btn-big" type="submit">Update login</button></div>
  </section>
</form>

<section class="editor-card">
  <h2>Where your data lives</h2>
  <p class="quiet">Everything is plain files on this server, inside the <code>data</code> folder:</p>
  <ul class="plain-list">
    <li><code>products.json</code> and <code>bundles.json</code> — your catalogue</li>
    <li><code>orders/</code> — one file per order</li>
    <li><code>customers/</code> — one file per customer, named by phone number</li>
    <li><code>images/</code> — product photos</li>
  </ul>
  <p class="quiet">Download that folder now and then over FTP — that is your backup.</p>
</section>
