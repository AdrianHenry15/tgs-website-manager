import type { Metadata } from "next"
import Link from "next/link"
import {
  linkButtonClass,
  panelClass,
} from "@/components/website-manager/styles"

export const metadata: Metadata = {
  title: "Test Checkout Return",
  robots: { index: false, follow: false },
}

export default function CheckoutReturnPage() {
  return (
    <main className="min-h-dvh bg-[#10100f] px-5 py-12 text-stone-100">
      <section className={`${panelClass} mx-auto max-w-lg space-y-4`}>
        <h1 className="text-2xl font-semibold">Back from test checkout</h1>

        <p className="text-sm leading-6 text-stone-300">
          Check your Stripe sandbox to confirm the subscription and test
          payment.
        </p>

        <Link href="/maintenance" className={linkButtonClass}>
          Back to website maintenance
        </Link>
      </section>
    </main>
  )
}
