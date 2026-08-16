import TabNav from "@/components/TabNav";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-dvh bg-neutral-50 dark:bg-neutral-950">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
        <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">eMarketScope</span>
        <div className="flex items-center gap-3">
          {user?.email && (
            <span className="hidden text-xs text-neutral-500 sm:inline dark:text-neutral-400">{user.email}</span>
          )}
          <form action={signOut}>
            <button
              type="submit"
              className="text-xs font-medium text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <TabNav />
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}
