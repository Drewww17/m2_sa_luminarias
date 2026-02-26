/**
 * Migration script to update scanHash for all existing scans.
 * Run this ONCE after deploying the new hash algorithm.
 * 
 * Usage: Import and call migrateAllScanHashes() from a one-time admin action
 */

import { collection, getDocs, updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { generateScanHash } from "./hashGenerator";

export async function migrateAllScanHashes() {
  const scansRef = collection(db, "scans");
  const snapshot = await getDocs(scansRef);
  
  let updated = 0;
  let failed = 0;
  
  for (const scanDoc of snapshot.docs) {
    try {
      const scanData = scanDoc.data();
      
      // Generate new hash using the current algorithm
      const newHash = generateScanHash({
        diagnosis: scanData.diagnosis,
        confidence: scanData.confidence,
        riskLevel: scanData.riskLevel,
        systemVersion: scanData.systemVersion,
        modelVersion: scanData.modelVersion,
      });
      
      // Update the document with new hash
      await updateDoc(doc(db, "scans", scanDoc.id), {
        scanHash: newHash,
      });
      
      updated++;
    } catch (err) {
      console.error(`Failed to update scan ${scanDoc.id}:`, err);
      failed++;
    }
  }

  return { updated, failed };
}
