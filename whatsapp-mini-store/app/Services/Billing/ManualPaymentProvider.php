<?php
namespace App\Services\Billing;

final class ManualPaymentProvider implements PaymentProviderInterface
{
    public function requestPaidChange(array$store,array$fromPlan,array$toPlan,string$idempotencyKey):array
    {
        return['status'=>'PENDING','reference'=>'MAN-'.strtoupper(substr(hash('sha256',$idempotencyKey),0,16)),'metadata'=>['instructions'=>'Await manual payment confirmation.','idempotency_key'=>$idempotencyKey]];
    }
}
