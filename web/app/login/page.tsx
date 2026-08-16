import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage =
    error === "not_allowed"
      ? "That account isn't on the access list."
      : error === "auth_failed"
        ? "That link didn't work — it may have expired. Request a new one."
        : null;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-neutral-50 px-4 dark:bg-neutral-950">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h1 className="mb-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">eMarketScope</h1>
        <p className="mb-5 text-sm text-neutral-500 dark:text-neutral-400">
          Sign in with your email to get a one-time link.
        </p>
        {errorMessage && (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
            {errorMessage}
          </p>
        )}
        <LoginForm />
      </div>
    </div>
  );
}
