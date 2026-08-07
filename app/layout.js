import "./globals.css";
import PwaRegister from "./pwa-register";

export const metadata = {
  title: "日程全清日历",
  description: "2026 年 7 月 29 日至年末的每日计划与完成记录",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/calendar-icon-v2.svg", type: "image/svg+xml" },
      { url: "/calendar-icon-v2-192.png", type: "image/png", sizes: "192x192" },
    ],
    shortcut: "/calendar-icon-v2-192.png",
    apple: "/calendar-icon-v2-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "日程日历",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
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
