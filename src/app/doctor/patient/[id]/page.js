"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { db } from "@/lib/firebase";
import { useAuthGuard } from "@/hooks/useAuthGuard";

function severityToScore(scan) {
  if (typeof scan.riskScore === "number") {
    return scan.riskScore;
  }

  const riskLevel = scan.riskLevel || scan.severity;
  if (riskLevel === "High") {
    return 90;
  }
  if (riskLevel === "Moderate") {
    return 60;
  }
  return 30;
}

export default function DoctorPatientTimelinePage({ params }) {
  const { loading } = useAuthGuard({ requiredRole: "doctor" });
  const [patientScans, setPatientScans] = useState([]);

  useEffect(() => {
    const scansQuery = query(collection(db, "scans"), where("userId", "==", params.id));
    const unsubscribe = onSnapshot(scansQuery, (snapshot) => {
      const scans = snapshot.docs.map((scanDocument) => ({
        id: scanDocument.id,
        ...scanDocument.data(),
      }));
      scans.sort((a, b) => {
        const aDate = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const bDate = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return aDate - bDate;
      });
      setPatientScans(scans);
    });

    return () => unsubscribe();
  }, [params.id]);

  const timelineData = useMemo(
    () =>
      patientScans.map((scan) => ({
        date: scan.createdAt?.toDate
          ? scan.createdAt.toDate().toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })
          : "N/A",
        riskScore: severityToScore(scan),
      })),
    [patientScans]
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <section className="w-full max-w-md bg-white rounded-2xl shadow-md p-8 text-center">
          <p className="text-slate-700">Loading patient timeline...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <section className="max-w-5xl mx-auto bg-white rounded-2xl shadow-md p-8">
        <h1 className="text-2xl font-bold text-slate-900">Patient Risk Timeline</h1>
        <p className="mt-2 text-slate-600">Longitudinal progression of risk across recorded scans.</p>

        <div className="mt-6 h-96">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="riskScore"
                stroke="#2563eb"
                strokeWidth={3}
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  const color = payload.riskScore > 70 ? "#ef4444" : payload.riskScore > 40 ? "#f59e0b" : "#10b981";
                  return <circle cx={cx} cy={cy} r={5} fill={color} />;
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </main>
  );
}
