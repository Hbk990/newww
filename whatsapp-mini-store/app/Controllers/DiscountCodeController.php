<?php
namespace App\Controllers;

use App\Core\{Auth,Request,Response,Session,View};
use App\Repositories\{AuditLogRepository,CategoryRepository,DiscountCodeRepository,ProductRepository};
use App\Services\TenantContext;

final class DiscountCodeController
{
    private const TYPES=['PERCENT_ORDER','FIXED_ORDER','PERCENT_PRODUCT','PERCENT_CATEGORY','FREE_DELIVERY'];

    public function index(Request $request):void{$store=(new TenantContext)->store();View::render('merchant/discounts/index',['title'=>'Discount codes','store'=>$store,'codes'=>(new DiscountCodeRepository)->all((int)$store['id'])],'merchant');}
    public function create(Request $request):void{$store=(new TenantContext)->store();$this->form($store,null,'Add discount code');}
    public function edit(Request $request):void{$store=(new TenantContext)->store();$code=(new DiscountCodeRepository)->find((int)$store['id'],(int)$request->route('id'));if(!$code)Response::abort(404);$this->form($store,$code,'Edit discount code');}
    private function form(array $store,?array $code,string $title):void{View::render('merchant/discounts/form',['title'=>$title,'store'=>$store,'code'=>$code,'products'=>(new ProductRepository)->allNames((int)$store['id']),'categories'=>(new CategoryRepository)->all((int)$store['id'])],'merchant');}

    public function store(Request $request):void{$store=(new TenantContext)->store();$data=$this->validated($request,(int)$store['id']);$repo=new DiscountCodeRepository;try{$id=$repo->create((int)$store['id'],$data);}catch(\PDOException$e){if((string)$e->getCode()==='23000')$this->fail('/merchant/discounts/create','That code already exists for this store.',$request);throw$e;}(new AuditLogRepository)->record((int)Auth::id(),'discount_code.created','discount_code',$id,['store_id'=>$store['id'],'code'=>$data['code']]);Session::flash('success','Discount code created.');Response::redirect('/merchant/discounts');}
    public function update(Request $request):void{$store=(new TenantContext)->store();$id=(int)$request->route('id');$data=$this->validated($request,(int)$store['id'],$id);$repo=new DiscountCodeRepository;try{$ok=$repo->update((int)$store['id'],$id,$data);}catch(\PDOException$e){if((string)$e->getCode()==='23000')$this->fail("/merchant/discounts/{$id}/edit",'That code already exists for this store.',$request);throw$e;}if(!$ok)Response::abort(404);(new AuditLogRepository)->record((int)Auth::id(),'discount_code.updated','discount_code',$id,['store_id'=>$store['id']]);Session::flash('success','Discount code updated.');Response::redirect('/merchant/discounts');}
    public function toggle(Request $request):void{$store=(new TenantContext)->store();$id=(int)$request->route('id');$code=(new DiscountCodeRepository)->find((int)$store['id'],$id);if(!$code)Response::abort(404);$next=$code['status']==='ACTIVE'?'INACTIVE':'ACTIVE';(new DiscountCodeRepository)->setStatus((int)$store['id'],$id,$next);(new AuditLogRepository)->record((int)Auth::id(),'discount_code.status_changed','discount_code',$id,['store_id'=>$store['id'],'status'=>$next]);Session::flash('success','Discount code '.($next==='ACTIVE'?'activated':'deactivated').'.');Response::redirect('/merchant/discounts');}

