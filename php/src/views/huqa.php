<?php
require_once __DIR__ . '/partials.php';
$availableCount = count(array_filter($mine, 'in_stock'));
$from = $mine ? money(min(array_map(fn($p) => (float)$p['price'], $mine))) : null;
?>
<section class="huqa-hero">
  <div class="huqa-hero-text">
    <p class="hero-eyebrow">Our own line</p>
    <h1>HUQA Shisha</h1>
    <p>We did not set out to resell someone else&rsquo;s tobacco. HUQA is the blend we kept mixing for ourselves behind the counter — the one regulars started asking for by name until we had to put it in a box.</p>
    <p>Packed in small runs, built for a long session, and priced the way a corner shop should price things<?= $from ? ', starting at ' . e($from) : '' ?>.</p>
    <div class="hero-actions">
      <a class="hero-cta" href="#huqa-range">See the range →</a>
      <a class="hero-cta hero-cta-ghost" target="_blank" rel="noreferrer"
         href="https://wa.me/<?= e($settings['whatsapp']) ?>?text=<?= e(rawurlencode('Hello! I want to ask about HUQA shisha.')) ?>">Ask about HUQA</a>
    </div>
  </div>
  <?php if (($mine[0]['image'] ?? '') !== ''): ?>
    <div class="huqa-hero-media"><img src="<?= e(image_src($mine[0]['image'])) ?>" alt="HUQA shisha"></div>
  <?php endif ?>
</section>

<section class="huqa-pillars">
  <div><h3>Blended small</h3><p>Small batches, mixed to a recipe we actually smoke ourselves.</p></div>
  <div><h3>Built to last a session</h3><p>Cut and moistened to hold its flavour through a full head, not ten minutes.</p></div>
  <div><h3>Ours end to end</h3><p>Our name on the box means we answer for it. Tell us if a batch is off.</p></div>
</section>

<section class="shop-section" id="huqa-range">
  <div class="section-head">
    <h2>The HUQA range</h2>
    <p><?= $mine ? count($mine) . ' product' . (count($mine) === 1 ? '' : 's') . ', ' . $availableCount . ' in stock right now.' : 'Coming to the shelf soon.' ?></p>
  </div>
  <?php product_grid($mine, 'The HUQA line is not on the shelf yet — message us and we will tell you when it lands.') ?>
</section>

<section class="huqa-close">
  <h2>Not sure which blend?</h2>
  <p>Tell us how you smoke and we will pick one for you. It is a one-message conversation.</p>
  <div class="hero-actions">
    <a class="hero-cta" href="https://wa.me/<?= e($settings['whatsapp']) ?>" target="_blank" rel="noreferrer">Message us</a>
    <a class="hero-cta hero-cta-ghost" href="<?= e(url('/shop/disposables')) ?>">Browse the rest of the shop</a>
  </div>
</section>
