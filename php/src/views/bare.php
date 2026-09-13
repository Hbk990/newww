<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e($title ?? $settings['storeName']) ?></title>
<link rel="icon" href="<?= e(url('/assets/favicon.svg')) ?>">
<link rel="stylesheet" href="<?= e(url('/assets/shop.css')) ?>">
</head>
<body><?= $content ?></body>
</html>
