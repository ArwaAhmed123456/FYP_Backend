/**
 * OCR Proxy Controller
 * Forwards OCR requests to the Hugging Face Space with auth token and retry logic.
 * Retries are needed because free HF Spaces sleep after inactivity and need a
 * warm-up request before they can serve responses.
 */
const axios = require('axios');
const FormData = require('form-data');

const OCR_SERVICE_URL =
  process.env.OCR_SERVICE_URL || 'https://Zarm33na-bilingual-ocr-api.hf.space';
const HF_TOKEN = process.env.HF_TOKEN;

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 4000; // 4s first retry — sleeping spaces need ~5-10s to wake

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POST /api/ocr
 * Body (multipart/form-data): image (file), language ("english"|"urdu"), sourceFileName
 */
const processOcr = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No image file provided' });
  }

  const language = req.body.language || 'english';
  const sourceFileName = req.body.sourceFileName || req.file.originalname || 'document.jpg';
  const ocrUrl = `${OCR_SERVICE_URL}/ocr`;

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const form = new FormData();
      form.append('image', req.file.buffer, {
        filename: sourceFileName,
        contentType: req.file.mimetype,
      });
      form.append('language', language);
      form.append('sourceFileName', sourceFileName);

      const headers = {
        ...form.getHeaders(),
        Accept: 'application/json',
      };
      if (HF_TOKEN) {
        headers['Authorization'] = `Bearer ${HF_TOKEN}`;
      }

      console.log(`[OCR] Attempt ${attempt}/${MAX_RETRIES} → ${ocrUrl}`);
      const response = await axios.post(ocrUrl, form, {
        headers,
        timeout: 45000, // 45s — sleeping spaces can take time to cold-start
        maxContentLength: 10 * 1024 * 1024,
      });

      console.log(`[OCR] Success on attempt ${attempt}`);
      return res.json(response.data);
    } catch (err) {
      lastError = err;
      const status = err.response?.status;
      console.error(
        `[OCR] Attempt ${attempt}/${MAX_RETRIES} failed: ${err.message} (HTTP ${status ?? 'N/A'})`
      );

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * attempt;
        console.log(`[OCR] Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  const status = lastError?.response?.status;
  console.error('[OCR] All attempts exhausted. Last error:', lastError?.message);

  return res.status(503).json({
    success: false,
    message: 'OCR service is currently unavailable. Please try again in a moment.',
    detail: status ? `Upstream returned HTTP ${status}` : lastError?.message,
  });
};

/**
 * GET /api/ocr/health
 * Checks if the upstream OCR service is reachable.
 */
const ocrHealth = async (req, res) => {
  try {
    const headers = {};
    if (HF_TOKEN) headers['Authorization'] = `Bearer ${HF_TOKEN}`;

    const response = await axios.get(`${OCR_SERVICE_URL}/health`, {
      headers,
      timeout: 10000,
    });
    return res.json({ ok: true, upstream: response.data });
  } catch (err) {
    const status = err.response?.status;
    console.error('[OCR] Health check failed:', err.message);
    return res.status(503).json({
      ok: false,
      message: err.message,
      upstreamStatus: status ?? null,
    });
  }
};

module.exports = { processOcr, ocrHealth };
