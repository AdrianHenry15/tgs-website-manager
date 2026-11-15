import type { Metadata } from "next"
import Link from "next/link"
import {
  buttonClass,
  panelClass,
  secondaryButtonClass,
} from "@/components/website-manager/styles"

const pageUrl = "https://website-manager.thirdgenerationstudios.com/maintenance"
const description =
  "Monthly website maintenance from Third Generation Studios. Request content updates, report issues, and follow progress through your client portal."

const inquiryHref =
  "mailto:ahenry@thirdgenerationstudios.com?subject=Website%20maintenance%20inquiry"

const allowIndexing = process.env.VERCEL_ENV === "production"

export const metadata: Metadata = {
  title: "Website Maintenance",
  description,
  alternates: { canonical: pageUrl },
  robots: { index: allowIndexing, follow: allowIndexing },
  openGraph: {
    type: "website",
    title: "Website Maintenance | Third Generation Studios",
    description,
    url: pageUrl,
  },
}

const maintenanceServices = [
  {
    title: "Content updates",
    description:
      "Request changes to copy, images, links, and other content on existing pages.",
  },
  {
    title: "Website fixes",
    description:
      "Flag broken links, layout problems, or forms that aren’t working. Share the page and attach a screenshot when it helps.",
  },
  {
    title: "Request tracking",
    description:
      "See open requests, read updates from TGS, and look back at completed work in your client portal.",
  },
]

export default function MaintenancePage() {
  return (
    <main className="min-h-dvh bg-[#10100f] text-stone-100">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-800 py-5">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="size-3 rounded-full bg-white shadow-[0_0_8px_2px_rgba(255,255,255,0.65),0_0_22px_4px_rgba(255,255,255,0.2)]"
            />
            <span className="text-sm font-medium">
              Third Generation Studios
            </span>
          </div>

          <Link href="/" className={secondaryButtonClass}>
            Client sign-in
          </Link>
        </header>

        <section className="bg-[radial-gradient(ellipse_at_top_right,rgba(249,115,22,0.14),transparent_55%)] py-16 sm:py-24">
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
            Monthly website maintenance
          </h1>

          <p className="mt-5 max-w-xl text-base text-stone-300 sm:text-lg">
            Send us website fixes and content changes through your client
            portal. You’ll have one place to see what’s open, what’s in
            progress, and what we’ve completed.
          </p>

          <a href={inquiryHref} className={`${buttonClass} mt-8 inline-flex`}>
            Ask about maintenance
          </a>
        </section>

        <section
          aria-labelledby="maintenance-services"
          className="pb-16 sm:pb-20">
          <h2 id="maintenance-services" className="text-2xl font-semibold">
            What you can request
          </h2>

          <ul className="mt-6 grid gap-4 md:grid-cols-3">
            {maintenanceServices.map(({ title, description }) => (
              <li key={title} className={panelClass}>
                <h3 className="font-semibold text-stone-100">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-stone-400">
                  {description}
                </p>
              </li>
            ))}
          </ul>

          <p className="mt-6 max-w-2xl text-sm leading-6 text-stone-400">
            Planning a redesign or a new feature? Tell us what you have in mind.
            We’ll confirm the scope and pricing before work begins.
          </p>
        </section>
      </div>
    </main>
  )
}
