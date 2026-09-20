<?php
namespace App\Services\Billing;

final class PaymentProviderFactory
{
    public static function make():PaymentProviderInterface
    {
        return match(config('billing')['provider']){'manual'=>new ManualPaymentProvider,default=>throw new \RuntimeException('Unsupported billing provider.')};
    }
}
