import type { ReactNode } from "react";
import { BottomNav } from "../components/bottom-nav.tsx";
import "./globals.css";

export const metadata = {
  title: "Tulip",
  description: "내가 기억하지 않아도, 우리 집이 지금 해야 할 일을 알려주는 Personal Home OS"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <main className="appShell">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
