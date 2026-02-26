"use client";

import { use, useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { generateScanHash } from "@/utils/hashGenerator";
import { MODEL_VERSION, SYSTEM_VERSION } from "@/constants/systemInfo";

export default function VerifyScanPage({ params }) {
  const { scanId } = use(params);
  const [loading, setLoading] = useState(true);
  const [scan, setScan] = useState(null);
  const [valid, setValid] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const runVerification = async () => {
      setLoading(true);
      setNotFound(false);

      try {
        // Try "scans" collection first, then "reportVerifications" as fallback
        let snapshot = await getDoc(doc(db, "scans", scanId));
        if (!snapshot.exists()) {
          snapshot = await getDoc(doc(db, "reportVerifications", scanId));
        }

        if (!snapshot.exists()) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        const scanData = { id: snapshot.id, ...snapshot.data() };
        setScan(scanData);

        // Use EXACT stored values - must match creation logic exactly
        const normalizedData = {
          diagnosis: scanData.diagnosis,
          confidence: Number(scanData.confidence) || 0,
          riskLevel: scanData.riskLevel || 'Low',
          systemVersion: scanData.systemVersion,
          modelVersion: scanData.modelVersion,
        };

        const recomputedHash = generateScanHash(normalizedData);

        setValid(recomputedHash === scanData.scanHash);
        setLoading(false);
      } catch (err) {
        console.error("Verification error:", err);
        setNotFound(true);
        setLoading(false);
      }
    };

    runVerification();
  }, [scanId]);

  const statusText = useMemo(() => {
    if (notFound) return "Invalid or Tampered Report";
    if (valid) return "Report Verified";
    return "Integrity Compromised";
  }, [notFound, valid]);

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6" style={{ color: "#1e293b" }}>
      <section className="w-full max-w-2xl bg-white rounded-2xl shadow-md p-8">
        <h1 className="text-2xl font-bold text-slate-900">Report Verification</h1>

        {loading ? <p className="mt-3 text-slate-600">Verifying report...</p> : null}

        {!loading && (
          <>
            <p className={`mt-4 font-semibold ${valid ? "text-emerald-500" : "text-red-500"}`}>
              {valid ? "✔" : "❌"} {statusText}
            </p>

            {scan && !notFound ? (
              <div className="mt-6 space-y-2 text-slate-700">
                <p><span className="font-semibold text-slate-900">Diagnosis:</span> {scan.diagnosis || scan.result}</p>
                <p><span className="font-semibold text-slate-900">Confidence:</span> {Number(scan.confidence || 0).toFixed(2)}%</p>
                <p><span className="font-semibold text-slate-900">Risk level:</span> {scan.riskLevel || scan.severity || "N/A"}</p>
                <p><span className="font-semibold text-slate-900">Doctor verification:</span> {scan.verificationStatus || scan.reviewStatus || "pending"}</p>
                <p><span className="font-semibold text-slate-900">Reviewed by:</span> {scan.reviewedBy || scan.verifiedBy || "N/A"}</p>
                <p><span className="font-semibold text-slate-900">Timestamp:</span> {scan.createdAt?.toDate ? scan.createdAt.toDate().toLocaleString() : scan.timestamp?.toDate ? scan.timestamp.toDate().toLocaleString() : "N/A"}</p>
                <p><span className="font-semibold text-slate-900">System:</span> {scan.systemVersion || SYSTEM_VERSION}</p>
                <p><span className="font-semibold text-slate-900">Model:</span> {scan.modelVersion || MODEL_VERSION}</p>
              </div>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
