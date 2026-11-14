import type { Metadata } from "next"
import { LegalPage } from "@/components/website-manager/legal-page"

export const metadata: Metadata = {
  title: "Terms of use",
  description: "Terms for using Third Generation Studios Website Manager.",
}

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use">
      <p>
        Third Generation Studios (TGS) provides Website Manager to submit and track
        website maintenance requests. These terms apply to use of the portal.
      </p>

      <section>
        <h2>Your maintenance agreement</h2>
        <p>
          Your separate agreement with TGS governs maintenance scope, fees, included
          time, approvals, and any response commitments. A request in the portal
          records what you’ve asked us to do. If additional approval is required
          under your agreement, we’ll coordinate it with your designated contact.
          If these terms conflict with that agreement on maintenance services,
          the agreement controls.
        </p>
      </section>

      <section>
        <h2>Accounts and access</h2>
        <p>
          Use your own account and access only the websites you’re authorized to
          manage. Keep your credentials private and tell us promptly if someone
          may have gained access to your account or if a team member’s access
          should change.
        </p>
      </section>

      <section>
        <h2>Requests and attachments</h2>
        <p>
          Submit material you have permission to share. Remove passwords, API keys,
          payment details, and unnecessary personal information from text and
          screenshots. By submitting material, you authorize TGS to use it to
          review, troubleshoot, and carry out the requested work.
        </p>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <p>
          Use the portal for authorized website support. Do not attempt to bypass
          access controls, interfere with the portal, upload malicious files, or
          access another client’s information. TGS may restrict portal access when
          needed to protect the portal, accounts, or client data.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          If you can’t access the portal or have a question about these terms, email{" "}
          <a href="mailto:ahenry@thirdgenerationstudios.com">ahenry@thirdgenerationstudios.com</a>.
        </p>
      </section>
    </LegalPage>
  )
}
