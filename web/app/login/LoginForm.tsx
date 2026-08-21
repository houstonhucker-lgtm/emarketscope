"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const initialState: LoginState = { status: "idle" };

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, initialState);
  const codeSent = state.status === "code_sent";

  return (
    <form action={action} className="flex flex-col gap-3">
      <label htmlFor="email" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        placeholder="you@example.com"
        required
        readOnly={codeSent}
        defaultValue={state.email}
        disabled={pending}
        className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-500 disabled:opacity-60 read-only:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:read-only:bg-neutral-800"
      />

      {codeSent && (
        <>
          <label htmlFor="token" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Code
          </label>
          <input
            id="token"
            name="token"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            maxLength={6}
            required
            disabled={pending}
            autoFocus
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-center text-lg tracking-[0.3em] text-neutral-900 outline-none focus:border-neutral-500 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
        </>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {pending ? (codeSent ? "Verifying..." : "Sending...") : codeSent ? "Verify code" : "Send code"}
      </button>

      {codeSent && (
        <a
          href="/login"
          className="text-center text-sm text-neutral-500 underline-offset-2 hover:underline dark:text-neutral-400"
        >
          Use a different email
        </a>
      )}

      {state.message && (
        <p
          className={
            state.status === "error"
              ? "text-sm text-red-600 dark:text-red-400"
              : "text-sm text-green-700 dark:text-green-400"
          }
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
