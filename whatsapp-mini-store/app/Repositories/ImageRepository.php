<?php
namespace App\Repositories;

use App\Core\Database;

final class ImageRepository
{
    public function countForProduct(int $storeId,int $productId): int{$s=Database::connection()->prepare('SELECT COUNT(*) FROM product_images WHERE store_id=? AND product_id=?');$s->execute([$storeId,$productId]);return(int)$s->fetchColumn();}
    public function add(int $storeId,int $productId,array $image): int{$s=Database::connection()->prepare('INSERT INTO product_images (store_id,product_id,path,thumbnail_path,mime_type,size_bytes,width,height,sort_order,created_at) SELECT ?,?,?,?,?,?,?,?,COALESCE(MAX(sort_order),-1)+1,UTC_TIMESTAMP() FROM product_images WHERE store_id=? AND product_id=?');$s->execute([$storeId,$productId,$image['path'],$image['thumbnail_path'],$image['mime_type'],$image['size_bytes'],$image['width'],$image['height'],$storeId,$productId]);return(int)Database::connection()->lastInsertId();}
    public function find(int $storeId,int $productId,int $imageId):?array{$s=Database::connection()->prepare('SELECT * FROM product_images WHERE id=? AND product_id=? AND store_id=?');$s->execute([$imageId,$productId,$storeId]);return$s->fetch()?:null;}
    public function delete(int $storeId,int $productId,int $imageId):?array{$image=$this->find($storeId,$productId,$imageId);if(!$image)return null;$s=Database::connection()->prepare('DELETE FROM product_images WHERE id=? AND product_id=? AND store_id=?');$s->execute([$imageId,$productId,$storeId]);return$image;}
}
