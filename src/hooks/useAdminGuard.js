"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export function useAdminGuard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [adminProfile, setAdminProfile] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (!currentUser) {
          setLoading(false);
          router.replace("/login");
          return;
        }

        await currentUser.reload();
        if (!currentUser.emailVerified) {
          setLoading(false);
          router.replace("/verify-email");
          return;
        }

        const userSnapshot = await getDoc(doc(db, "users", currentUser.uid));
        if (!userSnapshot.exists()) {
          await signOut(auth);
          setLoading(false);
          router.replace("/login");
          return;
        }

        const profile = userSnapshot.data();
        if (profile.role !== "admin") {
          setLoading(false);
          if (profile.role === "doctor") {
            router.replace(profile.approvalStatus === "approved" ? "/" : "/doctor/pending-approval");
          } else {
            router.replace("/");
          }
          return;
        }

        setAdminProfile(profile);
        setLoading(false);
      } catch {
        setLoading(false);
        router.replace("/login");
      }
    });

    return () => unsubscribe();
  }, [router]);

  return { loading, adminProfile };
}
