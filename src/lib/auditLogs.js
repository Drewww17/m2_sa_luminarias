import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function logAuditAction({ action, performedBy, targetUser, scanId }) {
  if (!action || !performedBy || !targetUser) {
    return;
  }

  const payload = {
    action,
    performedBy,
    targetUser,
    timestamp: serverTimestamp(),
  };

  if (scanId) {
    payload.scanId = scanId;
  }

  await addDoc(collection(db, "auditLogs"), payload);
}
