import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { getLocale } from "@/lib/i18n/get-locale";
import { localeDirection } from "@/lib/i18n/config";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorker } from "@/components/pwa/service-worker";

// Cairo carries both Arabic and Latin glyphs, giving a consistent bilingual look.
const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "FitFlow",
    template: "%s · FitFlow",
  },
  description: "FitFlow — a modern bilingual gym management system.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "FitFlow",
    // iOS has no manifest: the bar is told to match the app's own dark chrome.
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1a1c22",
  // Installed on a phone the app fills the screen, notch included.
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const dir = localeDirection[locale];

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${cairo.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full font-sans antialiased">
        {children}
        <Toaster />
        <ServiceWorker />
      </body>
    </html>
  );
}
