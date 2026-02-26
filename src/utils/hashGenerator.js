import CryptoJS from "crypto-js";

export function generateScanHash(scan) {
  // Normalize all values with defaults to ensure consistency
  const confidence = Number(scan.confidence) || 0;
  const diagnosis = scan.diagnosis || "";
  const modelVersion = scan.modelVersion || "";
  const riskLevel = scan.riskLevel || "Low";
  const systemVersion = scan.systemVersion || "";

  // Create string with explicit ordering (alphabetical) for consistent hashing
  const hashInput = JSON.stringify({
    confidence,
    diagnosis,
    modelVersion,
    riskLevel,
    systemVersion,
  });
  
  return CryptoJS.SHA256(hashInput).toString();
}
