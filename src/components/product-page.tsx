import Link from "next/link";
import { Shell } from "./ui";
import BrandMark from "./brand-mark";
import { productPages, type ProductPageKey } from "@/lib/product-pages";
export default function ProductPage({ kind }: { kind: ProductPageKey }) {
 const page = productPages[kind];
 return <Shell active="methodology"><article className="vq-policy"><header><BrandMark /><span className="eyebrow">VEGAS QUANT · JOURNEYBUILT, LLC</span><h1>{page.title}</h1><p>{page.intro}</p></header><nav aria-label="Help and policies">{Object.entries(productPages).map(([key,value])=><Link key={key} href={`/${key}`} aria-current={key===kind?"page":undefined}>{key==="responsible-play"?"Responsible play":key==="about"?"About":key==="faq"?"FAQs":key==="support"?"Support":value.title}</Link>)}</nav>{page.sections.map(([heading,body])=>kind==="faq"?<details key={heading}><summary>{heading}</summary><p>{body}</p></details>:<section key={heading}><h2>{heading}</h2><p>{body}</p></section>)}{kind==="responsible-play"?<div className="vq-help-actions"><a href="tel:18006973738">Call 1-800-MY-RESET</a><a href="https://www.ncpgambling.org/help-treatment/" target="_blank" rel="noreferrer">Find help & treatment ↗</a></div>:null}<div className="vq-help-actions"><Link href="/faq">Read the FAQs</Link><Link href="/membership">Open Account</Link><Link href="/methodology">Research methodology</Link></div></article></Shell>;
}
