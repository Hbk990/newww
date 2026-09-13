<div class="coming-soon">
  <img src="<?= e(url('/assets/huqa-logo.jpeg')) ?>" alt="<?= e($settings['storeName']) ?>" width="112" height="112">
  <h1><?= e($settings['storeName']) ?></h1>
  <p><?= e($settings['tagline'] !== '' ? $settings['tagline'] : 'Arguileh & Vapes') ?></p>
  <p class="coming-soon-note">Our shop is being set up. Message us on WhatsApp in the meantime and we will sort you out.</p>
  <a class="coming-soon-cta" href="https://wa.me/<?= e($settings['whatsapp']) ?>" target="_blank" rel="noreferrer">Chat on WhatsApp</a>
</div>
<?php $title = $settings['storeName']; ?>
