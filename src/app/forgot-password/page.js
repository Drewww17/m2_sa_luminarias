"use client";

import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleReset = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError("Please enter your email address.");
      return;
    }

    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, normalizedEmail);
      setSuccess("Password reset link sent. Please check your inbox.");
    } catch (resetError) {
      setError(resetError?.message || "Failed to send reset link.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <section className="w-full max-w-md bg-white rounded-2xl shadow-md p-8">
        <h1 className="text-2xl font-bold text-slate-900">Reset your password</h1>
        <p className="mt-2 text-slate-600">Enter your account email to receive a reset link.</p>

        <form onSubmit={handleReset} className="mt-6 space-y-4">
          <label className="flex flex-col gap-1 text-slate-700">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-600"
            />
          </label>

          {error ? <p className="text-red-500 text-sm">{error}</p> : null}
          {success ? <p className="text-emerald-500 text-sm">{success}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        </form>
      </section>
    </main>
  );
}
