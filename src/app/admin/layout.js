"use client";

import { useAdminGuard } from "@/hooks/useAdminGuard";

export default function AdminLayout({ children }) {
  const { loading } = useAdminGuard();

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <section className="w-full max-w-md bg-white rounded-2xl shadow-md p-8 text-center">
          <p className="text-slate-700">Checking access...</p>
        </section>
      </main>
    );
  }

  return children;
}
