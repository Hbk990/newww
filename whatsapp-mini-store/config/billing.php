<?php
return [
    'provider' => App\Support\Env::get('BILLING_PROVIDER', 'manual'),
    'trial_days' => max(0, (int) App\Support\Env::get('BILLING_TRIAL_DAYS', '7')),
    'grace_days' => max(0, (int) App\Support\Env::get('BILLING_GRACE_DAYS', '7')),
    'manual_period_days' => max(1, (int) App\Support\Env::get('BILLING_MANUAL_PERIOD_DAYS', '30')),
];
