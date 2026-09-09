<?php
require_once __DIR__ . '/inc/bootstrap.php';
session_unset();
session_destroy();
header('Location: ./');
exit;
