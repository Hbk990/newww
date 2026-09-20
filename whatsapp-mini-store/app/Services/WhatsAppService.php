<?php
namespace App\Services;

final class WhatsAppService
{
    public function orderUrl(array $store, array $order): string
    {
        $digits = preg_replace('/\D+/', '', (string) $store['whatsapp_number']);
        $lines = [
            'New Order Reference: ' . $order['reference'],
            '',
            'Customer: ' . $order['customer_name'],
            'Phone: ' . $order['customer_phone'],
            '',
            'Items:',
        ];
        foreach ($order['items'] as $item) {
            $label = $item['product_name'] . ($item['variant_label'] ? ' (' . $item['variant_label'] . ')' : '');
            $lines[] = $item['quantity'] . ' × ' . $label . ' — ' . $order['currency_code'] . ' ' . $item['line_total'];
        }
        $lines[] = '';
        $lines[] = 'Total: ' . $order['currency_code'] . ' ' . $order['total'];
        $lines[] = 'Delivery: ' . $order['delivery_address'];
        if ($order['notes']) $lines[] = 'Notes: ' . $order['notes'];
        return 'https://wa.me/' . $digits . '?text=' . rawurlencode(implode("\n", $lines));
    }
}
