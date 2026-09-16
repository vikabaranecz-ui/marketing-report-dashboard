import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

async function signIn(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/sign-in?error=${encodeURIComponent(error.message)}`);
  redirect("/overview");
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; reset?: string }> }) {
  if (!hasSupabaseConfig()) redirect("/overview");
  const { error, reset } = await searchParams;
  return <main className="grid min-h-screen place-items-center bg-[#181a1d] p-6"><div className="w-full max-w-sm bg-white p-7"><p className="text-xs font-bold uppercase tracking-[.18em] text-[#70736d]">WAT Agency</p><h1 className="mt-3 text-2xl font-semibold tracking-tight">Sign in to reporting</h1><p className="mt-2 text-sm leading-6 text-[#6c706b]">Access is limited to companies assigned to your account.</p>{error&&<p className="mt-4 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}{reset&&<p className="mt-4 bg-lime-50 p-3 text-sm text-[#344500]">Password updated. You can now sign in.</p>}<form action={signIn} className="mt-6 space-y-4"><label className="block text-sm font-semibold">Email<input name="email" type="email" required autoComplete="email" className="mt-2 h-11 w-full border border-[#d5d6d0] px-3 font-normal outline-none focus:border-[#181a1d]"/></label><label className="block text-sm font-semibold">Password<input name="password" type="password" required autoComplete="current-password" className="mt-2 h-11 w-full border border-[#d5d6d0] px-3 font-normal outline-none focus:border-[#181a1d]"/></label><div className="flex justify-end"><Link href="/forgot-password" className="text-sm font-semibold text-[#4f5f16] underline decoration-[#a3bf4c] underline-offset-4 hover:text-[#182000]">Forgot password?</Link></div><button className="h-11 w-full bg-[#c9fa3c] text-sm font-bold text-[#182000]">Sign in</button></form></div></main>;
}
