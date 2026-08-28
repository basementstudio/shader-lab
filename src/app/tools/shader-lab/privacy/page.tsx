import type { Metadata } from "next"
import Link from "next/link"
import { Typography } from "@/components/ui/typography"
import { APP_BASE_URL } from "@/lib/app"
import {
  ABOUT_PATH,
  EDITOR_PATH,
  PRIVACY_PATH,
} from "@/lib/community/scene-links"

const LAST_UPDATED = "August 25, 2026"

const CONTACT_EMAIL = "dev@basement.studio"

const DESCRIPTION =
  "What Shader Lab stores when you sign in or publish a scene, who processes it, and how to have it deleted."

export const metadata: Metadata = {
  alternates: { canonical: PRIVACY_PATH },
  description: DESCRIPTION,
  openGraph: {
    description: DESCRIPTION,
    title: "Privacy Policy",
    type: "website",
    url: `${APP_BASE_URL}${PRIVACY_PATH}`,
  },
  title: "Privacy Policy",
}

type Section = {
  body?: string[]
  heading: string
  items?: string[]
}

const SECTIONS: Section[] = [
  {
    body: [
      "Shader Lab is a browser-based tool for creating, stacking and animating shaders, built and operated by basement.studio. This policy covers the editor and the community gallery.",
      "You can use the editor without an account. While you do, your work stays on your machine: the editor autosaves into your browser's own IndexedDB storage and sends us nothing. Everything below applies once you sign in and save or publish something.",
    ],
    heading: "The short version",
  },
  {
    body: [
      "You sign in with Google or GitHub. We never see or store a password.",
      "From Google we request three scopes and nothing else: openid, email and profile. That gives us your email address, name and avatar. We do not ask for Drive, contacts, calendar or any other Google data.",
      "Authentication is brokered by Neon Auth, which means the sign-in screen and the OAuth callback are hosted on Neon's infrastructure rather than ours. Neon stores your email address, name, avatar URL and provider account ID on our behalf.",
    ],
    heading: "Signing in",
  },
  {
    body: [
      "Signing in creates a public profile: a handle, an optional display name, and your avatar. These appear next to every scene you publish.",
      "If you rename your handle we keep a record of the handles you previously claimed, so old links keep resolving and a handle can't be recycled to impersonate you.",
    ],
    heading: "Your profile",
  },
  {
    body: [
      "Saving a draft to your account and publishing a scene both send that scene to us. A draft is private — it stays out of the gallery until you publish it — but it lives on our servers either way, not only in your browser.",
      "Either one stores:",
    ],
    heading: "Scenes you save or publish",
    items: [
      "The scene itself: title, description, layer setup, composition size and duration.",
      "Any file you added to it: audio, 3D models, images and video. These are stored on Cloudflare and served publicly.",
      "Remix lineage, so a scene built from someone else's credits the original.",
      "Which scenes you liked.",
      "Daily counters for how much you have uploaded, so we can enforce publishing limits.",
    ],
  },
  {
    body: [
      "Published scenes are public by design. Deleting a scene removes it from the gallery.",
      "If you report a scene we store your account ID, the reason you picked and any note you wrote. A short allowlist of basement.studio staff can read the report queue and take scenes down.",
    ],
    heading: "Moderation",
  },
  {
    heading: "Analytics and error monitoring",
    items: [
      "Vercel Analytics and Speed Insights, for page views and performance. Aggregate, and not used to track you across other sites.",
      "Sentry, in production only, for crashes and errors. A report can include the page you were on, your browser, and — server side — local variable values from the stack trace.",
      "We do not run Sentry Session Replay. We never record your screen, your pointer or your keystrokes.",
      "Vercel BotID on every endpoint that writes something — saving a draft, publishing, deleting a scene, liking, remixing, reporting and changing your handle — to keep automated abuse out.",
    ],
  },
  {
    body: [
      "We use your IP address for exactly one thing: not double-counting remixes from people who aren't signed in.",
      "We don't store it. It is combined with the current date and a server-side secret, hashed with HMAC-SHA256, and only that hash is written to the database. Because the date is part of the input, today's hash cannot be matched against yesterday's.",
      "Our infrastructure providers see raw IP addresses in their own request logs, under their own policies.",
    ],
    heading: "IP addresses",
  },
  {
    heading: "What we don't do",
    items: [
      "We don't sell or rent your data.",
      "We don't run advertising or ad trackers.",
      "We don't record your session.",
      "We don't send you marketing email.",
    ],
  },
  {
    body: ["Data is processed on our behalf by:"],
    heading: "Who else touches it",
    items: [
      "Vercel — hosting, analytics, bot protection.",
      "Neon — Postgres database and managed authentication.",
      "Cloudflare — storage and delivery for uploaded assets.",
      "Sentry — error monitoring.",
      "Google or GitHub — only the one you chose to sign in with.",
    ],
  },
  {
    body: [
      "You can delete any of your scenes from your profile at any time.",
      `There is no self-serve account deletion yet. Email ${CONTACT_EMAIL} and we will remove your account, which also removes your profile, your scenes, your likes and your upload counters.`,
      "Scenes that other people remixed from yours are their own work and stay published.",
      "Depending on where you live you may have the right to access, correct, export or delete the personal data we hold about you. Email us and we will take care of it.",
    ],
    heading: "Deleting your data",
  },
  {
    body: [
      `Questions about any of this: ${CONTACT_EMAIL}.`,
      "If we change this policy materially, we'll update the date at the top.",
    ],
    heading: "Contact",
  },
]

