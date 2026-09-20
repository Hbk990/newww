<?php
$describe=static function(array$offer,array$store):string{
    if($offer['headline'])return$offer['headline'];
    if($offer['type']==='FIXED_BUNDLE'){$parts=array_map(static fn($i)=>$i['quantity'].' × '.$i['product_name'],$offer['items']??[]);return($parts?implode(' + ',$parts):$offer['name']).' for '.$store['currency_code'].' '.$offer['bundle_price'];}
    $deal=$offer['get_discount_type']==='FREE'?'get '.$offer['get_quantity'].' free':'get '.$offer['get_quantity'].' at '.$offer['get_discount_value'].'% off';
    $scope=$offer['type']==='CATEGORY_BUY_N_GET_M'?('in '.($offer['category_name']??'this category')):('on '.($offer['product_name']??'this product'));
    return'Buy '.$offer['buy_quantity'].', '.$deal.' '.$scope.'.';
}; ?>
<section class="store-hero"><div><p class="store-kicker">Deals & bundles</p><h1>Current offers</h1><p>These apply automatically when your cart qualifies — no code needed.</p></div></section>
<?php if(!$offers):?><div class="store-empty"><div aria-hidden="true">◈</div><h3>No active offers right now</h3><p>Check back soon, or browse the full catalog.</p><a href="/<?= e($store['slug']) ?>">View all products</a></div><?php else:?><section class="store-section"><div class="offers-grid"><?php foreach($offers as$offer):?><article class="offer-card"><h2><?= e($offer['name']) ?></h2><p><?= e($describe($offer,$store)) ?></p></article><?php endforeach ?></div></section><?php endif ?>
