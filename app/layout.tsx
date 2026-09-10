import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "DRPHONE",
  description: "Phone accessories, audio, gaming and home electronics.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
