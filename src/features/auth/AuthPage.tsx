import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, LoaderCircle, LockKeyhole } from "lucide-react";
import { type FormEvent, useState } from "react";

import { theramaBrandLogoUrl } from "@/lib/brandAssets";

import { isSupabaseConfigured, supabaseClient } from "./supabaseClient";

type AuthMode = "login" | "signup" | "reset";

export function AuthPage({ mode }: { mode: AuthMode }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const isSignup = mode === "signup";
  const isReset = mode === "reset";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");

    if (!supabaseClient) {
      setError(
        "Account sign-in is not configured for this deployment yet. You can still use the workspace without an account.",
      );
      setBusy(false);
      return;
    }

    try {
      if (isReset) {
        const { error: updateError } = await supabaseClient.auth.updateUser({ password });
        if (updateError) throw updateError;
        setMessage("Your password was updated. You can now sign in.");
        await navigate({ to: "/login" });
      } else if (recoveryMode) {
        const { error: recoveryError } = await supabaseClient.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (recoveryError) throw recoveryError;
        setMessage(
          "If an account exists for that email, you’ll receive a password reset link shortly.",
        );
      } else if (isSignup) {
        const { data, error: signupError } = await supabaseClient.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: name.trim() },
            emailRedirectTo: `${window.location.origin}/app`,
          },
        });
        if (signupError) throw signupError;
        // Never enter the workspace directly from signup. A configured Auth
        // project sends a confirmation link; if it unexpectedly issued a
        // session, discard it and keep the user on this page.
        if (data.session) await supabaseClient.auth.signOut();
        setMessage("Check your email and confirm your address before signing in.");
      } else {
        const { data, error: loginError } = await supabaseClient.auth.signInWithPassword({
          email,
          password,
        });
        if (loginError) throw loginError;
        if (!data.user?.email_confirmed_at) {
          await supabaseClient.auth.signOut();
          setMessage("Confirm your email address before signing in.");
        } else {
          await navigate({ to: "/app" });
        }
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "We couldn’t complete that request. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f8f6] px-5 py-12 text-[#17251f]">
      <div className="w-full max-w-[430px]">
        <Link
          to="/"
          className="mb-9 inline-flex items-center gap-2 text-sm text-[#708078] transition-colors hover:text-[#173d31]"
        >
          <ArrowLeft size={15} /> Back to home
        </Link>
        <div className="rounded-[1.4rem] border border-[#dfe7e0] bg-white p-7 shadow-[0_28px_80px_-52px_rgba(23,61,49,0.35)] sm:p-9">
          <img
            src={theramaBrandLogoUrl}
            alt=""
            width={40}
            height={40}
            className="mb-7 size-10 rounded-xl object-cover ring-1 ring-[#dce6df]"
          />
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6b8d78]">
            Markdown Workspace
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#173d31]">
            {isReset
              ? "Choose a new password"
              : recoveryMode
                ? "Reset your password"
                : isSignup
                  ? "Create your account"
                  : "Welcome back"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#77867d]">
            {isReset
              ? "Choose a new password for your account."
              : recoveryMode
                ? "We’ll email you a link to choose a new password."
                : isSignup
                  ? "Use your account when you want to sync encrypted Markdown across devices."
                  : "Sign in to continue to your workspace and sync settings."}
          </p>

          {!isSupabaseConfigured && (
            <div className="mt-5 rounded-xl border border-[#eadfbe] bg-[#fbf8ef] px-4 py-3 text-xs leading-5 text-[#75653a]">
              Sign-in is being connected to the account service. The local workspace is ready to use
              now.
            </div>
          )}

          <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
            {isSignup && !recoveryMode && !isReset && (
              <label className="block space-y-1.5 text-sm font-medium text-[#43584c]">
                Name
                <input
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="h-11 w-full rounded-lg border border-[#dbe4dd] bg-white px-3 text-sm outline-none transition focus:border-[#6e9b7b] focus:ring-2 focus:ring-[#6e9b7b]/15"
                  placeholder="Your name"
                />
              </label>
            )}
            <label className="block space-y-1.5 text-sm font-medium text-[#43584c]">
              Email
              <input
                autoComplete="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-11 w-full rounded-lg border border-[#dbe4dd] bg-white px-3 text-sm outline-none transition focus:border-[#6e9b7b] focus:ring-2 focus:ring-[#6e9b7b]/15"
                placeholder="you@example.com"
              />
            </label>
            {!recoveryMode && (
              <label className="block space-y-1.5 text-sm font-medium text-[#43584c]">
                {isReset ? "New password" : "Password"}
                <input
                  autoComplete={isSignup || isReset ? "new-password" : "current-password"}
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-11 w-full rounded-lg border border-[#dbe4dd] bg-white px-3 text-sm outline-none transition focus:border-[#6e9b7b] focus:ring-2 focus:ring-[#6e9b7b]/15"
                  placeholder="At least 8 characters"
                />
              </label>
            )}
            {error && (
              <p
                role="alert"
                className="rounded-lg bg-[#fff1ee] px-3 py-2.5 text-sm text-[#994b3e]"
              >
                {error}
              </p>
            )}
            {message && (
              <p
                role="status"
                className="rounded-lg bg-[#eff6ef] px-3 py-2.5 text-sm text-[#3d6e4c]"
              >
                {message}
              </p>
            )}
            <button
              disabled={busy || !isSupabaseConfigured}
              type="submit"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#173d31] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#235644] disabled:cursor-not-allowed disabled:opacity-55"
            >
              {busy && <LoaderCircle size={15} className="animate-spin" />}
              {isReset
                ? "Update password"
                : recoveryMode
                  ? "Send reset link"
                  : isSignup
                    ? "Create account"
                    : "Sign in"}
            </button>
          </form>

          <div className="mt-5 flex flex-col items-center gap-3 text-xs text-[#7b8a81]">
            {!isSignup && !isReset && !recoveryMode && (
              <button
                type="button"
                onClick={() => {
                  setRecoveryMode(true);
                  setError("");
                  setMessage("");
                }}
                className="hover:text-[#315c43]"
              >
                Forgot your password?
              </button>
            )}
            {recoveryMode && (
              <button
                type="button"
                onClick={() => {
                  setRecoveryMode(false);
                  setError("");
                  setMessage("");
                }}
                className="hover:text-[#315c43]"
              >
                Back to sign in
              </button>
            )}
            {!recoveryMode && !isReset && (
              <p>
                {isSignup ? "Already have an account? " : "New here? "}
                <Link
                  className="font-semibold text-[#37664b] hover:text-[#173d31]"
                  to={isSignup ? "/login" : "/signup"}
                >
                  {isSignup ? "Sign in" : "Create an account"}
                </Link>
              </p>
            )}
          </div>
        </div>
        <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[11px] leading-5 text-[#91a096]">
          <LockKeyhole size={12} /> Encrypted Markdown sync starts on after sign-in. Pause it
          anytime in Preferences.
        </p>
      </div>
    </main>
  );
}
