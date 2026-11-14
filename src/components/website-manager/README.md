# Website Manager production files

Copy the package's `src` and `public` files into the root of `tgs-website-manager`.
Merge the included layout changes if you have edited `src/app/layout.tsx` locally.
Remove the starter `src/app/favicon.ico` so Next.js serves the included `src/app/icon.svg`.
Keep the existing `src/app/globals.css`.

To use the transparent artwork in the existing `Brand()` header, add
`import Image from "next/image"` to `src/app/page.tsx` and replace its decorative
circle with:

```tsx
<Image
  src="/tgs-glowing-circle.svg"
  alt=""
  width={44}
  height={44}
  unoptimized
  className="shrink-0"
/>
```

Before publishing, confirm that the public TGS email address is monitored for
privacy and support requests and that the notice describes your actual vendors
and retention practices. If you use a legal entity name in your client contracts,
use the same name on these pages.

Run `pnpm build` with the existing environment variables, then push through your
usual Vercel deployment workflow. In the deployment, open `/privacy` and `/terms`
while signed out and check the links from the shared footer. Confirm the portal
title, favicon and noindex metadata and sign in to check the footer on the dashboard.
