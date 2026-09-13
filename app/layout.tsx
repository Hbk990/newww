import type {Metadata} from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {default:"HUQA — Arguileh & Vapes", template:"%s | HUQA"},
  description: "Disposables, e-liquids, machines, coils and nicotine pouches. Order on WhatsApp with delivery across Lebanon.",
  icons: {icon:"/favicon.svg", shortcut:"/favicon.svg"},
  openGraph: {title:"HUQA — Arguileh & Vapes", description:"Disposables, e-liquids, machines, coils and nicotine pouches, delivered across Lebanon.", type:"website"},
};

export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
