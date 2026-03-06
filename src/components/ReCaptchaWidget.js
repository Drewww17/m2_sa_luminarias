"use client";

import { useEffect, useRef, useCallback, useState } from "react";

const RECAPTCHA_SCRIPT_ID = "google-recaptcha-v2-script";
let scriptPromise;

function loadRecaptchaScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("CAPTCHA is only available in the browser."));
  }

  if (window.grecaptcha && window.grecaptcha.render) {
    return Promise.resolve(window.grecaptcha);
  }

  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const existingScript = document.getElementById(RECAPTCHA_SCRIPT_ID);
      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(window.grecaptcha));
        existingScript.addEventListener("error", () => reject(new Error("Failed to load CAPTCHA script.")));
        return;
      }

      const callbackName = "__onRecaptchaLoaded__";
      window[callbackName] = () => {
        resolve(window.grecaptcha);
        delete window[callbackName];
      };

      const script = document.createElement("script");
      script.id = RECAPTCHA_SCRIPT_ID;
      script.src = `https://www.google.com/recaptcha/api.js?onload=${callbackName}&render=explicit`;
      script.async = true;
      script.defer = true;
      script.onerror = () => {
        reject(new Error("Failed to load CAPTCHA script."));
        delete window[callbackName];
      };
      document.head.appendChild(script);
    });
  }

  return scriptPromise;
}

export default function ReCaptchaWidget({ onTokenChange, resetKey = 0 }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const [error, setError] = useState("");
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

  const stableOnTokenChange = useCallback((token) => {
    onTokenChange(token);
  }, [onTokenChange]);

  useEffect(() => {
    if (!siteKey) {
      stableOnTokenChange("");
      return undefined;
    }

    let isUnmounted = false;

    const renderWidget = async () => {
      try {
        const recaptcha = await loadRecaptchaScript();

        if (isUnmounted || !containerRef.current) return;

        // Clear any previous widget
        containerRef.current.innerHTML = "";
        widgetIdRef.current = null;

        widgetIdRef.current = recaptcha.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => {
            if (!isUnmounted) {
              stableOnTokenChange(token);
            }
          },
          "expired-callback": () => {
            if (!isUnmounted) {
              stableOnTokenChange("");
            }
          },
          "error-callback": () => {
            if (!isUnmounted) {
              stableOnTokenChange("");
              setError("CAPTCHA key is invalid. Site owner: please generate new reCAPTCHA v2 Checkbox keys in Google Console and update .env.local");
            }
          },
        });
      } catch (scriptError) {
        if (!isUnmounted) {
          setError(scriptError?.message || "Failed to load CAPTCHA. Try again.");
          stableOnTokenChange("");
        }
      }
    };

    setError("");
    stableOnTokenChange("");
    renderWidget();

    return () => {
      isUnmounted = true;
    };
  }, [resetKey, siteKey, stableOnTokenChange]);

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="flex justify-center" />
      {!siteKey ? <p className="text-sm text-red-500">CAPTCHA is not configured. Please contact support.</p> : null}
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
    </div>
  );
}
