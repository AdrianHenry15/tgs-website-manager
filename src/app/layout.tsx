import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import Link from "next/link"
import "./globals.css"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  title: {
    default: "Website Manager | Third Generation Studios",
    template: "%s | TGS Website Manager",
  },
  description:
    "Submit website requests, track updates, and view maintenance usage for your managed websites.",
  applicationName: "TGS Website Manager",
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-dvh flex-col">
        <div className="min-w-0 flex-1">{children}</div>
        <footer className="border-t border-stone-800 bg-stone-950 text-sm text-stone-400">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
            <span>Third Generation Studios</span>
            <nav aria-label="Legal" className="flex flex-wrap gap-5">
              <Link className="hover:text-orange-200 hover:underline" href="/privacy">
                Privacy
              </Link>
              <Link className="hover:text-orange-200 hover:underline" href="/terms">
                Terms of use
              </Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  )
}
