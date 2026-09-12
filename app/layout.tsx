import type { Metadata } from "next";

import { storefrontSettings } from "@/lib/storefront/settings";

import "./globals.css";

/**
 * `isPrivate` is honoured here rather than per page, because a page that
 * forgets it is a page that gets indexed — and being indexed half-built is
 * slow and awkward to undo. Covering the admin area too is no loss; it should
 * never have been indexed either.
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await storefrontSettings();
  return {
    title: settings.storeName,
    description: "Phone accessories, audio, gaming and home electronics.",
    robots: settings.isPrivate
      ? { index: false, follow: false, nocache: true }
      : undefined,
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Stamps the stored theme before first paint.
          Without this the page renders in the system theme and then snaps to
          the chosen one — a visible flash on every navigation. It has to be
          inline and synchronous in <head>, because anything deferred runs after
          the paint it is meant to prevent. suppressHydrationWarning on <html>
          is for the attribute this adds, which the server did not render.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("drphone.theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`,
          }}
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
