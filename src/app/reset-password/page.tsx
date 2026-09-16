import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function updatePassword(formData: FormData) {
  "use server";
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (password.length < 8) redirect("/reset-password?error=Password%20must%20be%20at%20least%208%20characters.");
  if (password !== confirmation) redirect("/reset-password?error=Passwords%20do%20not%20match.");

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?error=Your%20reset%20link%20has%20expired.%20Please%20request%20a%20new%20one.");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect(`/reset-password?error=${encodeURIComponent(error.message)}`);

  await supabase.auth.signOut();
  redirect("/sign-in?reset=1");
}

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?error=Open%20the%20password%20reset%20link%20from%20your%20email%20first.");

  const { error } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center bg-[#181a1d] p-6">
      <div className="w-full max-w-sm bg-white p-7">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-[#70736d]">WAT Agency</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="mt-2 text-sm leading-6 text-[#6c706b]">Use at least 8 characters. A longer, unique password is safer.</p>
        {error && <p className="mt-4 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        <form action={updatePassword} className="mt-6 space-y-4">
          <label className="block text-sm font-semibold">New password
            <input name="password" type="password" required minLength={8} autoComplete="new-password" className="mt-2 h-11 w-full border border-[#d5d6d0] px-3 font-normal outline-none focus:border-[#181a1d]" />
          </label>
          <label className="block text-sm font-semibold">Confirm new password
            <input name="confirmation" type="password" required minLength={8} autoComplete="new-password" className="mt-2 h-11 w-full border border-[#d5d6d0] px-3 font-normal outline-none focus:border-[#181a1d]" />
          </label>
          <button className="h-11 w-full bg-[#c9fa3c] text-sm font-bold text-[#182000]">Update password</button>
        </form>
      </div>
    </main>
  );
}
