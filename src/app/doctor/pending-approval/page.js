"use client";

import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";

export default function DoctorPendingApprovalPage() {
  const router = useRouter();

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/login");
  };

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <section className="w-full max-w-xl bg-white rounded-2xl shadow-md p-8">
        <h1 className="text-2xl font-bold text-slate-900">Account Under Review</h1>
        <p className="mt-2 text-slate-600">
          Your medical professional account is pending approval. You will gain full access once verified by an administrator.
        </p>

        <button
          type="button"
          onClick={handleLogout}
          className="mt-6 rounded-lg px-4 py-2 text-white bg-blue-600 hover:bg-blue-700"
        >
          Logout
        </button>
      </section>
    </main>
  );
}
