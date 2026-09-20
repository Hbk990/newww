<?php
namespace App\Repositories;

use App\Core\Database;
use App\Services\PlanAccessService;

final class ProductRepository
{
    public function metrics(int $storeId): array
    {
        $s = Database::connection()->prepare("SELECT COUNT(*) total_products,SUM(availability='AVAILABLE' AND status<>'ARCHIVED') available_products,SUM(availability='UNAVAILABLE' AND status<>'ARCHIVED') unavailable_products FROM products WHERE store_id=? AND deleted_at IS NULL");
        $s->execute([$storeId]); $row = $s->fetch();
        return array_map(static fn($v)=>(int)($v ?? 0),$row ?: []);
    }

    public function publicReadyCount(int$storeId):int{$s=Database::connection()->prepare("SELECT COUNT(DISTINCT p.id) FROM products p LEFT JOIN categories c ON c.id=p.category_id AND c.store_id=p.store_id WHERE p.store_id=? AND p.status='ACTIVE' AND p.availability='AVAILABLE' AND p.deleted_at IS NULL AND (p.category_id IS NULL OR c.status='ACTIVE') AND (NOT EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id=p.id AND pv.store_id=p.store_id) OR EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id=p.id AND pv.store_id=p.store_id AND pv.is_available=1 AND (pv.stock_quantity IS NULL OR pv.stock_quantity>0)))");$s->execute([$storeId]);return(int)$s->fetchColumn();}

    public function search(int $storeId, array $filters): array
    {
        $where = ' WHERE p.store_id=? AND p.deleted_at IS NULL';
        $params = [$storeId];
        if ($filters['q'] !== '') { $where .= ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.description LIKE ?)'; $like='%'.$filters['q'].'%'; array_push($params,$like,$like,$like); }
        if ($filters['category_id']) { $where .= ' AND p.category_id=?'; $params[]=$filters['category_id']; }
        if ($filters['status'] !== '') { $where .= ' AND p.status=?'; $params[]=$filters['status']; }
        if ($filters['availability'] !== '') { $where .= ' AND p.availability=?'; $params[]=$filters['availability']; }
        $count=Database::connection()->prepare('SELECT COUNT(*) FROM products p'.$where);$count->execute($params);$total=(int)$count->fetchColumn();
        $orders = ['newest'=>'p.created_at DESC','oldest'=>'p.created_at ASC','name'=>'p.name ASC','price_low'=>'p.price ASC','price_high'=>'p.price DESC'];
        $sql="SELECT p.*,c.name category_name,(SELECT COALESCE(thumbnail_path,path) FROM product_images pi WHERE pi.product_id=p.id AND pi.store_id=p.store_id ORDER BY sort_order,id LIMIT 1) thumbnail FROM products p LEFT JOIN categories c ON c.id=p.category_id AND c.store_id=p.store_id".$where.' ORDER BY '.($orders[$filters['sort']]??$orders['newest']).' LIMIT 24 OFFSET '.(($filters['page']-1)*24);
        $s=Database::connection()->prepare($sql); $s->execute($params); return ['items'=>$s->fetchAll(),'total'=>$total,'page'=>$filters['page'],'pages'=>max(1,(int)ceil($total/24))];
    }

    public function find(int $storeId, int $id): ?array
    {
        $s=Database::connection()->prepare('SELECT * FROM products WHERE id=? AND store_id=? AND deleted_at IS NULL'); $s->execute([$id,$storeId]);
        $product=$s->fetch(); if (!$product) return null;
        $product['images']=$this->images($storeId,$id); $product['options']=$this->options($storeId,$id); $product['variants']=$this->variants($storeId,$id);
        return $product;
    }

    public function create(int $storeId, array $data, array $options): int
    {
        $pdo=Database::connection(); $pdo->beginTransaction();
        try {
            (new PlanAccessService)->assertCanAdd($storeId,'products',1,$pdo);
            $s=$pdo->prepare("INSERT INTO products (store_id,category_id,name,slug,sku,description,price,compare_price,availability,is_featured,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())");
            $s->execute([$storeId,$data['category_id'],$data['name'],$data['slug'],$data['sku'],$data['description'],$data['price'],$data['compare_price'],$data['availability'],$data['is_featured'],$data['status']]);
            $id=(int)$pdo->lastInsertId(); $this->syncOptions($pdo,$storeId,$id,$options,[]); $pdo->commit(); return $id;
        } catch (\Throwable $e) { if($pdo->inTransaction())$pdo->rollBack(); throw $e; }
    }

