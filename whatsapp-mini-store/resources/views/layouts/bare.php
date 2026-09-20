<?php header('Cache-Control: no-store, private'); ?>
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title><?= e($title ?? config('app')['name']) ?></title><link rel="stylesheet" href="/assets/css/app.css"></head>
<body class="bare-body"><?= $content ?></body></html>
