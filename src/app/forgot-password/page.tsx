"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    const supabase = createSupabaseBrowserClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    setSubmitting(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#181a1d] p-6">
      <div className="w-full max-w-sm bg-white p-7">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-[#70736d]">WAT Agency</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="mt-2 text-sm leading-6 text-[#6c706b]">We’ll email you a secure link to choose a new password.</p>

        {sent ? (
          <div className="mt-6">
            <p className="bg-lime-50 p-4 text-sm leading-6 text-[#344500]">Check your inbox. If an account exists for this email, a password reset link is on its way.</p>
            <Link href="/sign-in" className="mt-5 inline-flex text-sm font-semibold text-[#4f5f16] underline decoration-[#a3bf4c] underline-offset-4 hover:text-[#182000]">Back to sign in</Link>
          </div>
        ) : (
          <form onSubmit={requestReset} className="mt-6 space-y-4">
            {error && <p className="bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
            <label className="block text-sm font-semibold">Email
              <input value={email} onChange={(event) => setEmail(event.target.value)} name="email" type="email" required autoComplete="email" className="mt-2 h-11 w-full border border-[#d5d6d0] px-3 font-normal outline-none focus:border-[#181a1d]" />
            </label>
            <button disabled={submitting} className="h-11 w-full bg-[#c9fa3c] text-sm font-bold text-[#182000]">{submitting ? "Sending…" : "Send reset link"}</button>
            <Link href="/sign-in" className="block text-center text-sm font-semibold text-[#4f5f16] underline decoration-[#a3bf4c] underline-offset-4 hover:text-[#182000]">Back to sign in</Link>
          </form>
        )}
      </div>
    </main>
  );
}