    public function update(int $storeId,int $id,array $data,array $options,array $variantInputs): array
    {
        $pdo=Database::connection(); $pdo->beginTransaction();
        try {
            $s=$pdo->prepare('UPDATE products SET category_id=?,name=?,slug=?,sku=?,description=?,price=?,compare_price=?,availability=?,is_featured=?,status=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND store_id=? AND deleted_at IS NULL');
            $s->execute([$data['category_id'],$data['name'],$data['slug'],$data['sku'],$data['description'],$data['price'],$data['compare_price'],$data['availability'],$data['is_featured'],$data['status'],$id,$storeId]);
            $exists=$pdo->prepare('SELECT 1 FROM products WHERE id=? AND store_id=? AND deleted_at IS NULL'); $exists->execute([$id,$storeId]); if(!$exists->fetchColumn()){ $pdo->rollBack(); return ['ok'=>false,'variant_map'=>[],'removed_photos'=>[]]; }
            ['id_map'=>$idMap,'removed_photos'=>$removed]=$this->syncOptions($pdo,$storeId,$id,$options,$variantInputs); $pdo->commit(); return ['ok'=>true,'variant_map'=>$idMap,'removed_photos'=>$removed];
        } catch (\Throwable $e) { if($pdo->inTransaction())$pdo->rollBack(); throw $e; }
    }

    public function variantImagePath(int $storeId,int $variantId): ?string
    {
        $s=Database::connection()->prepare('SELECT image_path FROM product_variants WHERE id=? AND store_id=?'); $s->execute([$variantId,$storeId]); $path=$s->fetchColumn(); return $path===false?null:$path;
    }

    public function updateVariantImage(int $storeId,int $variantId,?string $path): void
    {
        Database::connection()->prepare('UPDATE product_variants SET image_path=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND store_id=?')->execute([$path,$variantId,$storeId]);
    }

    private function syncOptions(\PDO $pdo,int $storeId,int $productId,array $options,array $variantInputs): array
    {
        $old=$pdo->prepare('SELECT * FROM product_variants WHERE product_id=? AND store_id=?'); $old->execute([$productId,$storeId]);
        $existing=[]; foreach($old->fetchAll() as $v)$existing[$v['label']]=$v;
        $pdo->prepare('DELETE FROM product_variants WHERE product_id=? AND store_id=?')->execute([$productId,$storeId]);
        $pdo->prepare('DELETE FROM product_options WHERE product_id=? AND store_id=?')->execute([$productId,$storeId]);
        $groups=[];
        foreach($options as $oi=>$option){
            $s=$pdo->prepare('INSERT INTO product_options (store_id,product_id,name,sort_order,created_at,updated_at) VALUES (?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())'); $s->execute([$storeId,$productId,$option['name'],$oi]); $optionId=(int)$pdo->lastInsertId();
            $values=[]; foreach($option['values'] as $vi=>$value){$v=$pdo->prepare('INSERT INTO product_option_values (store_id,option_id,value,sort_order,created_at) VALUES (?,?,?,?,UTC_TIMESTAMP())');$v->execute([$storeId,$optionId,$value,$vi]);$values[]=['id'=>(int)$pdo->lastInsertId(),'value'=>$value,'option'=>$option['name']];} $groups[]=$values;
        }
        $idMap=[]; $removedPhotos=[]; $survivingLabels=[];
        if(!$groups){foreach($existing as$label=>$v)if($v['image_path'])$removedPhotos[]=$v['image_path'];return['id_map'=>$idMap,'removed_photos'=>$removedPhotos];}
        foreach($this->combinations($groups) as $combo){
            $label=implode(' / ',array_map(static fn($item)=>$item['option'].': '.$item['value'],$combo)); $survivingLabels[$label]=true; $previous=$existing[$label]??[]; $input=$variantInputs[(string)($previous['id']??'')]??[];
            $sku=$this->nullable($input['sku']??($previous['sku']??null)); $adjust=$input['price_adjustment']??($previous['price_adjustment']??'0.00'); $stock=$input['stock_quantity']??($previous['stock_quantity']??null); $available=isset($input['present'])?(isset($input['is_available'])?1:0):(int)($previous['is_available']??1);
            $image=$previous['image_path']??null; if(isset($input['present'])&&!empty($input['remove_photo'])){if($image)$removedPhotos[]=$image;$image=null;}
            $s=$pdo->prepare('INSERT INTO product_variants (store_id,product_id,label,sku,image_path,price_adjustment,stock_quantity,is_available,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())');$s->execute([$storeId,$productId,$label,$sku,$image,$adjust,$stock===''?null:$stock,$available]);$variantId=(int)$pdo->lastInsertId();
            if(isset($previous['id']))$idMap[(int)$previous['id']]=$variantId;
            foreach($combo as $value)$pdo->prepare('INSERT INTO product_variant_values (store_id,variant_id,option_value_id) VALUES (?,?,?)')->execute([$storeId,$variantId,$value['id']]);
        }
        foreach($existing as$label=>$v)if(!isset($survivingLabels[$label])&&$v['image_path'])$removedPhotos[]=$v['image_path'];
        return['id_map'=>$idMap,'removed_photos'=>$removedPhotos];
    }

