import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ValuePropositionSection } from "@/components/product/value-proposition";
import { SearchForm } from "@/components/search/search-form";
export default function Home(){return <><SiteHeader/><main><section className="overflow-hidden bg-[radial-gradient(circle_at_top,_#dbeafe_0%,_#eff6ff_37%,_#f8fafc_72%)] py-20 sm:py-28 lg:py-36"><div className="mx-auto max-w-6xl px-4 text-center sm:px-6 lg:px-8"><h1 className="mx-auto max-w-4xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">找到真正值得买的东西</h1><p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">PriceAI 帮你比较价格、配置、口碑与平台优惠，做出更理性的购买决定。</p><SearchForm/></div></section><ValuePropositionSection/></main><SiteFooter/></>}
