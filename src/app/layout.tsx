import type { Metadata } from "next"
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google"
import Link from "next/link"
import "./globals.css"

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
})

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
})

export const metadata: Metadata = {
  title: {
    default: "Website Manager | Third Generation Studios",
    template: "%s | TGS Website Manager",
  },
  description:
    "Submit website requests, follow updates, and manage your website maintenance subscription.",
  applicationName: "TGS Website Manager",
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-dvh flex-col">
        <div className="min-w-0 flex-1">{children}</div>

        <footer className="border-t border-border bg-surface text-sm text-muted">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
            <span>Third Generation Studios</span>

            <nav aria-label="Legal" className="flex flex-wrap gap-5">
              <Link
                className="rounded-sm underline-offset-4 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                href="/privacy"
              >
                Privacy
              </Link>

              <Link
                className="rounded-sm underline-offset-4 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                href="/terms"
              >
                Terms of use
              </Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  )
}