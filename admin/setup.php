<?php
declare(strict_types=1);
require_once __DIR__ . '/../inc/bootstrap.php';
if (is_file(INSTALL_LOCK_FILE)||!empty(settings()['admin_password_hash'])) { header('Location: login.php'); exit; }
$error='';
if(empty($_SESSION['setup_csrf']))$_SESSION['setup_csrf']=bin2hex(random_bytes(24));
if ($_SERVER['REQUEST_METHOD']==='POST') {
    $token=(string)($_POST['install_token']??''); $username=clean_text($_POST['username']??'',64); $password=(string)($_POST['password']??''); $confirm=(string)($_POST['confirm']??'');
    if(!hash_equals((string)$_SESSION['setup_csrf'],(string)($_POST['csrf']??'')))$error='Session expired. Refresh and retry.';
    elseif(!auth_allowed('setup'))$error='Too many incorrect attempts. Please wait 15 minutes.';
    elseif(!hash_equals(INSTALL_TOKEN,$token)){auth_record_failure('setup');$error='Invalid installation token.';}
    elseif(!preg_match('/^[A-Za-z0-9._-]{3,64}$/',$username))$error='Username must be 3–64 letters, numbers, dots, dashes or underscores.';
    elseif(strlen($password)<12)$error='Use at least 12 characters.';
    elseif(password_verify($password,(string)(settings()['customer_password_hash']??CUSTOMER_PASSWORD_HASH)))$error='The admin password must be different from the customer passcode.';
    elseif($password!==$confirm)$error='Passwords do not match.';
    else{$current=settings();$current['admin_username']=$username;$current['admin_password_hash']=password_hash($password,PASSWORD_DEFAULT);$current['configured_at']=gmdate(DATE_ATOM);save_json(SETTINGS_FILE,$current);file_put_contents(INSTALL_LOCK_FILE,"Administrator setup completed at ".gmdate(DATE_ATOM)."\n",LOCK_EX);auth_clear_failures('setup');session_regenerate_id(true);$_SESSION['admin_authenticated']=true;$_SESSION['admin_entry_allowed']=true;$_SESSION['customer_authenticated']=true;$_SESSION['admin_last_seen']=time();log_activity('Administrator account created');header('Location: index.php');exit;}
}
?><!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Set up DR PHONE Admin</title><link rel="stylesheet" href="../assets/admin.css"></head><body class="auth-body"><main class="auth-card"><img class="admin-brand-logo" src="../dr-phone-logo.png" alt="Dr. phone"><p class="eyebrow">One-time setup</p><h1>Create the admin account</h1><p>This account is saved on the server and will be the same on every device.</p><form method="post"><input type="hidden" name="csrf" value="<?=htmlspecialchars($_SESSION['setup_csrf'])?>"><label>Installation token<input name="install_token" required autocomplete="off"></label><label>Admin username<input name="username" minlength="3" maxlength="64" required autocomplete="username"></label><label>New admin password<input type="password" name="password" minlength="12" required autocomplete="new-password"></label><label>Confirm password<input type="password" name="confirm" minlength="12" required autocomplete="new-password"></label><?php if($error):?><div class="form-error"><?=htmlspecialchars($error)?></div><?php endif;?><button type="submit">Create secure admin</button></form></main></body></html>
