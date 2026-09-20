<?php
namespace App\Repositories;

use App\Core\Database;

final class SeoRepository
{
    public function update(int $storeId,array$data):void
    {
        $s=Database::connection()->prepare('UPDATE stores SET seo_title=?,seo_description=?,search_indexing=?,updated_at=UTC_TIMESTAMP() WHERE id=?');
        $s->execute([$data['seo_title'],$data['seo_description'],$data['search_indexing']?1:0,$storeId]);
    }

    public function indexableStores():array
    {
        $s=Database::connection()->query("SELECT slug,updated_at FROM stores WHERE status='ACTIVE' AND search_indexing=1 ORDER BY slug");return$s->fetchAll();
    }

    public function indexableStore(string$slug):?array
    {
        $s=Database::connection()->prepare("SELECT id,slug,updated_at FROM stores WHERE slug=? AND status='ACTIVE' AND search_indexing=1 LIMIT 1");$s->execute([$slug]);return$s->fetch()?:null;
    }

    public function sitemapProducts(int$storeId):array
    {
        $s=Database::connection()->prepare("SELECT p.slug,p.updated_at FROM products p LEFT JOIN categories c ON c.id=p.category_id AND c.store_id=p.store_id WHERE p.store_id=? AND p.status='ACTIVE' AND p.deleted_at IS NULL AND (p.category_id IS NULL OR c.status='ACTIVE') ORDER BY p.updated_at DESC");$s->execute([$storeId]);return$s->fetchAll();
    }
}
