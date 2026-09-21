import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { cookies } from "next/headers";
import { getLocale } from "@/lib/i18n/get-locale";
import { localeDirection } from "@/lib/i18n/config";
import { THEME_COOKIE, defaultTheme, isTheme } from "@/lib/theme";
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
  const themeCookie = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = isTheme(themeCookie) ? themeCookie : defaultTheme;

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${cairo.variable} ${theme === "dark" ? "dark" : ""} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full font-sans antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
