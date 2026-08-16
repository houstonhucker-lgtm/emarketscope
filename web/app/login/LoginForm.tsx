"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

const initialState: LoginState = { status: "idle" };

export default function LoginForm() {
  const [state, action, pending] = useActionState(sendMagicLink, initialState);

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
        disabled={pending || state.status === "sent"}
        className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-500 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
      />
      <button
        type="submit"
        disabled={pending || state.status === "sent"}
        className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {pending ? "Sending..." : state.status === "sent" ? "Link sent" : "Send sign-in link"}
      </button>
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
