<?php
namespace App\Services;

use App\Support\Env;

final class Mailer
{
    public function sendLink(string $email, string $subject, string $url): void
    {
        $driver = Env::get('MAIL_DRIVER', 'log');
        $email = str_replace(["\r", "\n"], '', $email);
        $body = "Use the secure link below. It will expire automatically.\n\n{$url}\n\nIf you did not request this, ignore this email.";
        if ($driver === 'log') {
            $line = sprintf("[%s] To: %s | %s | %s\n", gmdate('c'), $email, $subject, $url);
            error_log($line, 3, BASE_PATH . '/storage/logs/mail.log');
            return;
        }
        $from = Env::get('MAIL_FROM');
        if (!filter_var($from, FILTER_VALIDATE_EMAIL)) throw new \RuntimeException('MAIL_FROM is invalid.');
        if ($driver === 'mail') {
            $headers = ['From: ' . $from, 'Content-Type: text/plain; charset=UTF-8', 'X-Auto-Response-Suppress: All'];
            if (!mail($email, $subject, $body, implode("\r\n", $headers))) throw new \RuntimeException('Mail delivery failed.');
            return;
        }
        if ($driver === 'smtp') { $this->sendSmtp($email, $from, $subject, $body); return; }
        throw new \RuntimeException('Unsupported mail driver.');
    }

    /**
     * Minimal dependency-free SMTP client (RFC 5321/2487). Supports STARTTLS (587),
     * implicit TLS (465), or plaintext (trusted local relays only), and AUTH LOGIN.
     * Deliberately has no third-party dependency, matching this project's baseline.
     */
    private function sendSmtp(string $to, string $from, string $subject, string $body): void
    {
        $host = (string) Env::get('SMTP_HOST');
        if ($host === '') throw new \RuntimeException('SMTP_HOST is not configured.');
        $port = (int) Env::get('SMTP_PORT', '587');
        $encryption = mb_strtolower((string) Env::get('SMTP_ENCRYPTION', 'tls'));
        $username = (string) Env::get('SMTP_USERNAME');
        $password = (string) Env::get('SMTP_PASSWORD');

        $address = ($encryption === 'ssl' ? 'ssl://' : '') . $host . ':' . $port;
        $context = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'SNI_enabled' => true, 'peer_name' => $host]]);
        $socket = @stream_socket_client($address, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $context);
        if (!$socket) throw new \RuntimeException("Could not connect to the SMTP server: {$errstr}");
        stream_set_timeout($socket, 15);

        try {
            $localName = (string) (parse_url(config('app')['url'], PHP_URL_HOST) ?: 'localhost');
            $this->expect($socket, [220]);
            $this->command($socket, "EHLO {$localName}", [250]);

            if ($encryption === 'tls') {
                $this->command($socket, 'STARTTLS', [220]);
                if (!@stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                    throw new \RuntimeException('SMTP STARTTLS negotiation failed.');
                }
                $this->command($socket, "EHLO {$localName}", [250]);
            }

            if ($username !== '') {
                $this->command($socket, 'AUTH LOGIN', [334]);
                $this->command($socket, base64_encode($username), [334]);
                $this->command($socket, base64_encode($password), [235]);
            }

            $this->command($socket, "MAIL FROM:<{$from}>", [250]);
            $this->command($socket, "RCPT TO:<{$to}>", [250, 251]);
            $this->command($socket, 'DATA', [354]);

            $messageId = '<' . bin2hex(random_bytes(16)) . '@' . $localName . '>';
            $headers = [
                'From: ' . $from,
                'To: ' . $to,
                'Subject: =?UTF-8?B?' . base64_encode($subject) . '?=',
                'Date: ' . gmdate('r'),
                'Message-ID: ' . $messageId,
                'MIME-Version: 1.0',
                'Content-Type: text/plain; charset=UTF-8',
                'Content-Transfer-Encoding: 8bit',
                'X-Auto-Response-Suppress: All',
            ];
            $stuffed = (string) preg_replace('/^\./m', '..', $body);
            $this->write($socket, implode("\r\n", $headers) . "\r\n\r\n" . $stuffed . "\r\n.\r\n");
            $this->readResponse($socket, [250]);
            $this->write($socket, "QUIT\r\n");
        } finally {
            fclose($socket);
        }
    }

    private function command($socket, string $line, array $expectedCodes): string
    {
        $this->write($socket, $line . "\r\n");
        return $this->readResponse($socket, $expectedCodes);
    }

    private function expect($socket, array $expectedCodes): string
    {
        return $this->readResponse($socket, $expectedCodes);
    }

    private function write($socket, string $data): void
    {
        if (@fwrite($socket, $data) === false) throw new \RuntimeException('Lost connection to the SMTP server.');
    }

    private function readResponse($socket, array $expectedCodes): string
    {
        $response = '';
        while (($line = fgets($socket, 515)) !== false) {
            $response .= $line;
            if (mb_strlen($line) < 4 || $line[3] !== '-') break;
        }
        if ($response === '') throw new \RuntimeException('No response from the SMTP server.');
        $code = (int) substr($response, 0, 3);
        if (!in_array($code, $expectedCodes, true)) throw new \RuntimeException('SMTP error: ' . trim($response));
        return $response;
    }
}
