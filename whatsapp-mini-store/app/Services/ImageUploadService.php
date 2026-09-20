<?php
namespace App\Services;

use App\Repositories\ImageRepository;

final class ImageUploadService
{
    public function uploadStoreAsset(int$storeId,string$kind,array$file):string
    {
        if(!in_array($kind,['logo','banner'],true))throw new \DomainException('Invalid store image type.');$config=config('uploads');if((int)($file['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_OK)throw new \DomainException('The store image could not be uploaded.');if((int)$file['size']<=0||(int)$file['size']>$config['max_bytes'])throw new \DomainException('The store image must be smaller than 5 MB.');if(!is_uploaded_file($file['tmp_name'])&&PHP_SAPI!=='cli')throw new \DomainException('Invalid upload source.');
        $mime=(new \finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);$dimensions=@getimagesize($file['tmp_name']);$extension=mb_strtolower(pathinfo((string)$file['name'],PATHINFO_EXTENSION));if(!is_string($mime)||!isset($config['mime_extensions'][$mime])||!is_array($dimensions))throw new \DomainException('Only real JPEG, PNG, or WebP images are accepted.');$valid=$mime==='image/jpeg'?['jpg','jpeg']:[$config['mime_extensions'][$mime]];if(!in_array($extension,$valid,true))throw new \DomainException('The image extension does not match its file contents.');[$width,$height]=$dimensions;if($width<$config['min_width']||$height<$config['min_height']||$width>$config['max_width']||$height>$config['max_height']||$width*$height>$config['max_pixels'])throw new \DomainException('Images must be 300–6000 pixels per side and no more than 16 megapixels.');if($kind==='banner'&&$width<800)throw new \DomainException('Banner images must be at least 800 pixels wide.');
        $directory=BASE_PATH."/public/uploads/stores/{$storeId}/branding";if(!is_dir($directory)&&!mkdir($directory,0755,true)&&!is_dir($directory))throw new \RuntimeException('Could not create branding directory.');$name=$kind.'-'.bin2hex(random_bytes(20)).'.'.$config['mime_extensions'][$mime];$target=$directory.'/'.$name;$moved=PHP_SAPI==='cli'?copy($file['tmp_name'],$target):move_uploaded_file($file['tmp_name'],$target);if(!$moved)throw new \RuntimeException('Could not store branding image.');chmod($target,0644);return"/uploads/stores/{$storeId}/branding/{$name}";
    }
    public function uploadCategory(int $storeId,array $file):string
    {
        $config=config('uploads');if((int)($file['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_OK)throw new \DomainException('The category image could not be uploaded.');if((int)$file['size']<=0||(int)$file['size']>$config['max_bytes'])throw new \DomainException('The category image must be smaller than 5 MB.');if(!is_uploaded_file($file['tmp_name'])&&PHP_SAPI!=='cli')throw new \DomainException('Invalid upload source.');
        $mime=(new \finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);$dimensions=@getimagesize($file['tmp_name']);$extension=mb_strtolower(pathinfo((string)$file['name'],PATHINFO_EXTENSION));if(!is_string($mime)||!isset($config['mime_extensions'][$mime])||!is_array($dimensions))throw new \DomainException('Only real JPEG, PNG, or WebP images are accepted.');$valid=$mime==='image/jpeg'?['jpg','jpeg']:[$config['mime_extensions'][$mime]];if(!in_array($extension,$valid,true))throw new \DomainException('The image extension does not match its file contents.');[$width,$height]=$dimensions;if($width<$config['min_width']||$height<$config['min_height']||$width>$config['max_width']||$height>$config['max_height']||$width*$height>$config['max_pixels'])throw new \DomainException('Images must be 300–6000 pixels per side and no more than 16 megapixels.');
        $directory=BASE_PATH."/public/uploads/stores/{$storeId}/categories";if(!is_dir($directory)&&!mkdir($directory,0755,true)&&!is_dir($directory))throw new \RuntimeException('Could not create upload directory.');$name=bin2hex(random_bytes(20)).'.'.$config['mime_extensions'][$mime];$target=$directory.'/'.$name;$moved=PHP_SAPI==='cli'?copy($file['tmp_name'],$target):move_uploaded_file($file['tmp_name'],$target);if(!$moved)throw new \RuntimeException('Could not store category image.');chmod($target,0644);return"/uploads/stores/{$storeId}/categories/{$name}";
    }

    public function removePath(?string $path):void
    {
        if(!$path)return;$relative=parse_url($path,PHP_URL_PATH);if(!is_string($relative)||!str_starts_with($relative,'/uploads/stores/'))return;$directory=realpath(BASE_PATH.'/public'.dirname($relative));$root=realpath(BASE_PATH.'/public/uploads');if(!$directory||!$root||!str_starts_with($directory,$root.DIRECTORY_SEPARATOR))return;$file=$directory.'/'.basename($relative);if(is_file($file))unlink($file);
    }
    public function uploadMany(int $storeId,int $productId,?array $files): array
    {
        if(!$files||!isset($files['name']))return[];$normalized=array_values(array_filter($this->normalize($files),static fn($file)=>(int)$file['error']!==UPLOAD_ERR_NO_FILE));if(!$normalized)return[];$config=config('uploads');$repo=new ImageRepository;$remaining=$config['max_files_per_product']-$repo->countForProduct($storeId,$productId);
        if(count($normalized)>$remaining)throw new \DomainException('A product can contain at most '.$config['max_files_per_product'].' images.');
        $stored=[];$pdo=\App\Core\Database::connection();$pdo->beginTransaction();
        try{foreach($normalized as$file)$stored[]=$this->store($storeId,$productId,$file);foreach($stored as$image)$repo->add($storeId,$productId,$image);$pdo->commit();return$stored;}catch(\Throwable$e){if($pdo->inTransaction())$pdo->rollBack();foreach($stored as$image)$this->removeFiles($image);throw$e;}
    }

    private function store(int $storeId,int $productId,array $file): array
    {
        $config=config('uploads');
        if((int)$file['error']!==UPLOAD_ERR_OK)throw new \DomainException('One image could not be uploaded.');
        if((int)$file['size']<=0||(int)$file['size']>$config['max_bytes'])throw new \DomainException('Images must be smaller than 5 MB.');
        if(!is_uploaded_file($file['tmp_name'])&&PHP_SAPI!=='cli')throw new \DomainException('Invalid upload source.');
        $finfo=new \finfo(FILEINFO_MIME_TYPE);$mime=$finfo->file($file['tmp_name']);$dimensions=@getimagesize($file['tmp_name']);$originalExtension=mb_strtolower(pathinfo((string)$file['name'],PATHINFO_EXTENSION));
        if(!is_string($mime)||!isset($config['mime_extensions'][$mime])||!is_array($dimensions))throw new \DomainException('Only real JPEG, PNG, or WebP images are accepted.');
        $validExtensions=$mime==='image/jpeg'?['jpg','jpeg']:[$config['mime_extensions'][$mime]];if(!in_array($originalExtension,$validExtensions,true))throw new \DomainException('The image extension does not match its file contents.');
        [$width,$height]=$dimensions;if($width<$config['min_width']||$height<$config['min_height']||$width>$config['max_width']||$height>$config['max_height']||$width*$height>$config['max_pixels'])throw new \DomainException('Images must be 300–6000 pixels per side and no more than 16 megapixels.');
        $extension=$config['mime_extensions'][$mime];$directory=BASE_PATH."/public/uploads/stores/{$storeId}/products/{$productId}";
        if(!is_dir($directory)&&!mkdir($directory,0755,true)&&!is_dir($directory))throw new \RuntimeException('Could not create upload directory.');
        $name=bin2hex(random_bytes(20)).'.'.$extension;$target=$directory.'/'.$name;
        $moved=PHP_SAPI==='cli'?copy($file['tmp_name'],$target):move_uploaded_file($file['tmp_name'],$target);if(!$moved)throw new \RuntimeException('Could not store image.');chmod($target,0644);
        $thumb=$this->thumbnail($target,$mime,$width,$height,$directory,$name);
        return['path'=>"/uploads/stores/{$storeId}/products/{$productId}/{$name}",'thumbnail_path'=>$thumb?"/uploads/stores/{$storeId}/products/{$productId}/{$thumb}":null,'mime_type'=>$mime,'size_bytes'=>(int)$file['size'],'width'=>$width,'height'=>$height];
    }

    private function thumbnail(string $source,string $mime,int $width,int $height,string $directory,string $name):?string
    {
        if(!extension_loaded('gd')||$width*$height>12000000)return null;$create=match($mime){'image/jpeg'=>'imagecreatefromjpeg','image/png'=>'imagecreatefrompng','image/webp'=>'imagecreatefromwebp',default=>null};if(!$create||!function_exists($create))return null;$src=@$create($source);if(!$src)return null;
        $max=640;$scale=min(1,$max/max($width,$height));$w=max(1,(int)round($width*$scale));$h=max(1,(int)round($height*$scale));$dst=imagecreatetruecolor($w,$h);
        if($mime==='image/png'){imagealphablending($dst,false);imagesavealpha($dst,true);}imagecopyresampled($dst,$src,0,0,0,0,$w,$h,$width,$height);$thumb='thumb-'.$name;$path=$directory.'/'.$thumb;
        $ok=match($mime){'image/jpeg'=>imagejpeg($dst,$path,82),'image/png'=>imagepng($dst,$path,7),'image/webp'=>imagewebp($dst,$path,82),default=>false};imagedestroy($src);imagedestroy($dst);return$ok?$thumb:null;
    }

    public function removeFiles(array $image): void
    {
        foreach(['path','thumbnail_path']as$key)$this->removePath($image[$key]??null);
    }

    private function normalize(array $files): array
    {
        if(!is_array($files['name']))return[$files];$out=[];foreach($files['name']as$i=>$name)$out[]=['name'=>$name,'type'=>$files['type'][$i]??'','tmp_name'=>$files['tmp_name'][$i]??'','error'=>$files['error'][$i]??UPLOAD_ERR_NO_FILE,'size'=>$files['size'][$i]??0];return$out;
    }
}
