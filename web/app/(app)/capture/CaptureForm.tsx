"use client";

import { useRef, useState, useTransition } from "react";
import { submitForward } from "@/app/actions";

export default function CaptureForm() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    const url = String(formData.get("url") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();
    if (!url && !note) {
      setMessage("Add a link or a note.");
      return;
    }
    startTransition(async () => {
      const result = await submitForward(url, note);
      if (result.ok) {
        setMessage("Saved — it'll fold into the next pipeline run.");
        formRef.current?.reset();
      } else {
        setMessage(`Couldn't save: ${result.message}`);
      }
    });
  }

  return (
    <form ref={formRef} action={handleSubmit} className="flex flex-col gap-3">
      <div>
        <label htmlFor="url" className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Link
        </label>
        <input
          id="url"
          name="url"
          type="url"
          placeholder="https://..."
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        />
      </div>
      <div>
        <label htmlFor="note" className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Note (optional)
        </label>
        <textarea
          id="note"
          name="note"
          rows={3}
          placeholder="Why this is relevant, or paste text directly if there's no link"
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {pending ? "Saving..." : "Forward it"}
      </button>
      {message && <p className="text-sm text-neutral-600 dark:text-neutral-400">{message}</p>}
    </form>
  );
}
