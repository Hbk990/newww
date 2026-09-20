<?php
namespace App\Services\Billing;

interface PaymentProviderInterface
{
    public function requestPaidChange(array$store,array$fromPlan,array$toPlan,string$idempotencyKey):array;
}
