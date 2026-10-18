import type { Metadata, Viewport } from "next";
import { Fraunces, Nunito_Sans } from "next/font/google";
import { I18nProvider } from "@/i18n";
import "./globals.css";

const display = Fraunces({
  variable: "--font-display-face",
  subsets: ["latin"],
  axes: ["SOFT", "opsz"],
});

const body = Nunito_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Encajamos — rompecabezas con tus fotos", template: "%s · Encajamos" },
  description:
    "Rompecabezas multijugador en tiempo real con tus propias fotos. Armen juntos a distancia o compitan en una carrera.",
  applicationName: "Encajamos",
};

export const viewport: Viewport = {
  themeColor: "#f6efe5",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
