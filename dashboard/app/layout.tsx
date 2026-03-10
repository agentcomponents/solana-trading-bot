import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Solana Trading Bot Dashboard",
  description: "Real-time trading bot monitoring and management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
