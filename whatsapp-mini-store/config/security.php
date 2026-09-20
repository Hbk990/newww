<?php
return [
    'session_name' => App\Support\Env::get('SESSION_NAME', 'ministore_session'),
    'session_lifetime' => App\Support\Env::int('SESSION_LIFETIME', 120),
    'session_secure' => App\Support\Env::bool('SESSION_SECURE', true),
    'password_min_length' => 12,
    'login_attempts' => 5,
    'login_window_seconds' => 900,
    'login_ip_attempts' => 50,
    'register_attempts' => 5,
    'register_window_seconds' => 3600,
    'reset_attempts' => 3,
    'reset_window_seconds' => 3600,
    'reset_ip_attempts' => 20,
];
