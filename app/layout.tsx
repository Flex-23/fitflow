import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { getLocale } from "@/lib/i18n/get-locale";
import { localeDirection } from "@/lib/i18n/config";
import { Toaster } from "@/components/ui/sonner";

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
      </body>
    </html>
  );
}
