<?php
namespace App\Services;

use App\Support\Slug;

final class ProductImportService
{
    public function commit(\PDO$pdo,int$storeId,array$rows):array
    {
        $access=new PlanAccessService;$access->context($storeId,$pdo,true,false);$required=$this->requiredCapacity($pdo,$storeId,$rows);$access->assertCanAddMany($storeId,$required,$pdo);$created=0;$updated=0;$categories=0;$variants=0;$find=$pdo->prepare('SELECT id FROM products WHERE store_id=? AND sku=? AND deleted_at IS NULL FOR UPDATE');$update=$pdo->prepare('UPDATE products SET category_id=?,name=?,description=?,price=?,compare_price=?,availability=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND store_id=?');$insert=$pdo->prepare("INSERT INTO products (store_id,category_id,name,slug,sku,description,price,compare_price,availability,is_featured,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,0,'DRAFT',UTC_TIMESTAMP(),UTC_TIMESTAMP())");
        $groups=[];foreach($rows as$row)$groups[$row['sku']][]=$row;
        foreach($groups as$sku=>$groupRows){
            $primary=null;foreach($groupRows as$row)if($row['is_primary']){$primary=$row;break;}$primary??=$groupRows[0];
            $categoryId=null;if($primary['category']!==''){$categoryId=$this->category($pdo,$storeId,$primary['category'],$categories);}
            $find->execute([$storeId,$sku]);$id=$find->fetchColumn();$compare=$primary['compare_price']===''?null:$primary['compare_price'];$description=$primary['description']===''?null:$primary['description'];
            if($id){$update->execute([$categoryId,$primary['name'],$description,$primary['price'],$compare,$primary['availability'],$id,$storeId]);$updated++;}
            else{$slug=$this->uniqueSlug($pdo,$storeId,$primary['name']);$insert->execute([$storeId,$categoryId,$primary['name'],$slug,$sku,$description,$primary['price'],$compare,$primary['availability']]);$id=(int)$pdo->lastInsertId();$created++;}
            $variantRows=array_values(array_filter($groupRows,static fn($r)=>$r['combo']!==null));
            if($variantRows)$variants+=$this->syncImportedVariants($pdo,$storeId,(int)$id,$variantRows);
        }
        return['created'=>$created,'updated'=>$updated,'categories'=>$categories,'variants'=>$variants];
    }

