import type { Metadata } from "next";

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
    <html lang="vi">
      <body style={{ fontFamily: "system-ui", margin: "2rem" }}>{children}</body>
    </html>
  );
}
