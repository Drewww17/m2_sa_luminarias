import Papa from "papaparse";
import { MODEL_VERSION, SYSTEM_VERSION } from "@/constants/systemInfo";

function getDateFromScan(scan) {
  if (scan.createdAt?.toDate) {
    return scan.createdAt.toDate();
  }

  if (scan.createdAt?.seconds) {
    return new Date(scan.createdAt.seconds * 1000);
  }

  if (scan.dateString) {
    return new Date(scan.dateString);
  }

  return new Date();
}

function formatDate(scan) {
  return getDateFromScan(scan).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function severityToPriority(scan) {
  const severity = scan.riskLevel || scan.severity || "Low";
  if (severity === "High") {
    return "High";
  }
  if (severity === "Moderate") {
    return "Medium";
  }
  return "Low";
}

function applyFilter(history, mode) {
  const now = new Date();
  const last30 = new Date(now);
  last30.setDate(now.getDate() - 30);

  if (mode === "ulcer") {
    return history.filter((scan) => (scan.finalLabel || scan.result) === "Ulcer" || scan.is_ulcer);
  }

  if (mode === "last30") {
    return history.filter((scan) => getDateFromScan(scan) >= last30);
  }

  return history;
}

export function exportPatientCsv({ patient, history, filterMode = "all" }) {
  const filtered = applyFilter(history, filterMode);
  const totalScans = filtered.length;
  const ulcerCount = filtered.filter(
    (scan) => (scan.finalLabel || scan.result) === "Ulcer" || scan.is_ulcer
  ).length;
  const ulcerRate = totalScans ? `${((ulcerCount / totalScans) * 100).toFixed(1)}%` : "0%";

  const riskClassification =
    ulcerCount > 0 && totalScans > 0
      ? ulcerCount / totalScans > 0.5
        ? "High"
        : "Moderate"
      : "Low";

  const summaryRows = [
    ["Section", "Patient Summary"],
    ["Name", patient.fullName || `${patient.firstName || ""} ${patient.lastName || ""}`.trim()],
    ["ID", patient.systemId || patient.uid || "N/A"],
    ["Total scans", totalScans],
    ["Ulcer rate", ulcerRate],
    ["Risk classification", riskClassification],
    ["Generated date", new Date().toLocaleString()],
    ["System version", SYSTEM_VERSION],
    ["Model version", MODEL_VERSION],
  ];

  const historyRows = filtered.map((scan) => ({
    Date: formatDate(scan),
    Diagnosis: scan.diagnosis || scan.result || "N/A",
    Severity: scan.riskLevel || scan.severity || "N/A",
    Confidence: `${Number(scan.confidence || 0).toFixed(2)}%`,
    Priority: severityToPriority(scan),
    Verified: scan.verified ? "Yes" : scan.reviewStatus === "verified" ? "Yes" : "No",
    "Reviewed By": scan.reviewedBy || scan.verifiedBy || "N/A",
  }));

  const summaryCsv = Papa.unparse(summaryRows);
  const historyCsv = Papa.unparse(historyRows);
  const csvContent = `${summaryCsv}\n\nSection,Scan History\n${historyCsv}`;

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `dfu-patient-report-${filterMode}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
