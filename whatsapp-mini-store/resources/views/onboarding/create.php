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
            <legend>Choose a template</legend>
            <p class="muted" style="margin:0 0 14px">Pick any of the 15 controlled templates now. You can refine colors, fonts, and branding anytime in Store Design.</p>
            <div class="template-picker">
                <?php foreach ($app['theme_catalog'] as $key => $template): ?>
                    <label class="template-option">
                        <input type="radio" name="theme" value="<?= e($key) ?>" <?= old('theme', 'modern') === $key ? 'checked' : '' ?>>
                        <span><b><?= e($template['name']) ?></b><small><?= e($template['description']) ?></small><i class="template-swatch <?= e($key) ?>" aria-hidden="true"></i></span>
                    </label>
                <?php endforeach ?>
            </div>
        </fieldset>
        <div class="full actions"><button class="button primary" type="submit">Create draft store</button></div>
    </form>
</section>
