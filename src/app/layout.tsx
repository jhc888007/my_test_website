import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Trust-Flow · 私人信托演示",
  description: "Trust-Flow Private Trust Demo",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={cn("dark", inter.variable)}
      style={{
        backgroundColor: "#001529",
        minHeight: "100%",
      }}
    >
      <body className={cn("font-sans")} style={{ backgroundColor: "transparent" }}>
        {children}
      </body>
    </html>
  );
}
