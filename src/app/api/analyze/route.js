import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("image");

    if (!file) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // Convert file to base64 properly
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Image = buffer.toString("base64");

    const ROBOFLOW_API_KEY = process.env.ROBOFLOW_API_KEY;
    const ROBOFLOW_MODEL = "foot-ulcers-szvdf/3";

    const response = await fetch(
      `https://detect.roboflow.com/${ROBOFLOW_MODEL}?api_key=${ROBOFLOW_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: base64Image,
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("Roboflow error:", result);
      return NextResponse.json(
        { error: "Roboflow inference failed", details: result },
        { status: 500 }
      );
    }

    // --- Priority Logic ---
    const predictions = result.predictions || [];
    const hasUlcer = predictions.some(p => p.class.toLowerCase().includes("ulcer"));

    return NextResponse.json({
      status: "success",
      diagnosis: hasUlcer ? "Diabetic Foot Ulcer" : "Healthy",
      confidence: predictions[0]?.confidence || 0,
      is_ulcer: hasUlcer
    });

  } catch (error) {
    console.error("Server error:", error);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
