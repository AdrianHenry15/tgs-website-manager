import type { ReactNode } from "react"
import Link from "next/link"

export function LegalPage({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <main className="min-h-full bg-surface text-foreground">
      <article className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-16">
        <Link
          href="/"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          ← Website Manager
        </Link>
        <h1 className="mt-6 border-b border-border pb-6 text-4xl font-semibold tracking-tight">
          {title}
        </h1>
        <div className="mt-8 space-y-7 text-base leading-relaxed text-foreground [&_a]:text-primary [&_a]:underline [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
      </article>
    </main>
  )
}
