import { createClient } from "@/lib/supabase/server";
import CaptureForm from "./CaptureForm";

interface ForwardedItemRow {
  id: string;
  received_at: string;
  extracted_url: string | null;
  body: string | null;
  status: "pending" | "processed" | "ignored";
}

export default async function CapturePage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("forwarded_items")
    .select("id, received_at, extracted_url, body, status")
    .order("received_at", { ascending: false })
    .limit(20)
    .returns<ForwardedItemRow[]>();

  const items = data ?? [];

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold text-neutral-500 dark:text-neutral-400">Forward something</h2>
        <CaptureForm />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-neutral-500 dark:text-neutral-400">Recently forwarded</h2>
        {items.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Nothing forwarded yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800"
              >
                <div className="flex items-center justify-between gap-2">
                  {item.extracted_url ? (
                    <a
                      href={item.extracted_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {item.extracted_url}
                    </a>
                  ) : (
                    <span className="text-neutral-400">(no link)</span>
                  )}
                  <span
                    className={
                      "shrink-0 rounded-full px-2 py-0.5 text-xs " +
                      (item.status === "pending"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400"
                        : item.status === "processed"
                          ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400"
                          : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400")
                    }
                  >
                    {item.status}
                  </span>
                </div>
                {item.body && <p className="mt-1 text-neutral-600 dark:text-neutral-400">{item.body}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
