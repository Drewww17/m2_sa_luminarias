import { NextResponse } from "next/server";

const CAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
const MINIMUM_SCORE = 0.5;

function mapCaptchaErrorMessage(codes = []) {
  if (codes.includes("timeout-or-duplicate")) {
    return "CAPTCHA expired. Please try again.";
  }

  if (codes.includes("invalid-input-response")) {
    return "CAPTCHA response is invalid. Reload the page and try again.";
  }

  if (codes.includes("invalid-input-secret") || codes.includes("missing-input-secret")) {
    return "Server CAPTCHA secret is invalid or missing.";
  }

  if (codes.includes("missing-input-response")) {
    return "CAPTCHA token is missing. Please try again.";
  }

  if (codes.includes("bad-request")) {
    return "Invalid CAPTCHA verification request.";
  }

  return "CAPTCHA verification failed. Please complete the challenge and try again.";
}

export async function POST(request) {
  try {
    const { token, action } = await request.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json({ success: false, error: "CAPTCHA token is required." }, { status: 400 });
    }

    // action is optional for v2 invisible keys
    const expectedAction = (typeof action === "string" && action) ? action : null;

    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    if (!secretKey) {
      return NextResponse.json(
        { success: false, error: "CAPTCHA is not configured on the server." },
        { status: 500 }
      );
    }

    const formBody = new URLSearchParams({
      secret: secretKey,
      response: token,
    });

    const verificationResponse = await fetch(CAPTCHA_VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody.toString(),
      cache: "no-store",
    });

    if (!verificationResponse.ok) {
      return NextResponse.json(
        { success: false, error: "Unable to verify CAPTCHA right now. Please try again." },
        { status: 502 }
      );
    }

    const verificationData = await verificationResponse.json();

    // Debug: print full Google response to terminal so we can diagnose failures
    console.log("[CAPTCHA DEBUG] Google siteverify response:", JSON.stringify(verificationData, null, 2));

    if (!verificationData.success) {
      const codes = verificationData["error-codes"] || [];
      const friendlyMsg = mapCaptchaErrorMessage(codes);
      // Include raw codes in the error so the user can report them
      const debugInfo = codes.length > 0 ? ` (codes: ${codes.join(", ")})` : "";
      return NextResponse.json(
        {
          success: false,
          error: `${friendlyMsg}${debugInfo}`,
          codes,
        },
        { status: 400 }
      );
    }

    console.log("[CAPTCHA DEBUG] Verification passed — score:", verificationData.score, "action:", verificationData.action, "hostname:", verificationData.hostname);

    if (typeof verificationData.score === "number" && verificationData.score < MINIMUM_SCORE) {
      return NextResponse.json(
        { success: false, error: `CAPTCHA score too low (${verificationData.score}). Please try again.` },
        { status: 400 }
      );
    }

    if (expectedAction && verificationData.action && verificationData.action !== expectedAction) {
      return NextResponse.json(
        { success: false, error: `CAPTCHA action mismatch: expected "${expectedAction}" but got "${verificationData.action}".` },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, error: "Unexpected CAPTCHA verification error." },
      { status: 500 }
    );
  }
}
