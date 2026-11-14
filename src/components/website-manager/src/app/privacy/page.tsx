import type { Metadata } from "next"
import { LegalPage } from "@/components/website-manager/legal-page"

export const metadata: Metadata = {
  title: "Privacy notice",
  description: "How Third Generation Studios handles information in Website Manager.",
}

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy notice">
      <p>
        Third Generation Studios (TGS) operates Website Manager for clients whose sites
        we maintain. This notice applies to the portal and the information submitted through it.
      </p>

      <section>
        <h2>Information the portal handles</h2>
        <ul>
          <li>Account email, sign-in and recovery information, and access assignments.</li>
          <li>Website details and requests, including titles, descriptions, page URLs, screenshots, and updates.</li>
          <li>Maintenance records, including the work date and time logged against a request.</li>
          <li>Technical information such as IP address, browser information, and security events that hosting and authentication services may process.</li>
        </ul>
        <p className="mt-3">
          Your browser stores session information to keep you signed in. Supabase manages
          authentication for Website Manager and CoffeeShopCRM through a shared account.
          A password reset applies to that shared account.
        </p>
      </section>

      <section>
        <h2>How we use this information</h2>
        <p>
          We use portal information to authenticate users, verify website access, respond
          to requests, show progress, track maintenance usage, and investigate technical
          or security issues.
        </p>
      </section>

      <section>
        <h2>Who can access it</h2>
        <p>
          People assigned to a website and authorized managers can see that website’s
          requests, screenshots, client-visible updates, and maintenance usage. Keep this
          in mind when submitting details or an attachment.
        </p>
        <p className="mt-3">
          Vercel hosts the portal, Supabase provides authentication, database and file
          storage, and Cloudflare Turnstile helps protect forms against automated abuse.
          Our authentication email provider may process addresses and delivery information
          when sending account or recovery emails. We may disclose information when
          required by law.
        </p>
      </section>

      <section>
        <h2>How long we keep it</h2>
        <p>
          Retention depends on the type of record and the client relationship. We keep
          records as needed to provide support, document maintenance or billing, resolve
          disputes, and meet legal obligations. Contact us about a specific record or
          to request deletion.
        </p>
      </section>

      <section>
        <h2>Privacy requests</h2>
        <p>
          For questions or to request access, correction, or deletion, email{" "}
          <a href="mailto:ahenry@thirdgenerationstudios.com">ahenry@thirdgenerationstudios.com</a>.
          We may verify your identity and authority before acting on a request. Rights
          and exceptions may vary under applicable law.
        </p>
      </section>
    </LegalPage>
  )
}
