import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Critical Think Play",
  description: "Family critical thinking practice app"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
