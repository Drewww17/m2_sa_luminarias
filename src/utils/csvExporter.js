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
  const patientIdentifier = patient.systemId || patient.uid || "N/A";

  const exportRows = filtered.map((scan) => ({
    "Scan ID": scan.scanId || scan.id || "N/A",
    Date: formatDate(scan),
    "Patient ID": patientIdentifier,
    Diagnosis: scan.diagnosis || scan.finalLabel || scan.result || "N/A",
    Confidence: `${Number(scan.confidence || 0).toFixed(2)}%`,
    "Risk Level": scan.riskLevel || scan.severity || severityToPriority(scan),
    "Doctor Verified": scan.verified || scan.reviewStatus === "verified" ? "Yes" : "No",
    Notes: scan.doctorNotes || "",
  }));

  const csvContent = Papa.unparse(exportRows, {
    columns: [
      "Scan ID",
      "Date",
      "Patient ID",
      "Diagnosis",
      "Confidence",
      "Risk Level",
      "Doctor Verified",
      "Notes",
    ],
  });

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const safePatientName = (patient.fullName || `${patient.firstName || ""}-${patient.lastName || ""}`)
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase() || "patient";
  link.download = `dfu-detect-${safePatientName}-scan-history-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
