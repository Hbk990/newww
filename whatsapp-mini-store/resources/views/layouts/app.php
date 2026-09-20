<?php header('Cache-Control: no-store, private');$success = App\Core\Session::pullFlash('success'); $error = App\Core\Session::pullFlash('error'); ?>
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title><?= e($title ?? config('app')['name']) ?></title><link rel="stylesheet" href="/assets/css/app.css"></head>
<body><header class="topbar"><a class="brand" href="/"><?= e(config('app')['name']) ?></a><?php if (App\Core\Auth::id()): ?><form method="post" action="/logout"><?= csrf_field() ?><button class="link-button">Sign out</button></form><?php endif ?></header>
<main class="shell"><?php if ($success): ?><div class="notice success" role="status"><?= e($success) ?></div><?php endif ?><?php if ($error): ?><div class="notice error" role="alert"><?= e($error) ?></div><?php endif ?><?= $content ?></main>
<script src="/assets/js/app.js" defer></script></body></html>
