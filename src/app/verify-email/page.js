"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sendEmailVerification } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function VerifyEmailPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      router.replace("/login");
      return;
    }

    if (currentUser.emailVerified) {
      router.replace("/login");
    }
  }, [router]);

  const handleResend = async () => {
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      if (!auth.currentUser) {
        throw new Error("No authenticated user found. Please log in again.");
      }

      await sendEmailVerification(auth.currentUser);
      setSuccess("Verification email sent. Please check your inbox.");
    } catch (verificationError) {
      setError(verificationError?.message || "Failed to resend verification email.");
    } finally {
      setLoading(false);
    }
  };

  const handleCheckStatus = async () => {
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      if (!auth.currentUser) {
        throw new Error("No authenticated user found. Please log in again.");
      }

      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) {
        router.replace("/login");
        return;
      }

      setSuccess("Email not verified yet. Please verify and try again.");
    } catch (statusError) {
      setError(statusError?.message || "Unable to check verification status.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <section className="w-full max-w-xl bg-white rounded-2xl shadow-md p-8">
        <h1 className="text-2xl font-bold text-slate-900">Verify your email</h1>
        <p className="mt-2 text-slate-600">
          We sent a verification link to your email address. Verify your account to continue.
        </p>

        {error ? <p className="mt-4 text-red-500">{error}</p> : null}
        {success ? <p className="mt-4 text-emerald-500">{success}</p> : null}

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={handleResend}
            disabled={loading}
            className="rounded-lg px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
          >
            Resend Verification
          </button>
          <button
            type="button"
            onClick={handleCheckStatus}
            disabled={loading}
            className="rounded-lg px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
          >
            Check Verification Status
          </button>
        </div>
      </section>
    </main>
  );
}
