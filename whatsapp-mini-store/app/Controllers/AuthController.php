<?php
namespace App\Controllers;

use App\Core\{Auth, Request, Response, Session, View};
use App\Repositories\{AuditLogRepository, UserRepository};
use App\Services\{Mailer, PasswordHasher, RateLimiter, TokenService};
use App\Support\Validation;

final class AuthController
{
    public function registerForm(Request $request): void { if (Auth::id()) $this->redirectAuthenticated(); View::render('auth/register', ['title' => 'Create account']); }

    public function register(Request $request): void
    {
        if (Auth::id()) $this->redirectAuthenticated();
        $security = config('security');
        $identity = $request->ip();
        if ((new RateLimiter)->tooMany('register', $identity, $security['register_attempts'], $security['register_window_seconds'])) $this->fail('/register', 'Too many attempts. Try again later.', $request);
        $name = trim((string) $request->input('name'));
        $email = mb_strtolower(trim((string) $request->input('email')));
        $password = (string) $request->input('password');
        $errors = [];
        if (mb_strlen($name) < 2 || mb_strlen($name) > 100) $errors[] = 'Enter a valid name.';
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 190) $errors[] = 'Enter a valid email address.';
        if ($message = Validation::password($password)) $errors[] = $message;
        if ($password !== (string) $request->input('password_confirmation')) $errors[] = 'Passwords do not match.';
        $users = new UserRepository;
        if ($users->findByEmail($email)) $errors[] = 'An account with this email already exists.';
        if ($errors) $this->fail('/register', implode(' ', $errors), $request);
        try { $id = $users->createMerchant($name, $email, (new PasswordHasher)->hash($password)); }
        catch (\PDOException $e) {
            if ((string) $e->getCode() === '23000') $this->fail('/register', 'An account with this email already exists.', $request);
            throw $e;
        }
        $user = $users->findById($id);
        Auth::login($user);
        $token = (new TokenService)->issue('email_verifications', $id, 1440);
        (new Mailer)->sendLink($email, 'Verify your email', config('app')['url'] . '/email/verify?token=' . $token);
        (new AuditLogRepository)->record($id, 'merchant.registered', 'user', $id);
        Response::redirect('/email/pending');
    }

    public function loginForm(Request $request): void { if (Auth::id()) $this->redirectAuthenticated(); View::render('auth/login', ['title' => 'Merchant login', 'admin' => false]); }
    public function adminLoginForm(Request $request): void { if (Auth::id()) $this->redirectAuthenticated(); View::render('auth/login', ['title' => 'Super-admin login', 'admin' => true]); }

    public function login(Request $request): void { $this->attemptLogin($request, 'MERCHANT', '/dashboard', '/login'); }
    public function adminLogin(Request $request): void { $this->attemptLogin($request, 'SUPER_ADMIN', '/sa', '/sa/login'); }

    private function attemptLogin(Request $request, string $role, string $success, string $failure): void
    {
        $email = mb_strtolower(trim((string) $request->input('email')));
        $identity = $request->ip() . '|' . $email . '|' . $role;
        $security = config('security');
        $limiter = new RateLimiter;
        if ($limiter->tooMany('login_ip', $request->ip().'|'.$role, $security['login_ip_attempts'], $security['login_window_seconds'])) $this->fail($failure, 'Too many login attempts. Try again later.', $request);
        if ($limiter->tooMany('login', $identity, $security['login_attempts'], $security['login_window_seconds'])) $this->fail($failure, 'Too many login attempts. Try again later.', $request);
        $users = new UserRepository;
        $user = $users->findByEmail($email);
        $hasher = new PasswordHasher;
        $candidateHash = $user['password_hash'] ?? $hasher->hash(bin2hex(random_bytes(16)));
        $passwordValid = $hasher->verify((string) $request->input('password'), $candidateHash);
        $valid = $user && $user['platform_role'] === $role && $user['status'] === 'ACTIVE' && $passwordValid;
        if (!$valid) $this->fail($failure, 'The email or password is incorrect.', $request);
        $limiter->clear('login', $identity);
        Auth::login($user);
        $users->recordLogin((int) $user['id']);
        (new AuditLogRepository)->record((int) $user['id'], 'auth.login');
        Response::redirect($success);
    }

    public function logout(Request $request): void
    {
        $id = Auth::id();
        if ($id) (new AuditLogRepository)->record($id, 'auth.logout');
        Auth::logout();
        Response::redirect('/login');
    }

    public function forgotForm(Request $request): void { View::render('auth/forgot', ['title' => 'Reset password']); }
    public function forgot(Request $request): void
    {
        $email = mb_strtolower(trim((string) $request->input('email')));
        $security = config('security');
        $limiter=new RateLimiter;$ipBlocked=$limiter->tooMany('reset_ip',$request->ip(),$security['reset_ip_attempts'],$security['reset_window_seconds']);
        if (!$ipBlocked&&!$limiter->tooMany('reset', $request->ip() . '|' . $email, $security['reset_attempts'], $security['reset_window_seconds'])) {
            $user = (new UserRepository)->findByEmail($email);
            if ($user && $user['status'] === 'ACTIVE') {
                $token = (new TokenService)->issue('password_resets', (int) $user['id'], 30);
                (new Mailer)->sendLink($email, 'Reset your password', config('app')['url'] . '/password/reset?token=' . $token);
            }
        }
        Session::flash('success', 'If that account exists, a reset link has been prepared.');
        Response::redirect('/password/forgot');
    }

    public function resetForm(Request $request): void { View::render('auth/reset', ['title' => 'Choose a new password', 'token' => (string) $request->query('token')]); }
    public function reset(Request $request): void
    {
        $password = (string) $request->input('password');
        if (($message = Validation::password($password)) || $password !== (string) $request->input('password_confirmation')) $this->fail('/password/reset?token=' . urlencode((string) $request->input('token')), $message ?: 'Passwords do not match.', $request);
        $userId = (new TokenService)->consume('password_resets', (string) $request->input('token'));
        if (!$userId) $this->fail('/password/forgot', 'This reset link is invalid or expired.', $request);
        (new UserRepository)->updatePassword($userId, (new PasswordHasher)->hash($password));
        (new AuditLogRepository)->record($userId, 'auth.password_reset');
        Session::flash('success', 'Password updated. You can now sign in.');
        Response::redirect('/login');
    }

    public function verifyEmail(Request $request): void
    {
        $tokens=new TokenService;$raw=(string)$request->query('token');$candidate=$tokens->owner('email_verifications',$raw);if(Auth::id()&&$candidate&&Auth::id()!==$candidate)Response::abort(403);
        $userId = $tokens->consume('email_verifications', $raw);
        if (!$userId) Response::abort(400);
        (new UserRepository)->verifyEmail($userId);
        (new AuditLogRepository)->record($userId, 'auth.email_verified');
        Session::flash('success', 'Email verified.');
        Response::redirect(Auth::id() ? '/onboarding' : '/login');
    }

    public function verificationPending(Request $request): void
    {
        $user = Auth::requireMerchant();
        if ($user['email_verified_at']) Response::redirect('/onboarding');
        View::render('auth/verify_pending', ['title' => 'Verify your email', 'email' => $user['email']]);
    }

    public function resendVerification(Request $request): void
    {
        $user = Auth::requireMerchant();
        if (!$user['email_verified_at']) {
            $security = config('security');
            if (!(new RateLimiter)->tooMany('verification', $request->ip() . '|' . $user['id'], $security['reset_attempts'], $security['reset_window_seconds'])) {
                $token = (new TokenService)->issue('email_verifications', (int) $user['id'], 1440);
                (new Mailer)->sendLink($user['email'], 'Verify your email', config('app')['url'] . '/email/verify?token=' . $token);
            }
        }
        Session::flash('success', 'If verification is still required, a fresh link has been prepared.');
        Response::redirect('/email/pending');
    }

    private function fail(string $path, string $message, Request $request): never
    {
        Session::put('_old', array_diff_key($request->all(), ['password' => true, 'password_confirmation' => true, '_token' => true]));
        Session::flash('error', $message);
        Response::redirect($path);
    }

    private function redirectAuthenticated(): never
    {
        $user = Auth::user();
        Response::redirect($user && $user['platform_role'] === 'SUPER_ADMIN' ? '/sa' : '/dashboard');
    }
}
