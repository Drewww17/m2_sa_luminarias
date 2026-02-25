"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { logAuditAction } from "@/lib/auditLogs";
import { useAdminGuard } from "@/hooks/useAdminGuard";

function formatDate(createdAt) {
  const timestamp = createdAt?.toDate ? createdAt.toDate() : null;
  if (!timestamp) {
    return "N/A";
  }

  return timestamp.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const { loading, adminProfile } = useAdminGuard();

  const [pendingDoctors, setPendingDoctors] = useState([]);
  const [busyUid, setBusyUid] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (loading || !adminProfile) {
      return undefined;
    }

    const pendingDoctorsQuery = query(
      collection(db, "users"),
      where("role", "==", "doctor"),
      where("approvalStatus", "==", "pending")
    );

    const unsubscribe = onSnapshot(
      pendingDoctorsQuery,
      (snapshot) => {
        const doctors = snapshot.docs.map((doctorDocument) => ({
          uid: doctorDocument.id,
          ...doctorDocument.data(),
        }));
        setPendingDoctors(doctors);
      },
      () => {
        setError("Failed to load pending doctor approvals.");
      }
    );

    return () => unsubscribe();
  }, [loading, adminProfile]);

  const pendingCount = useMemo(() => pendingDoctors.length, [pendingDoctors]);

  const updateDoctorStatus = async (doctorUid, approvalStatus) => {
    setError("");
    setSuccess("");
    setBusyUid(doctorUid);

    try {
      const adminUid = auth.currentUser?.uid;
      if (!adminUid) {
        throw new Error("Unauthorized action.");
      }

      await updateDoc(doc(db, "users", doctorUid), {
        approvalStatus,
        reviewedAt: serverTimestamp(),
        reviewedBy: adminUid,
      });

      await logAuditAction({
        action: approvalStatus === "approved" ? "doctor_approved" : "doctor_rejected",
        performedBy: adminUid,
        targetUser: doctorUid,
      });

      setSuccess(
        approvalStatus === "approved"
          ? "Doctor approved successfully."
          : "Doctor rejected successfully."
      );
    } catch {
      setError("Action failed. Please try again.");
    } finally {
      setBusyUid("");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/login");
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <section className="w-full max-w-md bg-white rounded-2xl shadow-md p-8 text-center">
          <p className="text-slate-700">Loading dashboard...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <section className="max-w-6xl mx-auto bg-white rounded-2xl shadow-md p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
            <p className="mt-1 text-slate-600">
              Welcome, {adminProfile?.firstName || "Admin"}. Pending doctor approvals: {pendingCount}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg px-4 py-2 text-white bg-blue-600 hover:bg-blue-700"
          >
            Logout
          </button>
        </div>

        {error ? <p className="mt-4 text-red-500">{error}</p> : null}
        {success ? <p className="mt-4 text-emerald-500">{success}</p> : null}

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left border border-slate-200 rounded-xl overflow-hidden">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-sm font-semibold text-slate-900">Name</th>
                <th className="px-4 py-3 text-sm font-semibold text-slate-900">Email</th>
                <th className="px-4 py-3 text-sm font-semibold text-slate-900">Professional ID</th>
                <th className="px-4 py-3 text-sm font-semibold text-slate-900">Created Date</th>
                <th className="px-4 py-3 text-sm font-semibold text-slate-900">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingDoctors.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-slate-600" colSpan={5}>
                    No pending doctor approvals.
                  </td>
                </tr>
              ) : (
                pendingDoctors.map((doctorProfile) => (
                  <tr key={doctorProfile.uid} className="border-t border-slate-200">
                    <td className="px-4 py-3 text-slate-700">{doctorProfile.fullName}</td>
                    <td className="px-4 py-3 text-slate-700">{doctorProfile.email}</td>
                    <td className="px-4 py-3 text-slate-700">{doctorProfile.professionalId || "N/A"}</td>
                    <td className="px-4 py-3 text-slate-700">{formatDate(doctorProfile.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateDoctorStatus(doctorProfile.uid, "approved")}
                          disabled={busyUid === doctorProfile.uid}
                          className="rounded-lg px-3 py-2 text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
                        >
                          {busyUid === doctorProfile.uid ? "Working..." : "Approve"}
                        </button>
                        <button
                          type="button"
                          onClick={() => updateDoctorStatus(doctorProfile.uid, "rejected")}
                          disabled={busyUid === doctorProfile.uid}
                          className="rounded-lg px-3 py-2 text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
