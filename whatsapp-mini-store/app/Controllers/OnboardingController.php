<?php
namespace App\Controllers;

use App\Core\{Auth, Request, Response, Session, View};
use App\Repositories\{AuditLogRepository, StoreRepository};
use App\Support\Validation;
use PDOException;

final class OnboardingController
{
    public function form(Request $request): void
    {
        $user = Auth::requireMerchant();
        if (!$user['email_verified_at']) Response::redirect('/email/pending');
        $stores=new StoreRepository;if($stores->firstOwnedBy((int)$user['id'])&&!$stores->canCreateForOwner((int)$user['id'])){Session::flash('error','Your current plan does not allow another store.');Response::redirect('/merchant/subscription');}
        View::render('onboarding/create', ['title' => 'Create your store', 'app' => config('app')]);
    }

    public function create(Request $request): void
    {
        $user = Auth::requireMerchant();
        if (!$user['email_verified_at']) Response::redirect('/email/pending');
        $data = [
            'business_name' => trim((string) $request->input('business_name')),
            'whatsapp_number' => trim((string) $request->input('whatsapp_number')),
            'country_code' => strtoupper(trim((string) $request->input('country_code'))),
            'currency_code' => strtoupper(trim((string) $request->input('currency_code'))),
            'slug' => mb_strtolower(trim((string) $request->input('slug'))),
            'theme' => mb_strtolower(trim((string) $request->input('theme'))),
        ];
        $app = config('app'); $errors = [];
        if (mb_strlen($data['business_name']) < 2 || mb_strlen($data['business_name']) > 120) $errors[] = 'Enter a valid business name.';
        if (!Validation::phone($data['whatsapp_number'])) $errors[] = 'Use an international WhatsApp number such as +96171123456.';
        if (!isset($app['countries'][$data['country_code']])) $errors[] = 'Choose a supported country.';
        if (!in_array($data['currency_code'], $app['currencies'], true)) $errors[] = 'Choose a supported currency.';
        if (!Validation::slug($data['slug']) || mb_strlen($data['slug']) < 3 || mb_strlen($data['slug']) > 63) $errors[] = 'Slug must be 3–63 lowercase letters, numbers, or single hyphens.';
        if (in_array($data['slug'], $app['reserved_slugs'], true)) $errors[] = 'That store address is reserved.';
        if (!in_array($data['theme'], $app['themes'], true)) $errors[] = 'Choose a valid theme.';
        $stores = new StoreRepository;
        if ($stores->slugExists($data['slug'])) $errors[] = 'That store address is already in use.';
        if ($errors) {
            Session::put('_old', $data); Session::flash('error', implode(' ', $errors)); Response::redirect('/onboarding');
        }
        try { $storeId = $stores->createForOwner((int) $user['id'], $data); }
        catch (\DomainException $e) { Session::flash('error',$e->getMessage());Response::redirect('/merchant/subscription',303); }
        catch (PDOException $e) {
            if ((string) $e->getCode() === '23000') { Session::flash('error', 'That store address is already in use.'); Response::redirect('/onboarding'); }
            throw $e;
        }
        (new AuditLogRepository)->record((int) $user['id'], 'store.created', 'store', $storeId);
        Session::put('active_store_id',$storeId);
        Session::flash('success', 'Your store has been created as a draft.');
        Response::redirect('/dashboard');
    }
}
