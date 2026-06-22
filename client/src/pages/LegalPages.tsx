import { Link } from "wouter";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { Seo } from "@/lib/seo";

const UPDATED = "June 18, 2026";

function LegalLayout({
  title,
  seoTitle,
  description,
  canonicalPath,
  testId,
  children,
}: {
  title: string;
  seoTitle?: string;
  description: string;
  canonicalPath: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-300">
      <Seo title={seoTitle ?? title} description={description} canonicalPath={canonicalPath} />
      <SiteHeader />
      <main className="pt-28 pb-20 px-6" data-testid={testId}>
        <div className="container mx-auto max-w-3xl">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-4">
            {title}
          </h1>
          <p className="text-sm text-slate-500 mb-10">Last updated: {UPDATED}</p>
          <div className="space-y-6 leading-relaxed text-slate-300 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-white [&_h2]:mt-10 [&_h2]:mb-3 [&_a]:text-teal-400 [&_a:hover]:underline">
            {children}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

export function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      seoTitle="Privacy Policy | RxFit.ai"
      description="Learn how RxFit.ai collects, uses, and protects your personal and health data — including wearable and fitness app data connected to your account."
      canonicalPath="/privacy"
      testId="page-privacy"
    >
      <p>
        RxFit.ai ("we", "us") is committed to protecting your privacy. This policy explains what
        information we collect, how we use it, and the choices you have. By using our website and
        services, you agree to the practices described here.
      </p>

      <h2>Information we collect</h2>
      <p>
        We collect information you provide directly — such as your name and email address when you
        sign up or contact us — and information generated through your use of the service, including
        connected wearable and health-app data you choose to share. We also collect standard
        technical data such as device, browser, and usage analytics.
      </p>

      <h2>How we use your information</h2>
      <p>
        We use your information to provide and improve the service, deliver personalized coaching and
        health insights, process payments, send service and marketing communications you have opted
        into, and meet our legal obligations.
      </p>

      <h2>Health data</h2>
      <p>
        Health and fitness data is sensitive. We only access the data you explicitly connect, use it
        to power your coaching experience, and never sell it. You can disconnect a data source or
        request deletion at any time.
      </p>

      <h2>Sharing and disclosure</h2>
      <p>
        We do not sell your personal data. We share it only with service providers who help us run
        RxFit.ai (for example, payment and email providers) under appropriate confidentiality
        obligations, or when required by law.
      </p>

      <h2>Your rights</h2>
      <p>
        You may request access to, correction of, or deletion of your personal data, and you can opt
        out of marketing emails at any time. To exercise these rights, email{" "}
        <a href="mailto:privacy@rxfit.ai">privacy@rxfit.ai</a>.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy? Reach us at{" "}
        <a href="mailto:privacy@rxfit.ai">privacy@rxfit.ai</a> or visit our{" "}
        <Link href="/contact">contact page</Link>.
      </p>
    </LegalLayout>
  );
}

export function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Service"
      seoTitle="Terms of Service | RxFit.ai"
      description="Read the terms that govern your use of RxFit.ai, including subscription billing, cancellation, health disclaimers, and intellectual property rights."
      canonicalPath="/terms"
      testId="page-terms"
    >
      <p>
        These Terms of Service ("Terms") govern your access to and use of RxFit.ai. By using the
        service, you agree to these Terms. If you do not agree, please do not use the service.
      </p>

      <h2>Use of the service</h2>
      <p>
        You must be at least 18 years old to use RxFit.ai. You agree to provide accurate information
        and to use the service only for lawful purposes. You are responsible for keeping your account
        credentials secure.
      </p>

      <h2>Not medical advice</h2>
      <p>
        RxFit.ai provides fitness and wellness coaching for general informational purposes only. It
        is not a substitute for professional medical advice, diagnosis, or treatment. Always consult a
        qualified healthcare provider before making changes to your health, exercise, or nutrition
        routine.
      </p>

      <h2>Subscriptions and billing</h2>
      <p>
        Paid plans are billed in advance on a recurring basis through our payment processor. You can
        cancel at any time; cancellation takes effect at the end of the current billing period. Trial
        terms, where offered, are described at checkout.
      </p>

      <h2>Intellectual property</h2>
      <p>
        All content, branding, and software associated with RxFit.ai are owned by us or our licensors
        and may not be copied or reused without permission.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, RxFit.ai is provided "as is" without warranties of any
        kind, and we are not liable for any indirect or consequential damages arising from your use of
        the service.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these Terms? Email <a href="mailto:support@rxfit.ai">support@rxfit.ai</a> or
        visit our <Link href="/contact">contact page</Link>.
      </p>
    </LegalLayout>
  );
}

export function ContactPage() {
  return (
    <LegalLayout
      title="Contact Us"
      seoTitle="Contact RxFit.ai Support | RxFit.ai"
      description="Get in touch with the RxFit.ai team for account support, billing help, data privacy requests, partnership inquiries, or press."
      canonicalPath="/contact"
      testId="page-contact"
    >
      <p>
        We'd love to hear from you. Whether you have a question about your plan, need help with the
        app, or want to explore a partnership, reach out and our team will get back to you.
      </p>

      <h2>Support</h2>
      <p>
        For help with your account, billing, or the app, email{" "}
        <a href="mailto:support@rxfit.ai" data-testid="link-contact-support">support@rxfit.ai</a>.
      </p>

      <h2>Privacy requests</h2>
      <p>
        For data access or deletion requests, email{" "}
        <a href="mailto:privacy@rxfit.ai">privacy@rxfit.ai</a>.
      </p>

      <h2>Partnerships & press</h2>
      <p>
        For partnership or media inquiries, email{" "}
        <a href="mailto:hello@rxfit.ai">hello@rxfit.ai</a>.
      </p>

      <h2>Already a member?</h2>
      <p>
        Manage your subscription and account anytime in the{" "}
        <a href="https://app.rxfit.ai" rel="noopener">RxFit.ai app</a>.
      </p>
    </LegalLayout>
  );
}
