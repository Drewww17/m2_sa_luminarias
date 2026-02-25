"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword, sendEmailVerification } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

function generateSystemId() {
  const year = new Date().getFullYear();
  const random4Digit = Math.floor(1000 + Math.random() * 9000);
  return `DFU-${year}-${random4Digit}`;
}

export default function RegisterPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "patient",
    professionalId: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const updateField = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const email = form.email.trim();

    if (!firstName || !lastName || !email || !form.password || !form.confirmPassword) {
      setError("Please fill in all required fields.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (form.role === "doctor" && !form.professionalId.trim()) {
      setError("Professional ID is required for medical professionals.");
      return;
    }

    const safeRole = form.role === "doctor" ? "doctor" : "patient";

    setLoading(true);

    try {
      const credential = await createUserWithEmailAndPassword(auth, email, form.password);
      await sendEmailVerification(credential.user);

      await setDoc(doc(db, "users", credential.user.uid), {
        uid: credential.user.uid,
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`,
        email,
        role: safeRole,
        professionalId: safeRole === "doctor" ? form.professionalId.trim() : null,
        approvalStatus: safeRole === "doctor" ? "pending" : "approved",
        systemId: generateSystemId(),
        createdAt: serverTimestamp(),
      });

      router.push("/verify-email");
    } catch (registrationError) {
      setError(registrationError?.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <section className="w-full max-w-xl bg-white rounded-2xl shadow-md p-8">
        <h1 className="text-2xl font-bold text-slate-900">Create your DFU-Detect account</h1>
        <p className="mt-2 text-slate-600">Sign up to access secure screening workflows.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1 text-slate-700">
              First Name
              <input
                value={form.firstName}
                onChange={(event) => updateField("firstName", event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-600"
              />
            </label>

            <label className="flex flex-col gap-1 text-slate-700">
              Last Name
              <input
                value={form.lastName}
                onChange={(event) => updateField("lastName", event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-600"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-slate-700">
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) => updateField("email", event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-600"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1 text-slate-700">
              Password
              <input
                type="password"
                value={form.password}
                onChange={(event) => updateField("password", event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-600"
              />
            </label>

            <label className="flex flex-col gap-1 text-slate-700">
              Confirm Password
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(event) => updateField("confirmPassword", event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-600"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-slate-700">
            Role
            <select
              value={form.role}
              onChange={(event) => updateField("role", event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="patient">Patient</option>
              <option value="doctor">Medical Pro</option>
            </select>
          </label>

          {form.role === "doctor" && (
            <label className="flex flex-col gap-1 text-slate-700">
              Professional ID
              <input
                value={form.professionalId}
                onChange={(event) => updateField("professionalId", event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-600"
              />
            </label>
          )}

          {error ? <p className="text-red-500 text-sm">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>
      </section>
    </main>
  );
}
