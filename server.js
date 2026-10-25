import express from "express";
import multer from "multer";
import sharp from "sharp";

const app = express();
const port = process.env.PORT || 3000;
const appToken = process.env.APP_ACCESS_TOKEN;

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;

const model = "@cf/black-forest-labs/flux-2-klein-4b";

app.use((req, res, next) => {
  if (req.method === "GET" && req.path === "/") {
    return next();
  }

  if (!appToken ||
      req.headers.authorization !== `Bearer ${appToken}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!["image/jpeg", "image/png", "image/webp"]
      .includes(file.mimetype)) {
      return cb(new Error("Unsupported image format."));
    }
    cb(null, true);
  }
});

app.get("/", (_req, res) => {
  res.send("Boys Garment AI backend is running.");
});

app.post("/generate", upload.single("image"), async (req, res) => {
  try {
    if (!accountId || !apiToken) {
      return res.status(500).json({
        error: "Cloudflare credentials are missing."
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: "Please upload a garment photo."
      });
    }

    const referenceImage = await sharp(req.file.buffer)
      .rotate()
      .resize(480, 480, {
        fit: "inside",
        withoutEnlargement: true
      })
      .jpeg({ quality: 85 })
      .toBuffer();

    const prompt = `
Create ONE photorealistic premium boys ethnic-wear
e-commerce catalogue photograph.

Use the attached image as the clothing reference.
Dress a fictional Indian boy approximately 5 years old
in the exact garment shown.

Preserve the garment's original colours, fabric,
embroidery, patterns, collar, buttons, trims,
sleeves and silhouette as faithfully as possible.

Show the boy standing naturally, directly facing
the camera, full body visible including footwear.
Clean white studio background, professional soft
lighting, realistic skin and fabric texture.

One boy, one photograph, no collage, no text,
no watermark, no additional garments.
`;

    const form = new FormData();
    form.append("prompt", prompt);
    form.append(
      "input_image_0",
      new Blob([referenceImage], { type: "image/jpeg" }),
      "garment.jpg"
    );
    form.append("width", "1024");
    form.append("height", "1024");

    const endpoint =
      `https://api.cloudflare.com/client/v4/accounts/` +
      `${accountId}/ai/run/${model}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`
      },
      body: form,
      signal: AbortSignal.timeout(150000)
    });

    const result = await response.json();

    if (!response.ok || result.success === false) {
      console.error("Cloudflare error:", response.status,
        JSON.stringify(result.errors || result));
      return res.status(502).json({
        error: `Cloudflare generation failed (${response.status}).`
      });
    }

    const imageBase64 = result.result?.image;

    if (!imageBase64) {
      console.error("Unexpected Cloudflare response:",
        JSON.stringify(result).slice(0, 500));
      return res.status(502).json({
        error: "Cloudflare returned no image."
      });
    }

    res.json({
      image: imageBase64,
      mimeType: "image/png"
    });

  } catch (error) {
    console.error("Generation error:", error.message);
    res.status(500).json({
      error: "Generation failed. Check Render logs."
    });
  }
});

app.use((error, _req, res, _next) => {
  res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400)
    .json({ error: error.message || "Invalid upload." });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Backend listening on port ${port}`);
});
