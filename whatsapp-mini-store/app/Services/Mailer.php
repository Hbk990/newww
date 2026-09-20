<?php
namespace App\Services;

use App\Support\Env;

final class Mailer
{
    public function sendLink(string $email, string $subject, string $url): void
    {
        $driver = Env::get('MAIL_DRIVER', 'log');
        $email = str_replace(["\r", "\n"], '', $email);
        if ($driver === 'log') {
            $line = sprintf("[%s] To: %s | %s | %s\n", gmdate('c'), $email, $subject, $url);
            error_log($line, 3, BASE_PATH . '/storage/logs/mail.log');
            return;
        }
        if ($driver !== 'mail') throw new \RuntimeException('Unsupported mail driver.');
        $from = Env::get('MAIL_FROM');
        if (!filter_var($from, FILTER_VALIDATE_EMAIL)) throw new \RuntimeException('MAIL_FROM is invalid.');
        $body = "Use the secure link below. It will expire automatically.\n\n{$url}\n\nIf you did not request this, ignore this email.";
        $headers = ['From: ' . $from, 'Content-Type: text/plain; charset=UTF-8', 'X-Auto-Response-Suppress: All'];
        if (!mail($email, $subject, $body, implode("\r\n", $headers))) throw new \RuntimeException('Mail delivery failed.');
    }
}
