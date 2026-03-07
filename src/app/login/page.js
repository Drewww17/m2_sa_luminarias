"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
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
  const [sessionChecking, setSessionChecking] = useState(true);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  useEffect(() => {
    let isUnmounted = false;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      let shouldStopChecking = true;

      try {
        if (!currentUser) {
          return;
        }

        await currentUser.reload();
        if (!currentUser.emailVerified) {
          shouldStopChecking = false;
          router.replace("/verify-email");
          return;
        }

        const userSnapshot = await getDoc(doc(db, "users", currentUser.uid));
        if (!userSnapshot.exists()) {
          await signOut(auth);
          return;
        }

        const profile = userSnapshot.data();
        shouldStopChecking = false;
        if (profile.role === "admin") {
          router.replace("/admin/dashboard");
          return;
        }

        if (profile.role === "doctor") {
          if (profile.approvalStatus !== "approved") {
            router.replace("/doctor/pending-approval");
            return;
          }

          router.replace("/");
          return;
        }

        router.replace("/");
      } catch {
        // Leave user on login when auth/session checks fail.
      } finally {
        if (!isUnmounted && shouldStopChecking) {
          setSessionChecking(false);
        }
      }
    });

    return () => {
      isUnmounted = true;
      unsubscribe();
    };
  }, [router]);

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
        router.replace("/verify-email");
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
        router.replace("/admin/dashboard");
        return;
      }

      if (profile.role === "doctor") {
        if (profile.approvalStatus !== "approved") {
          loginSucceeded = true;
          router.replace("/doctor/pending-approval");
          return;
        }

        loginSucceeded = true;
        router.replace("/");
        return;
      }

      loginSucceeded = true;
      router.replace("/");
    } catch (loginError) {
      const code = loginError?.code || "";
      const friendlyMessages = {
        "auth/wrong-password": "Incorrect password. Please try again.",
        "auth/invalid-credential": "Invalid email or password. Please try again.",
        "auth/user-not-found": "No account found with this email.",
        "auth/too-many-requests": "Too many failed attempts. Please try again later.",
        "auth/user-disabled": "This account has been disabled. Contact support.",
        "auth/invalid-email": "Please enter a valid email address.",
      };
      setError(friendlyMessages[code] || "Login failed. Please try again.");
    } finally {
      setLoading(false);
      if (!loginSucceeded) {
        resetCaptcha();
      }
    }
  };

  if (sessionChecking) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <p className="text-slate-600">Checking session...</p>
      </main>
    );
  }

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

          <p className="text-sm text-center text-slate-600">
            Don&apos;t have an account?{" "}
            <button type="button" onClick={() => router.push("/register")} className="text-blue-600 hover:text-blue-700 font-medium">
              Sign Up
            </button>
          </p>
        </form>

        <div className="mt-8 border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
          <p>© 2026 Philip Andrew</p>
          <p>DFU-Detect — AI Assisted Diabetic Foot Ulcer Detection System</p>
        </div>
      </section>
    </main>
  );
}