    private function validated(Request $request,int $storeId,?int $id=null):array
    {
        $code=mb_strtoupper(trim((string)$request->input('code')));$type=strtoupper((string)$request->input('type'));$valueRaw=trim((string)$request->input('value'));
        $scopeProduct=(int)$request->input('scope_product_id');$scopeCategory=(int)$request->input('scope_category_id');
        $minOrder=trim((string)$request->input('min_order_amount'));$startsAt=trim((string)$request->input('starts_at'));$endsAt=trim((string)$request->input('ends_at'));
        $usageLimit=trim((string)$request->input('usage_limit'));$usagePerCustomer=trim((string)$request->input('usage_limit_per_customer'));$status=(string)$request->input('status','ACTIVE');
        $errors=[];
        if(!preg_match('/^[A-Z0-9_-]{3,40}$/',$code))$errors[]='Code must be 3–40 characters: letters, numbers, dashes, or underscores.';
        if(!in_array($type,self::TYPES,true))$errors[]='Choose a valid discount type.';
        $value=null;
        if(in_array($type,['PERCENT_ORDER','PERCENT_PRODUCT','PERCENT_CATEGORY'],true)){if(!is_numeric($valueRaw)||(float)$valueRaw<=0||(float)$valueRaw>100)$errors[]='Percentage must be between 0 and 100.';else$value=number_format((float)$valueRaw,2,'.','');}
        elseif($type==='FIXED_ORDER'){if(!is_numeric($valueRaw)||(float)$valueRaw<=0)$errors[]='Enter a fixed amount greater than 0.';else$value=number_format((float)$valueRaw,2,'.','');}
        $scopeProductId=null;$scopeCategoryId=null;
        if($type==='PERCENT_PRODUCT'){if(!$scopeProduct||!(new ProductRepository)->find($storeId,$scopeProduct))$errors[]='Choose a product from this store.';else$scopeProductId=$scopeProduct;}
        if($type==='PERCENT_CATEGORY'){if(!$scopeCategory||!(new CategoryRepository)->find($storeId,$scopeCategory))$errors[]='Choose a category from this store.';else$scopeCategoryId=$scopeCategory;}
        $minOrderAmount=null;if($minOrder!==''){if(!is_numeric($minOrder)||(float)$minOrder<0)$errors[]='Minimum order amount must be zero or more.';else$minOrderAmount=number_format((float)$minOrder,2,'.','');}
        $startsAtValue=null;if($startsAt!==''){$ts=strtotime($startsAt);if(!$ts)$errors[]='Start date is invalid.';else$startsAtValue=gmdate('Y-m-d H:i:s',$ts);}
        $endsAtValue=null;if($endsAt!==''){$ts=strtotime($endsAt);if(!$ts)$errors[]='End date is invalid.';else$endsAtValue=gmdate('Y-m-d H:i:s',$ts);}
        if($startsAtValue&&$endsAtValue&&$startsAtValue>=$endsAtValue)$errors[]='End date must be after the start date.';
        $usageLimitValue=null;if($usageLimit!==''){if(!ctype_digit($usageLimit)||(int)$usageLimit<1)$errors[]='Total use limit must be a whole number of 1 or more.';else$usageLimitValue=(int)$usageLimit;}
        $usagePerCustomerValue=null;if($usagePerCustomer!==''){if(!ctype_digit($usagePerCustomer)||(int)$usagePerCustomer<1)$errors[]='Per-customer limit must be a whole number of 1 or more.';else$usagePerCustomerValue=(int)$usagePerCustomer;}
        if(!in_array($status,['ACTIVE','INACTIVE'],true))$errors[]='Choose a valid status.';
        if($errors)$this->fail($id?"/merchant/discounts/{$id}/edit":'/merchant/discounts/create',implode(' ',$errors),$request);
        return['code'=>$code,'type'=>$type,'value'=>$value,'scope_product_id'=>$scopeProductId,'scope_category_id'=>$scopeCategoryId,'min_order_amount'=>$minOrderAmount,'starts_at'=>$startsAtValue,'ends_at'=>$endsAtValue,'usage_limit'=>$usageLimitValue,'usage_limit_per_customer'=>$usagePerCustomerValue,'status'=>$status];
    }
    private function fail(string $path,string $message,Request $request):never{Session::put('_old',array_diff_key($request->all(),['_token'=>true]));Session::flash('error',$message);Response::redirect($path);}
}
