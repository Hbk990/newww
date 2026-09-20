<?php
namespace App\Controllers;

use App\Core\{Auth,Request,Response,Session,View};
use App\Repositories\{AuditLogRepository,CategoryRepository,OfferRepository,ProductRepository,StoreRepository};
use App\Services\TenantContext;

final class OfferController
{
    private const TYPES=['BUY_X_GET_Y','CATEGORY_BUY_N_GET_M','FIXED_BUNDLE'];

    public function index(Request $request):void{$store=(new TenantContext)->store();View::render('merchant/offers/index',['title'=>'Bundles & offers','store'=>$store,'offers'=>(new OfferRepository)->all((int)$store['id'])],'merchant');}
    public function create(Request $request):void{$store=(new TenantContext)->store();$this->form($store,null,'Add offer');}
    public function edit(Request $request):void{$store=(new TenantContext)->store();$offer=(new OfferRepository)->find((int)$store['id'],(int)$request->route('id'));if(!$offer)Response::abort(404);$this->form($store,$offer,'Edit offer');}
    private function form(array $store,?array $offer,string $title):void{View::render('merchant/offers/form',['title'=>$title,'store'=>$store,'offer'=>$offer,'products'=>(new ProductRepository)->allNames((int)$store['id']),'categories'=>(new CategoryRepository)->all((int)$store['id'])],'merchant');}

    public function store(Request $request):void{$store=(new TenantContext)->store();$data=$this->validated($request,(int)$store['id']);$id=(new OfferRepository)->create((int)$store['id'],$data);(new AuditLogRepository)->record((int)Auth::id(),'offer.created','offer',$id,['store_id'=>$store['id'],'name'=>$data['name']]);Session::flash('success','Offer created.');Response::redirect('/merchant/offers');}
    public function update(Request $request):void{$store=(new TenantContext)->store();$id=(int)$request->route('id');$data=$this->validated($request,(int)$store['id'],$id);$ok=(new OfferRepository)->update((int)$store['id'],$id,$data);if(!$ok)Response::abort(404);(new AuditLogRepository)->record((int)Auth::id(),'offer.updated','offer',$id,['store_id'=>$store['id']]);Session::flash('success','Offer updated.');Response::redirect('/merchant/offers');}
    public function toggle(Request $request):void{$store=(new TenantContext)->store();$id=(int)$request->route('id');$offer=(new OfferRepository)->find((int)$store['id'],$id);if(!$offer)Response::abort(404);$next=$offer['status']==='ACTIVE'?'INACTIVE':'ACTIVE';(new OfferRepository)->setStatus((int)$store['id'],$id,$next);(new AuditLogRepository)->record((int)Auth::id(),'offer.status_changed','offer',$id,['store_id'=>$store['id'],'status'=>$next]);Session::flash('success','Offer '.($next==='ACTIVE'?'activated':'deactivated').'.');Response::redirect('/merchant/offers');}

    public function togglePage(Request $request):void{$store=(new TenantContext)->store();$enabled=(bool)$request->input('offers_page_enabled');(new StoreRepository)->updateOffersPageEnabled((int)$store['id'],$enabled);(new AuditLogRepository)->record((int)Auth::id(),'offer.page_visibility_changed','store',(int)$store['id'],['enabled'=>$enabled]);Session::flash('success','Offers page '.($enabled?'enabled':'disabled').'.');Response::redirect('/merchant/offers');}

