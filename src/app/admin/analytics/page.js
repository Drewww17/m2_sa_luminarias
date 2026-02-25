"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { db } from "@/lib/firebase";
import { SYSTEM_VERSION, MODEL_VERSION } from "@/constants/systemInfo";
import { useAdminGuard } from "@/hooks/useAdminGuard";

function getMonthKey(scan) {
  const date = scan.createdAt?.toDate ? scan.createdAt.toDate() : new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export default function AdminAnalyticsPage() {
  const { loading, adminProfile } = useAdminGuard();
  const [scans, setScans] = useState([]);

  useEffect(() => {
    if (loading || !adminProfile) {
      return undefined;
    }

    const unsubscribe = onSnapshot(collection(db, "scans"), (snapshot) => {
      setScans(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
    });

    return () => unsubscribe();
  }, [loading, adminProfile]);

  const metrics = useMemo(() => {
    const totalScans = scans.length;
    const ulcerScans = scans.filter((scan) => scan.is_ulcer || (scan.finalLabel || scan.result) === "Ulcer").length;
    const highRisk = scans.filter((scan) => (scan.riskLevel || scan.severity) === "High").length;
    const verifiedScans = scans.filter((scan) => scan.verified || scan.reviewStatus === "verified").length;
    const pendingReviews = scans.filter((scan) => (scan.reviewStatus || "pending") === "pending").length;
    const falsePositive = scans.filter((scan) => scan.reviewStatus === "false_positive").length;
    const doctorAgreement = scans.filter((scan) => scan.reviewStatus === "verified").length;
    const averageConfidence =
      totalScans > 0
        ? scans.reduce((sum, scan) => sum + Number(scan.confidence || 0), 0) / totalScans
        : 0;

    return {
      totalScans,
      ulcerRate: totalScans ? (ulcerScans / totalScans) * 100 : 0,
      highRisk,
      verifiedScans,
      pendingReviews,
      falsePositiveRate: totalScans ? (falsePositive / totalScans) * 100 : 0,
      doctorAgreementRate: totalScans ? (doctorAgreement / totalScans) * 100 : 0,
      averageConfidence,
      ulcerScans,
      healthyScans: totalScans - ulcerScans,
    };
  }, [scans]);

  const monthlyTrend = useMemo(() => {
    const map = {};
    scans.forEach((scan) => {
      const key = getMonthKey(scan);
      if (!map[key]) {
        map[key] = { month: key, count: 0 };
      }
      map[key].count += 1;
    });
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
  }, [scans]);

  const pieData = [
    { name: "Ulcer", value: metrics.ulcerScans },
    { name: "Healthy", value: metrics.healthyScans },
  ];

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <section className="w-full max-w-md bg-white rounded-2xl shadow-md p-8 text-center">
          <p className="text-slate-700">Loading analytics...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <section className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white rounded-2xl shadow-md p-6">
          <h1 className="text-2xl font-bold text-slate-900">Admin Analytics Dashboard</h1>
          <p className="text-slate-600 mt-1">System: {SYSTEM_VERSION} | Model: {MODEL_VERSION}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl shadow-md p-5"><p className="text-slate-500 text-sm">Total Scans</p><p className="text-2xl font-bold text-slate-900">{metrics.totalScans}</p></div>
          <div className="bg-white rounded-2xl shadow-md p-5"><p className="text-slate-500 text-sm">High Risk Cases</p><p className="text-2xl font-bold text-red-500">{metrics.highRisk}</p></div>
          <div className="bg-white rounded-2xl shadow-md p-5"><p className="text-slate-500 text-sm">Verified Scans</p><p className="text-2xl font-bold text-emerald-500">{metrics.verifiedScans}</p></div>
          <div className="bg-white rounded-2xl shadow-md p-5"><p className="text-slate-500 text-sm">Pending Reviews</p><p className="text-2xl font-bold text-slate-900">{metrics.pendingReviews}</p></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl shadow-md p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Monthly Scan Count</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-md p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Ulcer vs Healthy</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                    <Cell fill="#ef4444" />
                    <Cell fill="#10b981" />
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-md p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <p className="text-slate-700"><span className="font-bold text-slate-900">Ulcer detection rate:</span> {metrics.ulcerRate.toFixed(1)}%</p>
          <p className="text-slate-700"><span className="font-bold text-slate-900">Doctor agreement rate:</span> {metrics.doctorAgreementRate.toFixed(1)}%</p>
          <p className="text-slate-700"><span className="font-bold text-slate-900">False positive rate:</span> {metrics.falsePositiveRate.toFixed(1)}%</p>
          <p className="text-slate-700"><span className="font-bold text-slate-900">Average confidence:</span> {metrics.averageConfidence.toFixed(2)}%</p>
        </div>
      </section>
    </main>
  );
}
