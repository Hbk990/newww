<section class="onboarding">
    <header>
        <p class="eyebrow">Store setup</p>
        <h1>Build your first storefront</h1>
        <p class="muted">Your store begins as a private draft. You can publish it after adding products in a later phase.</p>
    </header>
    <ol class="progress" aria-label="Setup steps">
        <li>Account</li><li class="active">Business</li><li>WhatsApp</li><li>Region</li>
        <li>Currency</li><li>Address</li><li>Appearance</li><li>Create</li>
    </ol>
    <form method="post" action="/onboarding" class="panel form-grid">
        <?= csrf_field() ?>
        <label class="full">Business name<input name="business_name" value="<?= e(old('business_name')) ?>" required maxlength="120"></label>
        <label>WhatsApp number<input name="whatsapp_number" value="<?= e(old('whatsapp_number')) ?>" placeholder="+96171123456" inputmode="tel" required><small>Include the country code.</small></label>
        <label>Country<select name="country_code" required><option value="">Select country</option><?php foreach ($app['countries'] as $code => $name): ?><option value="<?= e($code) ?>" <?= old('country_code') === $code ? 'selected' : '' ?>><?= e($name) ?></option><?php endforeach ?></select></label>
        <label>Currency<select name="currency_code" required><?php foreach ($app['currencies'] as $currency): ?><option value="<?= e($currency) ?>" <?= old('currency_code', 'USD') === $currency ? 'selected' : '' ?>><?= e($currency) ?></option><?php endforeach ?></select></label>
        <label>Store address<div class="input-prefix"><span>/</span><input name="slug" value="<?= e(old('slug')) ?>" placeholder="your-business" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required></div></label>
        <fieldset class="full">
            <legend>Initial appearance</legend>
            <div class="theme-grid">
                <?php foreach ($app['onboarding_themes'] as $theme): ?>
                    <label class="theme"><input type="radio" name="theme" value="<?= e($theme) ?>" <?= old('theme', 'modern') === $theme ? 'checked' : '' ?>><span><?= e($app['theme_catalog'][$theme]['name']) ?></span></label>
                <?php endforeach ?>
            </div>
            <small>Start quickly with one of these three. All 15 templates are available later in Store Design.</small>
        </fieldset>
        <div class="full actions"><button class="button primary" type="submit">Create draft store</button></div>
    </form>
</section>
