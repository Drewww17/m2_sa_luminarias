"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
 

export default function AdminDoctorApprovalsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/dashboard");
  }, [router]);

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <section className="w-full max-w-md bg-white rounded-2xl shadow-md p-8 text-center">
        <p className="text-slate-700">Redirecting to admin dashboard...</p>
      </section>
    </main>
  );
}
