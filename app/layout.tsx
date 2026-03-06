import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Synth Playground",
  description: "Browser-based music synthesis + composition MVP"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
