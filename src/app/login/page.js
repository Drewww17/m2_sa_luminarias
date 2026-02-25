"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      await credential.user.reload();

      if (!credential.user.emailVerified) {
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
        router.push("/admin/dashboard");
        return;
      }

      if (profile.role === "doctor") {
        if (profile.approvalStatus !== "approved") {
          router.push("/doctor/pending-approval");
          return;
        }

        router.push("/");
        return;
      }

      router.push("/");
    } catch (loginError) {
      setError(loginError?.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <section className="w-full max-w-md bg-white rounded-2xl shadow-md p-8">
        <h1 className="text-2xl font-bold text-slate-900">Sign in to DFU-Detect</h1>

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

          {error ? <p className="text-red-500 text-sm">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
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
      </section>
    </main>
  );
}
