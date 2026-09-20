<?php
return [
    'features' => [
        'basic_storefront' => 'Public storefront',
        'basic_analytics' => 'Basic analytics',
        'advanced_analytics' => 'Advanced analytics',
        'catalog_import' => 'CSV / Excel import',
        'bulk_image_import' => 'Bulk image matching',
        'remove_platform_branding' => 'Remove platform branding',
        'premium_customization' => 'Expanded customization',
        'staff_management' => 'Staff management entitlement',
        'custom_domain' => 'Custom domain entitlement',
    ],
    'limits' => [
        'stores' => ['label' => 'Stores', 'min' => 1, 'max' => 100],
        'products' => ['label' => 'Products', 'min' => 0, 'max' => 1000000],
        'categories' => ['label' => 'Categories', 'min' => 0, 'max' => 100000],
        'staff' => ['label' => 'Staff members', 'min' => 0, 'max' => 10000],
    ],
];
