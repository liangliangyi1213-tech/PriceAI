import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
export const metadata: Metadata={title:"PriceAI｜智能购物决策助手",description:"比较平台报价、查看历史价格，结合评分与购买建议，找到更适合你的商品。"};
export default function RootLayout({children}:{children:ReactNode}){return <html lang="zh-CN"><body className="min-h-screen bg-white font-sans text-slate-950 antialiased">{children}</body></html>}
