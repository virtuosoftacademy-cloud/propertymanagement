import Link from "next/link";

/**
 * Where Stripe returns a customer after a successful subscription checkout.
 *
 * Deliberately says nothing about the account being ready: provisioning happens
 * in the webhook, which may land a moment after the redirect. Claiming "your
 * account is live" here would be a guess, and a wrong one often enough to
 * matter.
 */
export const metadata = {
  title: "Welcome to PropertyPro",
};

export default function BillingWelcomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6 py-16 text-center">
      <h1 className="text-3xl font-bold">Payment received</h1>

      <p className="text-muted-foreground leading-relaxed">
        Thank you — your subscription is set up. We&apos;re creating your manager
        account now, and you&apos;ll get an email with a link to choose your
        password. It usually arrives within a minute.
      </p>

      <p className="text-muted-foreground text-sm leading-relaxed">
        If it hasn&apos;t arrived in ten minutes, check your spam folder and then
        contact us at{" "}
        <a className="underline" href="mailto:support@propertypro.com">
          support@propertypro.com
        </a>{" "}
        — quote the email address you paid with and we&apos;ll sort it out.
      </p>

      <div>
        <Link
          href="/auth/signin"
          className="inline-block border px-6 py-3 text-sm font-semibold"
        >
          Go to sign in
        </Link>
      </div>
    </main>
  );
}
