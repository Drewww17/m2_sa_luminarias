"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import ReCaptchaWidget from "@/components/ReCaptchaWidget";
import { verifyCaptchaToken } from "@/lib/captcha";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  const resetCaptcha = () => {
    setCaptchaToken("");
    setCaptchaResetKey((previous) => previous + 1);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!captchaToken) {
      setError("Please complete the CAPTCHA challenge.");
      return;
    }

    setLoading(true);
    let loginSucceeded = false;

    try {
      const captchaResult = await verifyCaptchaToken(captchaToken, "login");
      if (!captchaResult.ok) {
        setError(captchaResult.error);
        return;
      }

      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      await credential.user.reload();

      if (!credential.user.emailVerified) {
        loginSucceeded = true;
        router.push("/verify-email");
        return;
      }

      const userSnapshot = await getDoc(doc(db, "users", credential.user.uid));
      if (!userSnapshot.exists()) {
        await signOut(auth);
        throw new Error("User profile not found. Please contact support.");
      }

      const profile = userSnapshot.data();
      if (profile.role === "admin") {
        loginSucceeded = true;
        router.push("/admin/dashboard");
        return;
      }

      if (profile.role === "doctor") {
        if (profile.approvalStatus !== "approved") {
          loginSucceeded = true;
          router.push("/doctor/pending-approval");
          return;
        }

        loginSucceeded = true;
        router.push("/");
        return;
      }

      loginSucceeded = true;
      router.push("/");
    } catch (loginError) {
      setError(loginError?.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
      if (!loginSucceeded) {
        resetCaptcha();
      }
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <section className="w-full max-w-md bg-white rounded-xl shadow-md p-8">
        <div className="flex items-center gap-3 mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png?v=2" alt="DFU-Detect" width={40} height={40} style={{ width: 40, height: 40, objectFit: 'contain' }} />
          <div>
            <p className="text-lg font-semibold text-slate-900">DFU-Detect</p>
            <p className="text-xs text-slate-500">Clinical AI Platform</p>
          </div>
        </div>

        <h1 className="text-2xl font-semibold text-slate-900">Sign in to DFU-Detect</h1>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="flex flex-col gap-1 text-slate-700">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-600"
            />
          </label>

          <label className="flex flex-col gap-1 text-slate-700">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-600"
            />
          </label>

          <ReCaptchaWidget onTokenChange={setCaptchaToken} resetKey={captchaResetKey} />

          {error ? <p className="text-red-500 text-sm">{error}</p> : null}

          <button
            type="submit"
            disabled={loading || !captchaToken}
            className="w-full rounded-lg px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>

          <button
            type="button"
            onClick={() => router.push("/forgot-password")}
            className="w-full text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Forgot Password?
          </button>
        </form>

        <div className="mt-8 border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
          <p>© 2026 Philip Andrew</p>
          <p>DFU-Detect — AI Assisted Diabetic Foot Ulcer Detection System</p>
        </div>
      </section>
    </main>
  );
}
