import Link from "next/link";

const primaryActionClassName =
  "inline-flex items-center justify-center rounded-[var(--ds-radius-control)] bg-[var(--ds-color-text-primary)] px-5 py-2 text-[12px] font-medium leading-4 text-[var(--ds-color-text-on-light)] transition-[background-color,transform] duration-160 ease-[var(--ease-out-cubic)] hover:bg-white/82 active:scale-[0.98] active:bg-white/72";

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
      <div aria-hidden="true" className="absolute inset-0 opacity-80">
        <div className="absolute top-0 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-white/6 blur-3xl" />
        <div className="absolute right-[-6rem] bottom-[-10rem] h-[20rem] w-[20rem] rounded-full bg-white/5 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgb(255_255_255_/_0.045)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255_/_0.045)_1px,transparent_1px)] bg-[size:96px_96px] [mask-image:radial-gradient(circle_at_center,black,transparent_82%)]" />
      </div>

      <section className="relative w-full max-w-2xl rounded-[28px] border border-[var(--ds-border-panel-strong)] bg-[rgb(12_12_16_/_0.72)] p-6 shadow-[var(--ds-shadow-panel-dark)] backdrop-blur-[24px] sm:p-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <p className="font-[var(--ds-font-mono)] text-[11px] text-white/52 uppercase tracking-[0.24em]">
            Error 404
          </p>
          <div className="h-px flex-1 bg-[linear-gradient(90deg,rgb(255_255_255_/_0.14),transparent)]" />
        </div>

        <div className="space-y-4">
          <p className="font-[var(--ds-font-mono)] text-[12px] text-white/38 uppercase tracking-[0.2em]">
            Route not found
          </p>
          <h1 className="max-w-xl font-semibold text-[clamp(3rem,9vw,5.5rem)] text-[var(--ds-color-text-primary)] leading-[0.9] tracking-[-0.05em]">
            This frame never rendered.
          </h1>
          <p className="max-w-xl text-[15px] text-[var(--ds-color-text-secondary)] leading-6 sm:text-[16px]">
            The page you requested does not exist, or the URL drifted out of
            sync. Head back to Shader Lab and continue from a known route.
          </p>
        </div>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link className={primaryActionClassName} href="/tools/shader-lab">
            Go back to the Lab
          </Link>
        </div>
      </section>
    </main>
  );
}
