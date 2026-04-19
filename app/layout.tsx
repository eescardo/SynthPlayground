import type { Metadata } from "next";
import { brandSproutIconSrc } from "@/resources/images";
import "./globals.css";

export const metadata: Metadata = {
  title: "SynthSprout",
  description: "Playful browser-based synth and music playground.",
  applicationName: "SynthSprout",
  icons: {
    icon: brandSproutIconSrc,
    shortcut: brandSproutIconSrc
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
