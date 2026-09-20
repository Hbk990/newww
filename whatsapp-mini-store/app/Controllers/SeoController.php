<?php
namespace App\Controllers;

use App\Core\{Auth,Request,Response,Session,View};
use App\Repositories\{AuditLogRepository,SeoRepository};
use App\Services\{PlanAccessService,TenantContext};

final class SeoController
{
    public function form(Request$request):void
    {
        $store=(new TenantContext)->store();$plan=(new PlanAccessService)->context((int)$store['id'],null,false,false)['plan'];
        View::render('merchant/seo',['title'=>'SEO & Sharing','store'=>$store,'plan'=>$plan,'storeUrl'=>config('app')['url'].'/'.$store['slug']],'merchant');
    }

    public function update(Request$request):void
    {
        $store=(new TenantContext)->store();$title=trim((string)$request->input('seo_title'));$description=trim((string)$request->input('seo_description'));$indexing=$request->input('search_indexing')==='1';$errors=[];
        if(mb_strlen($title)>70)$errors[]='Search title cannot exceed 70 characters.';if(mb_strlen($description)>160)$errors[]='Search description cannot exceed 160 characters.';
        if($errors){Session::put('_old',['seo_title'=>$title,'seo_description'=>$description,'search_indexing'=>$indexing?'1':'0']);Session::flash('error',implode(' ',$errors));Response::redirect('/merchant/seo',303);}
        (new SeoRepository)->update((int)$store['id'],['seo_title'=>$title===''?null:$title,'seo_description'=>$description===''?null:$description,'search_indexing'=>$indexing]);
        (new AuditLogRepository)->record((int)Auth::id(),'store.seo_updated','store',(int)$store['id'],['search_indexing'=>$indexing]);Session::flash('success','Search and sharing settings updated.');Response::redirect('/merchant/seo',303);
    }

    public function robots(Request$request):void
    {
        $base=config('app')['url'];$lines=['User-agent: *','Allow: /','','Sitemap: '.$base.'/sitemap.xml'];
        header('Content-Type: text/plain; charset=UTF-8');header('X-Content-Type-Options: nosniff');echo implode("\n",$lines)."\n";
    }

    public function sitemapIndex(Request$request):void
    {
        $base=config('app')['url'];$rows=(new SeoRepository)->indexableStores();$body='<?xml version="1.0" encoding="UTF-8"?>'."\n".'<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'."\n";foreach($rows as$row)$body.='  <sitemap><loc>'.$this->xml($base.'/'.$row['slug'].'/sitemap.xml').'</loc><lastmod>'.$this->date($row['updated_at']).'</lastmod></sitemap>'."\n";$body.='</sitemapindex>';
        $this->xmlResponse($body);
    }

    public function storeSitemap(Request$request):void
    {
        $repo=new SeoRepository;$store=$repo->indexableStore((string)$request->route('storeSlug'));if(!$store)Response::abort(404);$base=config('app')['url'].'/'.$store['slug'];$body='<?xml version="1.0" encoding="UTF-8"?>'."\n".'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'."\n";$body.='  <url><loc>'.$this->xml($base).'</loc><lastmod>'.$this->date($store['updated_at']).'</lastmod></url>'."\n";foreach($repo->sitemapProducts((int)$store['id'])as$product)$body.='  <url><loc>'.$this->xml($base.'/product/'.$product['slug']).'</loc><lastmod>'.$this->date($product['updated_at']).'</lastmod></url>'."\n";$body.='</urlset>';$this->xmlResponse($body);
    }

    private function xml(string$value):string{return htmlspecialchars($value,ENT_XML1|ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');}
    private function date(string$value):string{$time=strtotime($value);return gmdate('Y-m-d',$time===false?time():$time);}
    private function xmlResponse(string$body):void{header('Content-Type: application/xml; charset=UTF-8');header('X-Content-Type-Options: nosniff');echo$body;}
}
