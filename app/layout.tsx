import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PDF図面情報抽出システム",
  description: "建築用PDF図面からNo.と☆情報を抽出して整形するツール",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
