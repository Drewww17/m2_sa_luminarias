import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";
import QRCode from "qrcode";
import { MODEL_VERSION, SYSTEM_VERSION } from "@/constants/systemInfo";

function formatDate(value) {
  if (value?.toDate) {
    return value.toDate().toLocaleString();
  }
  if (value?.seconds) {
    return new Date(value.seconds * 1000).toLocaleString();
  }
  if (typeof value === "string") {
    return new Date(value).toLocaleString();
  }
  return new Date().toLocaleString();
}

export async function generateClinicalPdf({
  scan,
  patient,
  doctorNotes,
  containerId,
  logoSrc = "/logo.png",
}) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;

  try {
    doc.addImage(logoSrc, "PNG", margin, 8, 24, 12);
  } catch {
    doc.setFontSize(11);
    doc.text("DFU-Detect", margin, 14);
  }

  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text("Clinical AI Report", pageWidth / 2, 14, { align: "center" });

  doc.setFontSize(9);
  doc.text(`System: ${scan.systemVersion || SYSTEM_VERSION}`, margin, 24);
  doc.text(`Model: ${scan.modelVersion || MODEL_VERSION}`, margin, 29);

  const resolvedScanId = scan.scanId || scan.id;
  if (!resolvedScanId) {
    throw new Error("Missing scanId for report verification URL.");
  }

  const verificationUrl = `${window.location.origin}/verify/${resolvedScanId}`;
  const qrDataUrl = await QRCode.toDataURL(verificationUrl, {
    margin: 1,
    width: 220,
    color: { dark: "#1e3a8a", light: "#ffffff" },
  });
  doc.addImage(qrDataUrl, "PNG", pageWidth - margin - 24, 8, 24, 24);

  autoTable(doc, {
    startY: 36,
    theme: "grid",
    styles: { fontSize: 9, textColor: [15, 23, 42] },
    headStyles: { fillColor: [37, 99, 235] },
    head: [["Field", "Value"]],
    body: [
      ["Patient Name", patient?.fullName || "N/A"],
      ["Patient ID", patient?.systemId || patient?.uid || "N/A"],
      ["Scan ID", resolvedScanId],
      ["Diagnosis", scan.diagnosis || scan.result || "N/A"],
      ["Confidence", `${Number(scan.confidence || 0).toFixed(2)}%`],
      ["Risk Classification", scan.riskLevel || scan.severity || "N/A"],
      ["Reliability Score", `${Number(scan.reliabilityScore || 0).toFixed(2)}%`],
      ["Doctor Notes", doctorNotes || scan.doctorNotes || "N/A"],
      ["Reviewed By", scan.reviewedBy || scan.verifiedBy || "N/A"],
      ["Timestamp", formatDate(scan.createdAt)],
      ["Verification", verificationUrl],
    ],
  });

  const captureElement = document.getElementById(containerId);
  if (captureElement) {
    try {
      const canvas = await html2canvas(captureElement, {
        scale: 1.5,
        backgroundColor: "#ffffff",
      });
      const screenshot = canvas.toDataURL("image/png");
      const screenshotWidth = pageWidth - margin * 2;
      const screenshotHeight = (canvas.height * screenshotWidth) / canvas.width;
      const yPosition = doc.lastAutoTable.finalY + 6;

      if (yPosition + screenshotHeight > 275) {
        doc.addPage();
        doc.addImage(screenshot, "PNG", margin, 18, screenshotWidth, screenshotHeight);
      } else {
        doc.addImage(screenshot, "PNG", margin, yPosition, screenshotWidth, screenshotHeight);
      }
    } catch (error) {
      console.warn("Skipping report screenshot capture:", error);
    }
  }

  const disclaimerY = doc.internal.pageSize.getHeight() - 24;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    "Medical Disclaimer: This AI-assisted output is for clinical decision support only and does not replace physician diagnosis.",
    margin,
    disclaimerY,
    { maxWidth: pageWidth - margin * 2 }
  );
  doc.text("Doctor Signature: __________________________", margin, disclaimerY + 8);

  doc.save(`DFU-Clinical-Report-${resolvedScanId || Date.now()}.pdf`);
}