function EmailText({ text }: { text: string }) {
  const [before, after] = text.split(CONTACT_EMAIL)

  if (after === undefined) {
    return text
  }

  return (
    <>
      {before}
      <Link
        className="text-[var(--ds-color-text-primary)] underline decoration-[var(--ds-border-panel)] underline-offset-[3px] transition-colors hover:decoration-[var(--ds-color-text-primary)]"
        href={`mailto:${CONTACT_EMAIL}`}
      >
        {CONTACT_EMAIL}
      </Link>
      {after}
    </>
  )
}

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto w-full max-w-[70ch] px-5 py-[var(--ds-space-16)] sm:px-6">
      <header className="flex flex-col items-start gap-[var(--ds-space-4)]">
        <nav className="flex flex-wrap gap-[var(--ds-space-4)]">
          <Link
            className="text-[var(--ds-color-text-tertiary)] transition-colors hover:text-[var(--ds-color-text-primary)] type-mono-xs"
            href={EDITOR_PATH}
          >
            ← Shader Lab
          </Link>
          <Link
            className="text-[var(--ds-color-text-tertiary)] transition-colors hover:text-[var(--ds-color-text-primary)] type-mono-xs"
            href={ABOUT_PATH}
          >
            About
          </Link>
        </nav>
        <Typography as="h1" variant="display">
          Privacy Policy
        </Typography>
        <Typography as="p" tone="tertiary" variant="monoXs">
          Last updated {LAST_UPDATED}
        </Typography>
      </header>

      <hr className="my-[var(--ds-space-10)] border-0 border-[var(--ds-border-divider)] border-t" />

      <div className="flex flex-col gap-[var(--ds-space-10)]">
        {SECTIONS.map((section) => (
          <section
            className="flex flex-col gap-[var(--ds-space-4)]"
            key={section.heading}
          >
            <Typography as="h2" variant="heading">
              {section.heading}
            </Typography>

            {section.body?.map((paragraph) => (
              <Typography
                as="p"
                className="text-pretty leading-[1.65]"
                key={paragraph}
                tone="secondary"
                variant="body"
              >
                <EmailText text={paragraph} />
              </Typography>
            ))}

            {section.items ? (
              <ul className="list-disc space-y-[var(--ds-space-4)] pl-[var(--ds-space-5)]">
                {section.items.map((item) => (
                  <Typography
                    as="li"
                    className="text-pretty leading-[1.65] marker:text-[var(--ds-color-text-muted)]"
                    key={item}
                    tone="secondary"
                    variant="body"
                  >
                    {item}
                  </Typography>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>
    </main>
  )
}
