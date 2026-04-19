import type { Metadata } from "next";
import { Inter } from "next/font/google";

import AppThemeProvider from "@/components/AppThemeProvider";

const inter = Inter({ subsets: ["latin", "vietnamese"], display: "swap" });

export const metadata: Metadata = {
  title: "RAGFlow Legal",
  description: "Chatbot pháp lý (dev)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className={inter.className}>
      <body>
        <AppThemeProvider>{children}</AppThemeProvider>
      </body>
    </html>
  );
}
