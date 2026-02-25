"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export function useAuthGuard(options = {}) {
  const { requiredRole } = options;
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (!currentUser) {
          setUser(null);
          setProfile(null);
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

        const userProfile = userSnapshot.data();
        if (requiredRole && userProfile.role !== requiredRole) {
          if (userProfile.role === "admin") {
            router.replace("/admin/dashboard");
          } else if (userProfile.role === "doctor") {
            router.replace("/doctor/dashboard");
          } else {
            router.replace("/patient/dashboard");
          }
          setLoading(false);
          return;
        }

        if (
          userProfile.role === "doctor" &&
          userProfile.approvalStatus !== "approved" &&
          pathname !== "/doctor/pending-approval"
        ) {
          router.replace("/doctor/pending-approval");
          setLoading(false);
          return;
        }

        setUser(currentUser);
        setProfile(userProfile);
        setLoading(false);
      } catch {
        setUser(null);
        setProfile(null);
        setLoading(false);
        router.replace("/login");
      }
    });

    return () => unsubscribe();
  }, [pathname, requiredRole, router]);

  return { user, profile, loading };
}
