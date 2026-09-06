<?php
declare(strict_types=1);
http_response_code(404);
header('X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
?><!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex">
  <title>Page not found</title>
  <style>html{color-scheme:light}body{min-height:100vh;display:grid;place-items:center;margin:0;background:#f5f5f5;color:#202020;font:16px Arial,sans-serif}main{padding:32px;text-align:center}h1{margin:0 0 10px;font-size:34px}p{margin:0;color:#666}</style>
</head>
<body><main><h1>404</h1><p>Page not found.</p></main></body>
</html>
