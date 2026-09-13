<div class="auth-shell">
  <section class="auth-brand">
    <div>
      <div class="brand-logo"><img src="<?= e(url('/assets/huqa-logo.jpeg')) ?>" alt="HUQA" width="819" height="819"></div>
      <p class="auth-kicker">INVENTORY WORKSPACE</p>
    </div>
    <div class="auth-story">
      <div class="auth-rule"></div>
      <h1>Every product.<br>Every flavour.<br><i>One workspace.</i></h1>
      <p>Keep product details and availability organised in one place.</p>
    </div>
    <p class="auth-foot">Private admin access</p>
  </section>
  <section class="auth-form">
    <h2><?= $setup ? 'Create your admin account' : ($recover ? 'Recover admin access' : 'Welcome back') ?></h2>
    <p class="quiet"><?= $setup
      ? 'This is the only account. Choose a username and a strong password.'
      : ($recover ? 'Enter your recovery code and choose a new login.' : 'Sign in to manage products and orders.') ?></p>

    <?php if (!empty($error)): ?><p class="error" role="alert"><?= e($error) ?></p><?php endif ?>

    <form method="post" action="<?= e(url('/admin')) ?>">
      <?= csrf_field() ?>
      <input type="hidden" name="action" value="<?= $setup ? 'setup' : ($recover ? 'recover' : 'login') ?>">
      <?php if ($recover): ?>
        <label class="field">Recovery code<input name="code" required maxlength="100" autocomplete="off"></label>
      <?php endif ?>
      <label class="field">Username
        <input name="username" required maxlength="40" autocomplete="username" placeholder="Your admin username">
      </label>
      <label class="field">Password
        <input name="password" type="password" required maxlength="128"
               autocomplete="<?= $setup || $recover ? 'new-password' : 'current-password' ?>">
        <?php if ($setup || $recover): ?><small>At least 12 characters.</small><?php endif ?>
      </label>
      <button class="btn btn-big btn-block" type="submit"><?= $setup ? 'Create account' : ($recover ? 'Reset my login' : 'Sign in') ?></button>
    </form>

    <?php if (!$setup): ?>
      <p class="auth-switch">
        <?php if ($recover): ?>
          <a href="<?= e(url('/admin')) ?>">Back to sign in</a>
        <?php else: ?>
          <a href="<?= e(url('/admin?recover=1')) ?>">Forgot your password? Use your recovery code</a>
        <?php endif ?>
      </p>
    <?php endif ?>
    <p class="auth-note"><?= e($settings['storeName'] ?? 'HUQA') ?> · Internal inventory</p>
  </section>
</div>
