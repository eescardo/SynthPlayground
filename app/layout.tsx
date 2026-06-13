import type { Metadata } from "next";
import { brandSproutFaviconSrc } from "@/resources/images";
import { APP_NAME, UI_TEXT } from "@/lib/uiText";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: UI_TEXT.appDescription,
  applicationName: APP_NAME,
  icons: {
    icon: brandSproutFaviconSrc,
    shortcut: brandSproutFaviconSrc
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
