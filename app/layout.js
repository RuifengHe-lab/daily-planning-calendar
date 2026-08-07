import "./globals.css";
import PwaRegister from "./pwa-register";

export const metadata = {
  title: "日程全清日历",
  description: "2026 年 7 月 29 日至年末的每日计划与完成记录",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "日程日历",
  },
};

export const viewport = {
  themeColor: "#f2f0e9",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
