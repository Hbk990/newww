"use client";

import { useRouter } from "next/navigation";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
          prompt: () => void;
        };
      };
    };
  }
}

/**
 * Google One Tap plus the rendered sign-in button.
 *
 * Both produce the same ID token, which goes to our own endpoint to be
 * verified. The button matters because One Tap is suppressed in plenty of
 * ordinary situations — private windows, a dismissed prompt, browsers blocking
 * third-party state — and without it those people would see no way to use
 * Google at all.
 */
export function GoogleSignIn({
  label,
  clientId,
}: {
  label: string;
  // Passed from the server rather than read from NEXT_PUBLIC_*, so the client
  // id lives in exactly one environment variable instead of two that can drift
  // apart. It is public either way — it ships to the browser by design.
  clientId: string | null;
}) {
  const router = useRouter();
  const holder = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !clientId || !window.google || !holder.current) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async ({ credential }: { credential: string }) => {
        const response = await fetch("/api/auth/google", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ credential }),
        });
        if (response.ok) {
          // The cookie arrived on that response, so every cached server render
          // is now stale — `refresh` is what discards it. Navigating without it
          // would land on a page still rendered as signed out.
          router.replace("/");
          router.refresh();
        } else {
          setError("Google sign-in didn't work. Try your email instead.");
        }
      },
    });

    window.google.accounts.id.renderButton(holder.current, {
      type: "standard",
      theme: "outline",
      size: "large",
      width: 320,
      text: label.startsWith("Sign up") ? "signup_with" : "continue_with",
    });

    window.google.accounts.id.prompt();
  }, [ready, clientId, label, router]);

  // Without a client id configured there is nothing to show, and an inert
  // button is worse than none.
  if (!clientId) return null;

  return (
    <div className="mb-6 flex flex-col gap-3">
      <Script
        src="https://accounts.google.com/gsi/client"
        onReady={() => setReady(true)}
      />
      <div ref={holder} className="min-h-10" />
      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}
