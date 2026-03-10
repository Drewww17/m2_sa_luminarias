import { NextResponse } from "next/server";

const modelConfigs = [
  { id: "foot-ulcers-szvdf/3", weight: 0.906 },
  { id: "foot-ulcers-szvdf/2", weight: 0.914 },
  { id: "foot-ulcers-szvdf/1", weight: 0.927 }
];

export async function POST(request) {
  try {
    let base64Image;
    let selectedModels = [];
    
    const contentType = request.headers.get("content-type") || "";
    
    if (contentType.includes("application/json")) {
      // Webcam: base64 image in JSON body
      const body = await request.json();
      if (!body.image) {
        return NextResponse.json({ error: "No image provided" }, { status: 400 });
      }
      base64Image = body.image.replace(/^data:image\/\w+;base64,/, "");
      selectedModels = body.models || [];
    } else {
      // File upload: formData
      const formData = await request.formData();
      const file = formData.get("image");

      if (!file) {
        return NextResponse.json({ error: "No image provided" }, { status: 400 });
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      base64Image = buffer.toString("base64");
      
      const modelsParam = formData.get("models");
      selectedModels = modelsParam ? JSON.parse(modelsParam) : [];
    }

    // Safety guard: Check if models are selected
    if (!selectedModels || selectedModels.length === 0) {
      return NextResponse.json({
        status: "error",
        error: "No models selected"
      }, { status: 400 });
    }

    const activeModelConfigs = modelConfigs.filter(model => 
      selectedModels.includes(model.id)
    );

    // Safety guard: Ensure we have valid model configs
    if (activeModelConfigs.length === 0) {
      return NextResponse.json({
        status: "error",  
        error: "Invalid model selection"
      }, { status: 400 });
    }

    const ROBOFLOW_API_KEY = process.env.ROBOFLOW_API_KEY;

    if (!ROBOFLOW_API_KEY) {
      return NextResponse.json(
        { status: "error", error: "Analysis service is not configured. Contact the administrator." },
        { status: 503 }
      );
    }

    // Run Multi-Model Inference
    const warnings = [];
    const settledResults = await Promise.allSettled(
      activeModelConfigs.map(async (model) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        try {
          const res = await fetch(
            `https://detect.roboflow.com/${model.id}?api_key=${ROBOFLOW_API_KEY}`,
            {
              method: "POST",
              body: base64Image,
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              signal: controller.signal,
            }
          );
          clearTimeout(timeout);

          if (!res.ok) {
            const errText = await res.text().catch(() => "Unknown error");
            throw new Error(`Model ${model.id} returned ${res.status}: ${errText}`);
          }

          const data = await res.json();

          const maxConfidence = data.predictions?.length
            ? Math.max(...data.predictions.map(p => p.confidence))
            : 0;

          return {
            model: model.id,
            weight: model.weight,
            prediction: data.predictions?.length ? "Ulcer" : "Healthy",
            confidence: Number((maxConfidence * 100).toFixed(2)),
            predictions: (data.predictions || []).map((prediction) => ({
              x: prediction.x,
              y: prediction.y,
              width: prediction.width,
              height: prediction.height,
              class: prediction.class,
              confidence: Number(((prediction.confidence || 0) * 100).toFixed(2)),
            })),
            imageMeta: data.image
          };
        } catch (modelError) {
          clearTimeout(timeout);
          throw modelError;
        }
      })
    );

    const results = [];
    for (const settled of settledResults) {
      if (settled.status === "fulfilled") {
        results.push(settled.value);
      } else {
        const reason = settled.reason?.message || "Unknown model error";
        console.error("Model inference failed:", reason);
        warnings.push(reason);
      }
    }

    if (results.length === 0) {
      return NextResponse.json(
        { status: "error", error: "All models failed to process the image. Please try again or use a different image." },
        { status: 502 }
      );
    }

    const topPredictionModel = [...results].sort((a, b) => b.confidence - a.confidence)[0] || null;

    // Calculate Agreement %
    const ulcerVotes = results.filter(r => r.prediction === "Ulcer").length;
    const agreementPercentage = (ulcerVotes / results.length) * 100;

    // Standard Deviation of Confidence
    const mean = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
    const variance = results.reduce((sum, r) => sum + Math.pow(r.confidence - mean, 2), 0) / results.length;
    const stdDeviation = Math.sqrt(variance);

    // Weighted Voting Based on mAP
    let weightedScore = 0;
    results.forEach(r => {
      if (r.prediction === "Ulcer") {
        weightedScore += r.weight * r.confidence;
      }
    });

    const weightedThreshold = results.reduce((sum, r) => sum + r.weight, 0) * 50;
    const finalPrediction = weightedScore >= weightedThreshold ? "Ulcer" : "Healthy";

    // Reliability Score
    const reliabilityScore =
      ((agreementPercentage / 100) *
      (1 - stdDeviation / 100) *
      (mean / 100)) * 100;

    // Severity and recommendation based on model consensus
    let severity = "None";
    let riskScore = 0;
    let recommendation = "";

    if (mean > 85) {
      severity = "High";
      riskScore = 90;
      recommendation = "Immediate medical consultation recommended.";
    } 
    else if (mean > 60) {
      severity = "Moderate";
      riskScore = 65;
      recommendation = "Monitor closely and consult healthcare provider.";
    } 
    else if (mean > 40) {
      severity = "Low";
      riskScore = 40;
      recommendation = "Re-scan within 3 days.";
    }

    return NextResponse.json({
      status: "success",
      models: results,
      consensus: finalPrediction,
      is_ulcer: finalPrediction === "Ulcer",
      diagnosis: finalPrediction === "Ulcer" ? "Diabetic Foot Ulcer" : "Healthy",
      confidence: mean.toFixed(2),
      agreementPercentage: agreementPercentage.toFixed(2),
      averageConfidence: mean.toFixed(2),
      confidenceStdDev: stdDeviation.toFixed(2),
      reliabilityScore: reliabilityScore.toFixed(2),
      severity,
      riskScore,
      recommendation,
      predictions: topPredictionModel?.predictions || [],
      imageMeta: topPredictionModel?.imageMeta || null,
      warnings,
    });

  } catch (error) {
    console.error("Server error:", error);

    let message = "An unexpected error occurred while processing your scan.";
    if (error.name === "AbortError") {
      message = "Analysis timed out. The image may be too large or the server is busy. Please try again.";
    } else if (error.message?.includes("JSON")) {
      message = "Invalid image data received. Please upload a valid image file.";
    }

    return NextResponse.json(
      { status: "error", error: message },
      { status: 500 }
    );
  }
}