    private function validated(Request $request,int $storeId,?int $id=null):array
    {
        $name=trim((string)$request->input('name'));$headline=trim((string)$request->input('headline'));$type=strtoupper((string)$request->input('type'));
        $startsAt=trim((string)$request->input('starts_at'));$endsAt=trim((string)$request->input('ends_at'));$status=(string)$request->input('status','ACTIVE');
        $errors=[];
        if(mb_strlen($name)<2||mb_strlen($name)>120)$errors[]='Name must be 2–120 characters.';
        if($headline!==''&&mb_strlen($headline)>160)$errors[]='Headline cannot exceed 160 characters.';
        if(!in_array($type,self::TYPES,true))$errors[]='Choose a valid offer type.';
        if(!in_array($status,['ACTIVE','INACTIVE'],true))$errors[]='Choose a valid status.';
        $scopeProductId=null;$scopeCategoryId=null;$buyQuantity=null;$getQuantity=null;$getDiscountType=null;$getDiscountValue=null;$bundlePrice=null;$bundleItems=[];
        if(in_array($type,['BUY_X_GET_Y','CATEGORY_BUY_N_GET_M'],true)){
            $buyRaw=trim((string)$request->input('buy_quantity'));$getRaw=trim((string)$request->input('get_quantity'));
            $buyQuantity=ctype_digit($buyRaw)&&(int)$buyRaw>=1?(int)$buyRaw:null;if($buyQuantity===null)$errors[]='Buy quantity must be a whole number of 1 or more.';
            $getQuantity=ctype_digit($getRaw)&&(int)$getRaw>=1?(int)$getRaw:null;if($getQuantity===null)$errors[]='Get quantity must be a whole number of 1 or more.';
            $getDiscountType=strtoupper((string)$request->input('get_discount_type'));
            if(!in_array($getDiscountType,['FREE','PERCENT'],true))$errors[]='Choose whether the extra items are free or a percentage off.';
            elseif($getDiscountType==='FREE')$getDiscountValue='100.00';
            else{$valueRaw=trim((string)$request->input('get_discount_value'));if(!is_numeric($valueRaw)||(float)$valueRaw<=0||(float)$valueRaw>100)$errors[]='Percentage off must be between 0 and 100.';else$getDiscountValue=number_format((float)$valueRaw,2,'.','');}
            if($type==='BUY_X_GET_Y'){$productId=(int)$request->input('scope_product_id');if(!$productId||!(new ProductRepository)->find($storeId,$productId))$errors[]='Choose a product from this store.';else$scopeProductId=$productId;}
            else{$categoryId=(int)$request->input('scope_category_id');if(!$categoryId||!(new CategoryRepository)->find($storeId,$categoryId))$errors[]='Choose a category from this store.';else$scopeCategoryId=$categoryId;}
        } elseif ($type==='FIXED_BUNDLE') {
            $priceRaw=trim((string)$request->input('bundle_price'));
            if(!is_numeric($priceRaw)||(float)$priceRaw<=0)$errors[]='Enter a bundle price greater than 0.';else$bundlePrice=number_format((float)$priceRaw,2,'.','');
            $productIds=(array)$request->input('bundle_product_id',[]);$quantities=(array)$request->input('bundle_quantity',[]);
            $seen=[];
            foreach($productIds as$i=>$rawProductId){
                $productId=(int)$rawProductId;$quantity=(int)($quantities[$i]??0);
                if($productId<=0)continue;
                if($quantity<1){$errors[]='Every bundle item needs a quantity of 1 or more.';continue;}
                if(isset($seen[$productId])){$errors[]='Each product can only appear once in a bundle.';continue;}
                if(!(new ProductRepository)->find($storeId,$productId)){$errors[]='One of the bundle products no longer belongs to this store.';continue;}
                $seen[$productId]=true;$bundleItems[]=['product_id'=>$productId,'quantity'=>$quantity];
            }
            if(count($bundleItems)<2)$errors[]='A fixed bundle needs at least two different products.';
        }
        $startsAtValue=null;if($startsAt!==''){$ts=strtotime($startsAt);if(!$ts)$errors[]='Start date is invalid.';else$startsAtValue=gmdate('Y-m-d H:i:s',$ts);}
        $endsAtValue=null;if($endsAt!==''){$ts=strtotime($endsAt);if(!$ts)$errors[]='End date is invalid.';else$endsAtValue=gmdate('Y-m-d H:i:s',$ts);}
        if($startsAtValue&&$endsAtValue&&$startsAtValue>=$endsAtValue)$errors[]='End date must be after the start date.';
        if($errors)$this->fail($id?"/merchant/offers/{$id}/edit":'/merchant/offers/create',implode(' ',$errors),$request);
        return['name'=>$name,'headline'=>$headline!==''?$headline:null,'type'=>$type,'scope_product_id'=>$scopeProductId,'scope_category_id'=>$scopeCategoryId,'buy_quantity'=>$buyQuantity,'get_quantity'=>$getQuantity,'get_discount_type'=>$getDiscountType,'get_discount_value'=>$getDiscountValue,'bundle_price'=>$bundlePrice,'bundle_items'=>$bundleItems,'starts_at'=>$startsAtValue,'ends_at'=>$endsAtValue,'status'=>$status];
    }
    private function fail(string $path,string $message,Request $request):never{Session::put('_old',array_diff_key($request->all(),['_token'=>true]));Session::flash('error',$message);Response::redirect($path);}
}
