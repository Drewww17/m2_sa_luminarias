export async function verifyCaptchaToken(token, action) {
  const response = await fetch("/api/captcha/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token, action }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.success) {
    return {
      ok: false,
      error: payload?.error || "CAPTCHA verification failed.",
    };
  }

  return { ok: true, error: "" };
}
