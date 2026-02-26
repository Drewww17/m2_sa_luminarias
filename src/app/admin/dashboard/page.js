"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import {
  deleteDoc,
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
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
  const [users, setUsers] = useState([]);
  const [busyUid, setBusyUid] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [userForm, setUserForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "patient",
    professionalId: "",
    approvalStatus: "approved",
    systemId: "",
  });

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

  useEffect(() => {
    if (loading || !adminProfile) {
      return undefined;
    }

    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const mappedUsers = snapshot.docs.map((userDocument) => ({
          uid: userDocument.id,
          ...userDocument.data(),
        }));
        mappedUsers.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setUsers(mappedUsers);
      },
      () => {
        setError("Failed to load users.");
      }
    );

    return () => unsubscribe();
  }, [loading, adminProfile]);

  const pendingCount = useMemo(() => pendingDoctors.length, [pendingDoctors]);

  const resetUserForm = () => {
    setSelectedUserId("");
    setUserForm({
      firstName: "",
      lastName: "",
      email: "",
      role: "patient",
      professionalId: "",
      approvalStatus: "approved",
      systemId: "",
    });
  };

  const populateUserForm = (profile) => {
    setSelectedUserId(profile.uid);
    setUserForm({
      firstName: profile.firstName || "",
      lastName: profile.lastName || "",
      email: profile.email || "",
      role: profile.role || "patient",
      professionalId: profile.professionalId || "",
      approvalStatus: profile.approvalStatus || "approved",
      systemId: profile.systemId || "",
    });
  };

  const updateUserFormField = (field, value) => {
    setUserForm((previous) => ({ ...previous, [field]: value }));
  };

  const createUserRecord = async () => {
    setError("");
    setSuccess("");
    setFormBusy(true);

    try {
      if (!userForm.firstName.trim() || !userForm.lastName.trim() || !userForm.email.trim()) {
        throw new Error("First name, last name, and email are required.");
      }

      const adminUid = auth.currentUser?.uid;
      if (!adminUid) {
        throw new Error("Unauthorized action.");
      }

      const newUid = crypto.randomUUID();
      const safeRole = ["patient", "doctor"].includes(userForm.role) ? userForm.role : "patient";
      const approvalStatus = safeRole === "doctor" ? (userForm.approvalStatus || "pending") : "approved";

      await setDoc(doc(db, "users", newUid), {
        uid: newUid,
        firstName: userForm.firstName.trim(),
        lastName: userForm.lastName.trim(),
        fullName: `${userForm.firstName.trim()} ${userForm.lastName.trim()}`,
        email: userForm.email.trim(),
        role: safeRole,
        professionalId: safeRole === "doctor" ? userForm.professionalId.trim() || null : null,
        approvalStatus,
        systemId: userForm.systemId.trim() || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await logAuditAction({
        action: "admin_user_created",
        performedBy: adminUid,
        targetUser: newUid,
      });

      setSuccess("User record created successfully.");
      resetUserForm();
    } catch (creationError) {
      setError(creationError?.message || "Failed to create user record.");
    } finally {
      setFormBusy(false);
    }
  };

  const updateUserRecord = async () => {
    setError("");
    setSuccess("");
    setFormBusy(true);

    try {
      if (!selectedUserId) {
        throw new Error("Select a user first.");
      }

      const adminUid = auth.currentUser?.uid;
      if (!adminUid) {
        throw new Error("Unauthorized action.");
      }

      const safeRole = ["patient", "doctor"].includes(userForm.role) ? userForm.role : "patient";

      await updateDoc(doc(db, "users", selectedUserId), {
        firstName: userForm.firstName.trim(),
        lastName: userForm.lastName.trim(),
        fullName: `${userForm.firstName.trim()} ${userForm.lastName.trim()}`,
        email: userForm.email.trim(),
        role: safeRole,
        professionalId: safeRole === "doctor" ? userForm.professionalId.trim() || null : null,
        approvalStatus: safeRole === "doctor" ? (userForm.approvalStatus || "pending") : "approved",
        systemId: userForm.systemId.trim() || null,
        updatedAt: serverTimestamp(),
      });

      await logAuditAction({
        action: "admin_user_updated",
        performedBy: adminUid,
        targetUser: selectedUserId,
      });

      setSuccess("User record updated successfully.");
    } catch (updateError) {
      setError(updateError?.message || "Failed to update user record.");
    } finally {
      setFormBusy(false);
    }
  };

  const deleteUserRecord = async () => {
    setError("");
    setSuccess("");

    try {
      if (!selectedUserId) {
        throw new Error("Select a user first.");
      }

      if (!confirm("Delete this user profile record? This cannot be undone.")) {
        return;
      }

      const adminUid = auth.currentUser?.uid;
      if (!adminUid) {
        throw new Error("Unauthorized action.");
      }

      await deleteDoc(doc(db, "users", selectedUserId));

      await logAuditAction({
        action: "admin_user_deleted",
        performedBy: adminUid,
        targetUser: selectedUserId,
      });

      setSuccess("User record deleted successfully.");
      resetUserForm();
    } catch (deleteError) {
      setError(deleteError?.message || "Failed to delete user record.");
    }
  };

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
    <main className="min-h-screen bg-slate-100 p-6 fade-in">
      <section className="max-w-6xl mx-auto bg-white rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-300 p-8">
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
            className="rounded-xl px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all duration-150"
          >
            Logout
          </button>
        </div>

        {error ? <p className="mt-4 text-red-500">{error}</p> : null}
        {success ? <p className="mt-4 text-emerald-500">{success}</p> : null}

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-200">
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
                  <tr key={doctorProfile.uid} className="border-t border-slate-200 hover:bg-slate-50 transition-colors duration-150">
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
                          className="rounded-xl px-3 py-2 text-white bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-150"
                        >
                          {busyUid === doctorProfile.uid ? "Working..." : "Approve"}
                        </button>
                        <button
                          type="button"
                          onClick={() => updateDoctorStatus(doctorProfile.uid, "rejected")}
                          disabled={busyUid === doctorProfile.uid}
                          className="rounded-xl px-3 py-2 text-white bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-150"
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

      <section className="mt-8 bg-white rounded-2xl border border-slate-200 p-6 shadow-lg hover:shadow-xl transition-shadow duration-300">
        <h2 className="text-xl font-bold text-slate-900">User & Doctor Management</h2>
        <p className="mt-2 text-sm text-slate-600">
          Create, edit, and delete user records for patients and doctors.
        </p>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <label className="block text-sm text-slate-700">
              First Name
              <input
                value={userForm.firstName}
                onChange={(event) => updateUserFormField("firstName", event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 transition-all duration-150 focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
              />
            </label>

            <label className="block text-sm text-slate-700">
              Last Name
              <input
                value={userForm.lastName}
                onChange={(event) => updateUserFormField("lastName", event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 transition-all duration-150 focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
              />
            </label>

            <label className="block text-sm text-slate-700">
              Email
              <input
                type="email"
                value={userForm.email}
                onChange={(event) => updateUserFormField("email", event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 transition-all duration-150 focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
              />
            </label>

            <label className="block text-sm text-slate-700">
              Role
              <select
                value={userForm.role}
                onChange={(event) => updateUserFormField("role", event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 transition-all duration-150 focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
              >
                <option value="patient">Patient</option>
                <option value="doctor">Doctor</option>
              </select>
            </label>

            {userForm.role === "doctor" ? (
              <>
                <label className="block text-sm text-slate-700">
                  Professional ID
                  <input
                    value={userForm.professionalId}
                    onChange={(event) => updateUserFormField("professionalId", event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 transition-all duration-150 focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  />
                </label>

                <label className="block text-sm text-slate-700">
                  Approval Status
                  <select
                    value={userForm.approvalStatus}
                    onChange={(event) => updateUserFormField("approvalStatus", event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 transition-all duration-150 focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  >
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </label>
              </>
            ) : null}

            <label className="block text-sm text-slate-700">
              System ID
              <input
                value={userForm.systemId}
                onChange={(event) => updateUserFormField("systemId", event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 transition-all duration-150 focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
              />
            </label>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={createUserRecord}
                disabled={formBusy}
                className="rounded-xl px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-150"
              >
                {formBusy ? "Working..." : "Create"}
              </button>
              <button
                type="button"
                onClick={updateUserRecord}
                disabled={formBusy || !selectedUserId}
                className="rounded-xl px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-150"
              >
                Update
              </button>
              <button
                type="button"
                onClick={deleteUserRecord}
                disabled={!selectedUserId}
                className="rounded-xl px-4 py-2 text-white bg-red-600 hover:bg-red-700 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-150"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={resetUserForm}
                className="rounded-xl px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 active:scale-95 transition-all duration-150"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="overflow-auto max-h-[560px] border border-slate-200 rounded-xl">
            <table className="w-full text-left divide-y divide-slate-200">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-900">Name</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-900">Email</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-900">Role</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-900">Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((profile) => (
                  <tr
                    key={profile.uid}
                    onClick={() => populateUserForm(profile)}
                    className={`border-t border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors duration-150 ${selectedUserId === profile.uid ? "bg-blue-50" : ""}`}
                  >
                    <td className="px-3 py-2 text-sm text-slate-700">{profile.fullName || `${profile.firstName || ""} ${profile.lastName || ""}`.trim() || "N/A"}</td>
                    <td className="px-3 py-2 text-sm text-slate-700">{profile.email || "N/A"}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 capitalize">{profile.role || "patient"}</td>
                    <td className="px-3 py-2 text-sm text-slate-700">{profile.approvalStatus || "approved"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