    private function combinations(array $groups): array
    {
        $result=[[]]; foreach($groups as $group){$next=[];foreach($result as $prefix)foreach($group as $value)$next[]=array_merge($prefix,[$value]);$result=$next;}return $result;
    }
    private function nullable(mixed $v): ?string { $v=trim((string)$v); return $v===''?null:$v; }
    public function archive(int $storeId,int $id): bool{$s=Database::connection()->prepare("UPDATE products SET status='ARCHIVED',updated_at=UTC_TIMESTAMP() WHERE id=? AND store_id=? AND deleted_at IS NULL");$s->execute([$id,$storeId]);$check=Database::connection()->prepare('SELECT 1 FROM products WHERE id=? AND store_id=? AND deleted_at IS NULL');$check->execute([$id,$storeId]);return(bool)$check->fetchColumn();}
    public function delete(int $storeId,int $id): bool{$pdo=Database::connection();$pdo->beginTransaction();try{$check=$pdo->prepare('SELECT id FROM products WHERE id=? AND store_id=? AND deleted_at IS NULL FOR UPDATE');$check->execute([$id,$storeId]);if(!$check->fetchColumn()){$pdo->rollBack();return false;}$pdo->prepare('UPDATE product_variants SET sku=NULL,updated_at=UTC_TIMESTAMP() WHERE product_id=? AND store_id=?')->execute([$id,$storeId]);$pdo->prepare("UPDATE products SET category_id=NULL,slug=CONCAT(LEFT(slug,150),'-deleted-',id),sku=NULL,deleted_at=UTC_TIMESTAMP(),updated_at=UTC_TIMESTAMP() WHERE id=? AND store_id=?")->execute([$id,$storeId]);$pdo->commit();return true;}catch(\Throwable$e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}}

    public function duplicate(int $storeId,int $id): ?int
    {
        $source=$this->find($storeId,$id);if(!$source)return null;$suffix=substr(bin2hex(random_bytes(3)),0,6);$options=array_map(fn($o)=>['name'=>$o['name'],'values'=>array_column($o['values'],'value')],$source['options']);
        $data=['category_id'=>$source['category_id'],'name'=>$source['name'].' Copy','slug'=>$source['slug'].'-copy-'.$suffix,'sku'=>null,'description'=>$source['description'],'price'=>$source['price'],'compare_price'=>$source['compare_price'],'availability'=>$source['availability'],'is_featured'=>0,'status'=>'DRAFT'];$newId=$this->create($storeId,$data,$options);$new=$this->variants($storeId,$newId);$byLabel=[];foreach($source['variants']as$v)$byLabel[$v['label']]=$v;foreach($new as$v)if(isset($byLabel[$v['label']])){ $from=$byLabel[$v['label']];$s=Database::connection()->prepare('UPDATE product_variants SET price_adjustment=?,stock_quantity=?,is_available=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND product_id=? AND store_id=?');$s->execute([$from['price_adjustment'],$from['stock_quantity'],$from['is_available'],$v['id'],$newId,$storeId]);}return$newId;
    }

    public function images(int $storeId,int $productId): array{$s=Database::connection()->prepare('SELECT * FROM product_images WHERE product_id=? AND store_id=? ORDER BY sort_order,id');$s->execute([$productId,$storeId]);return $s->fetchAll();}
    public function options(int $storeId,int $productId): array{$s=Database::connection()->prepare('SELECT * FROM product_options WHERE product_id=? AND store_id=? ORDER BY sort_order,id');$s->execute([$productId,$storeId]);$options=$s->fetchAll();foreach($options as &$o){$v=Database::connection()->prepare('SELECT * FROM product_option_values WHERE option_id=? AND store_id=? ORDER BY sort_order,id');$v->execute([$o['id'],$storeId]);$o['values']=$v->fetchAll();}return $options;}
    public function variants(int $storeId,int $productId): array{$s=Database::connection()->prepare('SELECT * FROM product_variants WHERE product_id=? AND store_id=? ORDER BY id');$s->execute([$productId,$storeId]);return $s->fetchAll();}
    public function bySkus(int$storeId,array$skus):array{if(!$skus)return[];$skus=array_values(array_unique(array_filter(array_map('trim',$skus),static fn($v)=>$v!=='')));if(!$skus)return[];$marks=implode(',',array_fill(0,count($skus),'?'));$s=Database::connection()->prepare("SELECT id,sku,name FROM products WHERE store_id=? AND sku IN ({$marks}) AND deleted_at IS NULL");$s->execute(array_merge([$storeId],$skus));$out=[];foreach($s->fetchAll()as$row)$out[mb_strtolower($row['sku'])]=$row;return$out;}
}
