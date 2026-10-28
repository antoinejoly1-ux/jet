import type { Metadata, Viewport } from "next";
import { Inter, Montserrat } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { localeTag } from "@/lib/locale";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

// Montserrat is Univair's brand face; Inter is only the fallback while it loads.
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-montserrat",
  display: "swap",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap", preload: false });

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: { default: "Univair Management", template: "%s · Univair Management" },
    description: (await getTranslations("brand"))("description"),
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0c0b0a" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0b0a" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  // Set on the server so the chosen look paints from the first frame, with no flash.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang={localeTag(locale)} data-theme={theme} className={`${montserrat.variable} ${inter.variable} h-full`}>
      <body className="min-h-full">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
