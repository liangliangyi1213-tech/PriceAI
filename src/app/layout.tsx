import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist } from "next/font/google";
import "./globals.css";
const geist=Geist({variable:"--font-geist-sans",subsets:["latin"]});
export const metadata: Metadata={title:"PriceAI｜智能购物决策助手",description:"比较价格、配置与口碑，找到真正值得买的手机。"};
export default function RootLayout({children}:{children:ReactNode}){return <html className={geist.variable} lang="zh-CN"><body className="min-h-screen bg-white font-sans text-slate-950 antialiased">{children}</body></html>}
