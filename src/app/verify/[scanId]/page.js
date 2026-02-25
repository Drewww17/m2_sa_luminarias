"use client";

import { use, useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { generateHash } from "@/utils/hashGenerator";
import { MODEL_VERSION, SYSTEM_VERSION } from "@/constants/systemInfo";

function extractCreatedAt(scan) {
  if (scan?.createdAt?.toMillis) {
    return scan.createdAt.toMillis();
  }
  if (scan?.createdAt?.seconds) {
    return scan.createdAt.seconds * 1000;
  }
  return scan?.createdAt || "";
}

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
        const snapshot = await getDoc(doc(db, "reportVerifications", scanId));
        if (!snapshot.exists()) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        const scanData = { id: snapshot.id, ...snapshot.data() };
        const recomputed = await generateHash({
          diagnosis: scanData.diagnosis,
          confidence: Number(scanData.confidence || 0),
          riskLevel: scanData.riskLevel || scanData.severity || "Unknown",
          createdAt: extractCreatedAt({ createdAt: scanData.timestamp }),
          systemVersion: scanData.systemVersion || SYSTEM_VERSION,
          modelVersion: scanData.modelVersion || MODEL_VERSION,
        });

        setValid(recomputed === scanData.scanHash);
        setScan(scanData);
        setLoading(false);
      } catch {
        setNotFound(true);
        setLoading(false);
      }
    };

    runVerification();
  }, [scanId]);

  const statusText = useMemo(() => {
    if (notFound) {
      return "Invalid or Tampered Report";
    }
    if (valid) {
      return "Report Verified";
    }
    return "Integrity Compromised";
  }, [notFound, valid]);

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
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
                <p><span className="font-semibold text-slate-900">Doctor verification:</span> {scan.reviewedBy || scan.verifiedBy || "N/A"}</p>
                <p><span className="font-semibold text-slate-900">Timestamp:</span> {scan.timestamp?.toDate ? scan.timestamp.toDate().toLocaleString() : "N/A"}</p>
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
