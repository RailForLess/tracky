import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Tracky",
  description:
    "Tracky's privacy policy. Learn how we handle your data when you use the Tracky app and website.",
};

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-white px-6 py-20">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-black/40 hover:text-black transition-colors mb-12"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to home
        </Link>

        <h1 className="text-4xl font-bold tracking-tight mb-2">
          Privacy Policy
        </h1>
        <p className="text-black/40 text-sm mb-12">
          Last updated: March 16, 2026
        </p>

        <div className="space-y-10 text-[15px] leading-relaxed text-black/70">
          <section>
            <h2 className="text-lg font-semibold text-black mb-3">
              Overview
            </h2>
            <p>
              Tracky is a real-time Amtrak tracking app for iOS and Android.
              We believe your privacy matters, and we&apos;ve designed Tracky to
              collect as little data as possible while still providing a great
              experience. This policy explains what we collect, why, and how
              we handle it.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-black mb-3">
              Information We Collect
            </h2>

            <h3 className="font-medium text-black mt-4 mb-2">
              Information you provide
            </h3>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                Saved trips and route preferences you choose to store within
                the app.
              </li>
              <li>
                Any feedback or messages you send us via email.
              </li>
            </ul>

            <h3 className="font-medium text-black mt-4 mb-2">
              Information collected automatically
            </h3>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Device information:</strong> Device type, operating
                system version, and app version for compatibility and
                debugging purposes.
              </li>
              <li>
                <strong>Usage data:</strong> General app usage patterns such
                as feature interactions, session duration, and crash reports
                to help us improve the app.
              </li>
              <li>
                <strong>Website analytics:</strong> We use{" "}
                <a
                  href="https://www.rybbit.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-black transition-colors"
                >
                  Rybbit
                </a>
                , a privacy-focused analytics tool, on our website to
                understand page views and general traffic patterns. No
                personal data or cookies are used for this purpose.
              </li>
            </ul>

            <h3 className="font-medium text-black mt-4 mb-2">
              Information we do not collect
            </h3>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>We do not track your physical location.</li>
              <li>We do not require you to create an account.</li>
              <li>
                We do not sell, share, or monetize your personal data in any
                way.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-black mb-3">
              How We Use Your Information
            </h2>
            <p>The limited information we collect is used to:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>Provide and maintain Tracky&apos;s features.</li>
              <li>
                Send you notifications about train status updates, delays,
                and departures (only if you opt in).
              </li>
              <li>Fix bugs, improve performance, and develop new features.</li>
              <li>Respond to your feedback and support requests.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-black mb-3">
              Data Storage &amp; Security
            </h2>
            <p>
              Your saved trips and preferences are stored locally on your
              device. We use industry-standard security measures to protect
              any data transmitted to our servers. No payment information is
              collected or processed by Tracky directly.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-black mb-3">
              Third-Party Services
            </h2>
            <p>
              Tracky relies on third-party services to provide train data and
              app functionality. These services may collect data independently
              according to their own privacy policies:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>
                <strong>Amtrak</strong> &mdash; for real-time train data,
                schedules, and status information.
              </li>
              <li>
                <strong>Apple App Store / Google Play Store</strong> &mdash;
                for app distribution and updates.
              </li>
              <li>
                <strong>Rybbit</strong> &mdash; for privacy-focused website
                analytics.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-black mb-3">
              Children&apos;s Privacy
            </h2>
            <p>
              Tracky does not knowingly collect personal information from
              children under 13. If you believe a child has provided us with
              personal data, please contact us so we can take appropriate
              action.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-black mb-3">
              Changes to This Policy
            </h2>
            <p>
              We may update this privacy policy from time to time. Changes
              will be posted on this page with a revised &ldquo;last
              updated&rdquo; date. Continued use of Tracky after changes
              constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-black mb-3">
              Contact Us
            </h2>
            <p>
              If you have questions about this privacy policy or how Tracky
              handles your data, reach out to us at{" "}
              <a
                href="mailto:him@jasonxu.me?subject=Tracky Privacy"
                className="underline hover:text-black transition-colors"
              >
                him@jasonxu.me
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
