<?php
namespace App\Controllers;

use App\Core\{Request,Response,View};
use App\Repositories\CustomerRepository;
use App\Services\TenantContext;

final class CustomerController
{
    public function index(Request$request):void{$store=(new TenantContext)->store();$query=mb_substr(trim((string)$request->query('q')),0,100);$page=max(1,(int)$request->query('page',1));$customers=(new CustomerRepository)->paginate((int)$store['id'],$query,$page);if($customers['total']>0&&$page>$customers['pages'])Response::abort(404);View::render('merchant/customers/index',['title'=>'Customers','store'=>$store,'customers'=>$customers,'query'=>$query],'merchant');}
    public function show(Request$request):void{$store=(new TenantContext)->store();$customer=(new CustomerRepository)->find((int)$store['id'],(int)$request->route('id'));if(!$customer)Response::abort(404);View::render('merchant/customers/show',['title'=>$customer['name'],'store'=>$store,'customer'=>$customer],'merchant');}
}
