function stableSerialize(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }

  const keys = Object.keys(value).sort();
  const content = keys
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
    .join(",");
  return `{${content}}`;
}

function toHex(bytes) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function generateHash(data) {
  const payload = stableSerialize(data);

  if (typeof window !== "undefined" && window.crypto?.subtle) {
    const encoded = new TextEncoder().encode(payload);
    const digest = await window.crypto.subtle.digest("SHA-256", encoded);
    return toHex(new Uint8Array(digest));
  }

  const { createHash } = await import("crypto");
  return createHash("sha256").update(payload).digest("hex");
}
