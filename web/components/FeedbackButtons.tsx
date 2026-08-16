"use client";

import { useState, useTransition } from "react";
import { submitFeedback } from "@/app/actions";

export default function FeedbackButtons({ digestItemId }: { digestItemId: string }) {
  const [sent, setSent] = useState<"up" | "down" | null>(null);
  const [pending, startTransition] = useTransition();

  function vote(v: "up" | "down") {
    startTransition(async () => {
      const result = await submitFeedback(digestItemId, v);
      if (result.ok) setSent(v);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => vote("up")}
        disabled={pending}
        aria-label="Thumbs up"
        aria-pressed={sent === "up"}
        className={
          "rounded-md border px-2 py-1 text-sm transition-colors " +
          (sent === "up"
            ? "border-green-600 bg-green-50 text-green-700 dark:border-green-500 dark:bg-green-950 dark:text-green-400"
            : "border-neutral-300 text-neutral-500 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-400")
        }
      >
        👍
      </button>
      <button
        type="button"
        onClick={() => vote("down")}
        disabled={pending}
        aria-label="Thumbs down"
        aria-pressed={sent === "down"}
        className={
          "rounded-md border px-2 py-1 text-sm transition-colors " +
          (sent === "down"
            ? "border-red-600 bg-red-50 text-red-700 dark:border-red-500 dark:bg-red-950 dark:text-red-400"
            : "border-neutral-300 text-neutral-500 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-400")
        }
      >
        👎
      </button>
    </div>
  );
}
