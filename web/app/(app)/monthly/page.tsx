// Monthly synthesized rollups are built in Phase 6 (email + a rollup
// table this page will read from). This shell exists now so the tab
// isn't a dead link; it also gets the email-section structure
// (pipeline/email/sections.ts) once that phase lands, matching what
// actually gets sent.

export default function MonthlyPage() {
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 p-6 text-center dark:border-neutral-700">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Monthly rollups aren&apos;t built yet — coming with the monthly/quarterly synthesis job.
      </p>
    </div>
  );
}
