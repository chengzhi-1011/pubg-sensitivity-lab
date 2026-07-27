import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PUBG 灵敏度调试助手",
  description: "通过追踪、定位与 360° 横扫测试，生成可直接填入 PUBG PC 的个性化灵敏度。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
