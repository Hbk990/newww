<?php
return [
    'dsn' => sprintf(
        'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
        App\Support\Env::get('DB_HOST', '127.0.0.1'),
        App\Support\Env::get('DB_PORT', '3306'),
        App\Support\Env::get('DB_DATABASE', 'ministore')
    ),
    'username' => App\Support\Env::get('DB_USERNAME', ''),
    'password' => App\Support\Env::get('DB_PASSWORD', ''),
];
