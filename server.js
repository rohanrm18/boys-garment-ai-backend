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
  .resize(1024, 1024, {
    fit: "inside",
    withoutEnlargement: true
  })
  .jpeg({ quality: 95 })
  .toBuffer();

    const prompt = `
TASK: GARMENT-PRESERVING FASHION PHOTOGRAPHY

Create exactly ONE photorealistic premium Indian boys'
ethnic-wear e-commerce catalogue photograph.

REFERENCE IMAGE:
The uploaded photograph shows a REAL manufactured garment.
Treat it as the authoritative product reference, not as
inspiration for a new design.

SUBJECT:
One fictional Indian boy, approximately 5 years old.
Natural child proportions, realistic face and skin.
Standing upright, facing directly toward the camera.
Relaxed arms, natural expression.

GARMENT FIDELITY — HIGHEST PRIORITY:
Dress the boy in the EXACT clothing shown in the reference.

Preserve:
- Exact garment colours and colour combinations.
- Exact fabric patterns, including motif shapes,
  orientation, spacing, density and scale.
- Original embroidery and decorative stitching.
- Original collar shape, height and trim.
- Original jacket or waistcoat length and silhouette.
- Original jacket front opening and hem shape.
- Original number, position, colour and style of buttons.
- Original brooch, chain and decorative accessories.
- Original pocket square, if present.
- Original kurta length, sleeves and cuffs.
- Original trousers, including colour, shape and fit.
- Original fabric texture and sheen.

CRITICAL RESTRICTIONS:
Do not redesign, reinterpret or simplify the garment.
Do not replace the original fabric print with a
similar-looking geometric or floral pattern.
Do not invent embroidery, buttons or accessories.
Do not add or remove garment components.
Do not turn a straight jacket hem into a curved hem.
Do not alter the garment's colour palette.
Do not replace the original garment with generic
Indian festive clothing.

If the reference shows a flat-lay garment,
convert only its presentation into a realistically
worn outfit while preserving its visible design.

PHOTOGRAPHY:
Premium professional fashion catalogue photography.
Full-body frontal view, head to toe.
Clean white or very light neutral studio background.
Soft, even professional studio lighting.
Accurate textile colour reproduction.
Sharp garment details and realistic fabric texture.
Natural shadows and realistic proportions.
Garment clearly visible without obstruction.
Leave comfortable space above the head and below the feet.

OUTPUT:
One boy.
One complete outfit.
One photograph.
No collage.
No text.
No watermark.
No extra garments.

PRIORITY ORDER:
1. Original garment identity and details.
2. Accurate colours, patterns and accessories.
3. Realistic garment fit on the child.
4. Photographic realism and professional lighting.
5. Attractive model appearance.
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
