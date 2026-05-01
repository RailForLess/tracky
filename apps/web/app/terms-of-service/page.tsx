import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — Tracky",
  description:
    "Tracky's terms of service. Read the terms and conditions for using the Tracky app and website.",
};

export default function TermsOfService() {
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
          Terms of Service
        </h1>
        <p className="text-black/40 text-sm mb-12">
          Last updated: March 16, 2026
        </p>

        <div className="space-y-10 text-[15px] leading-relaxed text-black/70">
          <section>
            <h2 className="text-lg font-semibold text-black mb-3">
              Agreement to Terms
            </h2>
            <p>
              By downloading, installing, or using Tracky (&ldquo;the
              App&rdquo;) or visiting our website (&ldquo;the Site&rdquo;),
              you agree to be bound by these Terms of Service. If you do not
              agree to these terms, please do not use Tracky.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-black mb-3">
              Description of Service
            </h2>
            <p>
              Tracky is a free, open-source application that provides
              real-time Amtrak train tracking, departure boards, live maps,
              delay notifications, and related transit information. The App is
              available on iOS and Android.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-black mb-3">
              Use of the Service
            </h2>
            <p>You agree to use Tracky only for lawful purposes. You may not:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>
                Use the App in any way that violates applicable laws or
                regulations.
              </li>
              <li>
                Attempt to reverse-engineer, decompile, or extract source
                code from the App beyond what is permitted by the open-source
                license.
              </li>
              <li>
                Use the App to interfere with or disrupt any servers,
                networks, or services.
              </li>
              <li>
                Scrape, collect, or harvest data from the App or its
                underlying services in an automated manner for commercial
                purposes.
              </li>
              <li>
                Misrepresent your identity or affiliation when using the App
                or contacting us.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-black mb-3">
              Open-Source License
            </h2>
            <p>
              Tracky is released under an open-source license. The source
              code is available on{" "}
              <a
                href="https://github.com/Mootbing/Tracky"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-black transition-colors"
              >
                GitHub
              </a>
              . Your use of the source code is governed by the applicable
              open-source license in the repository. These Terms of Service
              govern your use of the App and Site as an end user.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-black mb-3">
              Accuracy of Information
            </h2>
            <p>
              Tracky displays train data sourced from Amtrak and other
              third-party providers. While we strive to provide accurate and
              up-to-date information, we cannot guarantee the accuracy,
              completeness, or timeliness of any data displayed in the App.
              Train schedules, delays, and status information may change
              without notice.
            </p>
            <p className="mt-3">
              <strong>
                Tracky should not be your sole source of travel information.
              </strong>{" "}
              Always verify critical travel details directly with Amtrak or
              your rail operator.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-black mb-3">
              Notifications
            </h2>
            <p>
              Tracky may send push notifications about train status, delays,
              and departures if you opt in. We do our best to deliver
              notifications promptly, but we do not guarantee the delivery,
              timing, or accuracy of any notification. You can disable
              notifications at any time through your device settings.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-black mb-3">
              Intellectual Property
            </h2>
            <p>
              The Tracky name, logo, and branding are the property of Tracky
              and its contributors. Third-party trademarks, including Amtrak,
              Apple, and Google, are the property of their respective owners
              and are used for identification purposes only.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-black mb-3">
              Disclaimer of Warranties
            </h2>
            <p>
              Tracky is provided on an &ldquo;as is&rdquo; and &ldquo;as
              available&rdquo; basis without warranties of any kind, whether
              express or implied. We do not warrant that the App will be
              uninterrupted, error-free, or free of harmful components. You
              use Tracky at your own risk.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-black mb-3">
              Limitation of Liability
            </h2>
            <p>
              To the fullest extent permitted by law, Tracky and its
              contributors shall not be liable for any indirect, incidental,
              special, consequential, or punitive damages arising from your
              use of or inability to use the App, including but not limited
              to missed trains, incorrect schedule information, or reliance
              on notifications.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-black mb-3">
              Termination
            </h2>
            <p>
              We reserve the right to restrict or terminate access to the App
              or Site at any time, for any reason, without notice. You may
              stop using Tracky at any time by uninstalling the App.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-black mb-3">
              Changes to These Terms
            </h2>
            <p>
              We may update these Terms of Service from time to time. Changes
              will be posted on this page with a revised &ldquo;last
              updated&rdquo; date. Continued use of Tracky after changes
              constitutes acceptance of the updated terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-black mb-3">
              Contact Us
            </h2>
            <p>
              If you have questions about these terms, reach out to us at{" "}
              <a
                href="mailto:him@jasonxu.me?subject=Tracky Terms"
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
