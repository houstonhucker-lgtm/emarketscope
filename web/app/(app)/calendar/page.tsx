import { createClient } from "@/lib/supabase/server";
import CalendarView from "./CalendarView";
import type { CalendarEntry } from "@/lib/types";

export default async function CalendarPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("calendar_entries")
    .select("*")
    .order("event_date", { ascending: false })
    .returns<CalendarEntry[]>();

  if (error) {
    return <p className="text-sm text-red-600 dark:text-red-400">Failed to load: {error.message}</p>;
  }

  return <CalendarView entries={data ?? []} />;
}
