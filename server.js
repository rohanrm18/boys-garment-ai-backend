import express from "express";
import multer from "multer";
import OpenAI from "openai";

const app = express();
const port = process.env.PORT || 3000;
const appToken = process.env.APP_ACCESS_TOKEN;

app.use((req, res, next) => {
  if (req.method === "GET" && req.path === "/") {
    return next();
  }

  if (
    !appToken ||
    req.headers.authorization !== `Bearer ${appToken}`
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      return callback(new Error("Upload a JPG, PNG, or WebP image."));
    }
    callback(null, true);
  }
});

app.get("/", (_req, res) => {
  res.send("Boys Garment AI backend is running.");
});

app.post("/generate", upload.single("image"), async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Server API key is not configured." });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Please upload a garment photo." });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const imageFile = new File(
      [req.file.buffer],
      req.file.originalname || "garment.png",
      { type: req.file.mimetype }
    );

    const result = await openai.images.edit({
      model: "gpt-image-1",
      image: imageFile,
      prompt:
        "Create a photorealistic premium boys fashion catalogue photo using the uploaded garment as the exact clothing reference. Preserve the garment's colors, embroidery, patterns, buttons, trims, fabric appearance, and design as faithfully as possible. Show a child model around 5 years old wearing the outfit naturally, full body, with a simple clean white studio background, soft professional lighting, realistic proportions, and sharp clothing details. Do not add logos or text."
    });

    const imageBase64 = result.data?.[0]?.b64_json;
    if (!imageBase64) {
      return res.status(502).json({ error: "The image service returned no image." });
    }

    res.json({ image: imageBase64, mimeType: "image/png" });
  } catch (error) {
    console.error("Image generation failed:", error.message);
    res.status(500).json({
      error: "Image generation failed. Check server logs and API access."
    });
  }
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "Image must be 10 MB or smaller." });
  }
  res.status(400).json({ error: error.message || "Invalid request." });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Boys Garment AI backend listening on port ${port}`);
});