    /**
     * Additive and non-destructive on purpose: creates a variant matching a row's option combination
     * if none exists yet (matched by the same "Name: Value / Name: Value" label the manual variant
     * editor builds), or updates its SKU/price adjustment/stock if it already exists. A CSV re-import
     * never deletes a variant just because a later file omits it — that would silently destroy stock
     * history and photos over a merchant's typo, which is far worse than leaving a stale row for them
     * to clean up by hand.
     */
    private function syncImportedVariants(\PDO$pdo,int$storeId,int$productId,array$variantRows):int
    {
        $optionIds=[];$optionOrder=0;$synced=0;
        $findOption=$pdo->prepare('SELECT id FROM product_options WHERE store_id=? AND product_id=? AND name=? LIMIT 1 FOR UPDATE');
        $insertOption=$pdo->prepare('INSERT INTO product_options (store_id,product_id,name,sort_order,created_at,updated_at) VALUES (?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())');
        $findValue=$pdo->prepare('SELECT id FROM product_option_values WHERE store_id=? AND option_id=? AND value=? LIMIT 1 FOR UPDATE');
        $insertValue=$pdo->prepare('INSERT INTO product_option_values (store_id,option_id,value,sort_order,created_at) VALUES (?,?,?,?,UTC_TIMESTAMP())');
        $findVariant=$pdo->prepare('SELECT id FROM product_variants WHERE store_id=? AND product_id=? AND label=? LIMIT 1 FOR UPDATE');
        $updateVariant=$pdo->prepare('UPDATE product_variants SET sku=?,price_adjustment=?,stock_quantity=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND store_id=?');
        $insertVariant=$pdo->prepare("INSERT INTO product_variants (store_id,product_id,label,sku,price_adjustment,stock_quantity,is_available,created_at,updated_at) VALUES (?,?,?,?,?,?,1,UTC_TIMESTAMP(),UTC_TIMESTAMP())");
        $insertLink=$pdo->prepare('INSERT INTO product_variant_values (store_id,variant_id,option_value_id) VALUES (?,?,?)');
        foreach($variantRows as$row){
            $valueIds=[];$labelParts=[];
            foreach($row['combo']as[$name,$value]){
                if(!isset($optionIds[$name])){
                    $findOption->execute([$storeId,$productId,$name]);$optionId=$findOption->fetchColumn();
                    if(!$optionId){$insertOption->execute([$storeId,$productId,$name,$optionOrder++]);$optionId=(int)$pdo->lastInsertId();}
                    $optionIds[$name]=(int)$optionId;
                }
                $optionId=$optionIds[$name];
                $findValue->execute([$storeId,$optionId,$value]);$valueId=$findValue->fetchColumn();
                if(!$valueId){$countStmt=$pdo->prepare('SELECT COUNT(*) FROM product_option_values WHERE store_id=? AND option_id=?');$countStmt->execute([$storeId,$optionId]);$insertValue->execute([$storeId,$optionId,$value,(int)$countStmt->fetchColumn()]);$valueId=(int)$pdo->lastInsertId();}
                $valueIds[]=(int)$valueId;$labelParts[]=$name.': '.$value;
            }
            $label=mb_substr(implode(' / ',$labelParts),0,300);
            $variantSku=$row['variant_sku']===''?null:$row['variant_sku'];
            $adjustment=$row['variant_price_adjustment']===''?'0.00':$row['variant_price_adjustment'];
            $stock=$row['variant_stock']===''?null:$row['variant_stock'];
            $findVariant->execute([$storeId,$productId,$label]);$variantId=$findVariant->fetchColumn();
            if($variantId){$updateVariant->execute([$variantSku,$adjustment,$stock,$variantId,$storeId]);}
            else{$insertVariant->execute([$storeId,$productId,$label,$variantSku,$adjustment,$stock]);$variantId=(int)$pdo->lastInsertId();foreach($valueIds as$valueId)$insertLink->execute([$storeId,$variantId,$valueId]);}
            $synced++;
        }
        return$synced;
    }
    private function requiredCapacity(\PDO$pdo,int$storeId,array$rows):array{$existingProducts=$pdo->prepare('SELECT sku FROM products WHERE store_id=? AND deleted_at IS NULL');$existingProducts->execute([$storeId]);$productSet=[];foreach($existingProducts->fetchAll(\PDO::FETCH_COLUMN)as$sku)$productSet[mb_strtolower((string)$sku)]=true;$existingCategories=$pdo->prepare('SELECT name FROM categories WHERE store_id=? AND deleted_at IS NULL');$existingCategories->execute([$storeId]);$categorySet=[];foreach($existingCategories->fetchAll(\PDO::FETCH_COLUMN)as$name)$categorySet[mb_strtolower(trim((string)$name))]=true;$newProducts=0;$newCategories=0;foreach($rows as$row){$sku=mb_strtolower((string)$row['sku']);if(!isset($productSet[$sku])){$productSet[$sku]=true;$newProducts++;}$category=mb_strtolower(trim((string)$row['category']));if($category!==''&&!isset($categorySet[$category])){$categorySet[$category]=true;$newCategories++;}}return['products'=>$newProducts,'categories'=>$newCategories];}
    private function category(\PDO$pdo,int$storeId,string$name,int&$created):int{$s=$pdo->prepare('SELECT id FROM categories WHERE store_id=? AND name=? AND deleted_at IS NULL LIMIT 1 FOR UPDATE');$s->execute([$storeId,$name]);$id=$s->fetchColumn();if($id)return(int)$id;$slug=$this->uniqueCategorySlug($pdo,$storeId,$name);$i=$pdo->prepare("INSERT INTO categories (store_id,name,slug,description,sort_order,status,created_at,updated_at) SELECT ?,?,?,NULL,COALESCE(MAX(sort_order),-1)+1,'ACTIVE',UTC_TIMESTAMP(),UTC_TIMESTAMP() FROM categories WHERE store_id=? AND deleted_at IS NULL");$i->execute([$storeId,$name,$slug,$storeId]);$created++;return(int)$pdo->lastInsertId();}
    private function uniqueSlug(\PDO$pdo,int$storeId,string$name):string{$base=Slug::make($name)?:'product';$slug=$base;$n=2;$s=$pdo->prepare('SELECT 1 FROM products WHERE store_id=? AND slug=? LIMIT 1');while(true){$s->execute([$storeId,$slug]);if(!$s->fetchColumn())return$slug;$slug=mb_substr($base,0,170).'-'.$n++;}}
    private function uniqueCategorySlug(\PDO$pdo,int$storeId,string$name):string{$base=mb_substr(Slug::make($name)?:'category',0,90);$slug=$base;$n=2;$s=$pdo->prepare('SELECT 1 FROM categories WHERE store_id=? AND slug=? LIMIT 1');while(true){$s->execute([$storeId,$slug]);if(!$s->fetchColumn())return$slug;$slug=mb_substr($base,0,90).'-'.$n++;}}
}
