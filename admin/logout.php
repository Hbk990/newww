<?php
require_once __DIR__ . '/../inc/bootstrap.php';
unset($_SESSION['admin_authenticated'], $_SESSION['admin_last_seen']);
header('Location: login.php');
exit;
