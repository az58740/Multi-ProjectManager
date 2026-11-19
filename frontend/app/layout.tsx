import type { Metadata, Viewport } from "next";
import "@fontsource-variable/vazirmatn";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "گروه بازرگانی و توسعه | Trade & Development Group",
  description: "معرفی مجموعه‌ای فعال در صادرات میوه و تره‌بار، سردخانه، سورتینگ همکار، ساخت‌وساز و اجارهٔ املاک. Fresh produce exports, cold storage, sorting partners, construction and property rentals.",
  applicationName: "Trade & Development Group",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#173f34",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" data-scroll-behavior="smooth">
      <body className="min-h-screen bg-cream font-sans text-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
