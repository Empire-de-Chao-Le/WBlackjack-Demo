import { Router, type IRouter } from "express";

const router: IRouter = Router();

/**
 * 台灣媠聲 (ÌTHUÂN / Taiwan TTS) — the Taiwan Ministry of Education Taiwanese Hokkien
 * (台語 / 閩南語 / Southern Min) speech-synthesis service. Unlike Qwen3-TTS or Azure
 * (which only expose Mandarin / Taiwanese-Mandarin voices and CANNOT produce real
 * Hokkien), this service synthesises authentic Taiwanese Hokkien.
 *
 * IMPORTANT — two-step pipeline (this is how the official 媠聲 web app works):
 *   1. Tokenize: POST Han text to the 鬥句 tokenizer (`/tau`). It returns the
 *      word-segmented Tâi-lô (KIP) romanization, e.g. 你叫啥咪名 → "lí kiò siánn mi miâ".
 *   2. Synthesize: POST that Tâi-lô romanization to `bangtsam`, which returns MP3.
 *
 * The `bangtsam` endpoint expects *Tâi-lô romanization*, NOT raw multi-character Han.
 * Feeding it raw Han makes it mis-segment and emit only a single truncated syllable
 * (~0.6s), which sounds like one stray character. Tokenizing first fixes this.
 */
const ITHUAN_TOKENIZE_ENDPOINT = "https://hokbu.ithuan.tw/tau";
const ITHUAN_ENDPOINT = "https://hapsing.ithuan.tw/bangtsam";

// The upstream service degrades / returns HTTP 500 on long inputs. Flashcards are
// short words/phrases, so cap input length and fail fast with a clear message.
const MAX_TEXT_LENGTH = 80;

// Abort the upstream request if it hangs, so we never block a worker indefinitely.
const UPSTREAM_TIMEOUT_MS = 12_000;

/**
 * Convert Han (漢字) text to word-segmented Tâi-lô (KIP) romanization using the
 * 鬥句 tokenizer. Returns the KIP string, or null if tokenization fails / is empty.
 * The synthesizer needs this — raw multi-character Han mis-segments to one syllable.
 */
async function tokenizeToTailo(text: string, signal: AbortSignal): Promise<string | null> {
  const form = new URLSearchParams();
  form.append("taibun", text);
  const res = await fetch(ITHUAN_TOKENIZE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    signal,
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { KIP?: unknown };
  const kip = typeof data?.KIP === "string" ? data.KIP.trim() : "";
  return kip.length > 0 ? kip : null;
}

function looksLikeMp3(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  // ID3 tag
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true;
  // MPEG frame sync (0xFFE...)
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return true;
  return false;
}

/**
 * POST /tts/minnan
 * Body: { text: string }
 * Synthesises Taiwanese Hokkien audio for `text` and streams it back as audio/mpeg.
 */
router.post("/tts/minnan", async (req, res): Promise<void> => {
  const { text } = req.body ?? {};
  if (typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "text (non-empty string) is required" });
    return;
  }

  const trimmed = text.trim();
  if (trimmed.length > MAX_TEXT_LENGTH) {
    res.status(400).json({
      error: `text too long for Taiwanese TTS (max ${MAX_TEXT_LENGTH} chars); use shorter phrases`,
    });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    // Step 1: tokenize Han → Tâi-lô. If it fails, fall back to the raw text
    // (single Han characters still synthesize acceptably without tokenizing).
    let synthInput = trimmed;
    try {
      const kip = await tokenizeToTailo(trimmed, controller.signal);
      if (kip) synthInput = kip;
    } catch {
      // Tokenizer unreachable — proceed with raw text rather than failing outright.
    }

    // Step 2: synthesize the Tâi-lô romanization.
    const form = new URLSearchParams();
    form.append("taibun", synthInput);

    const ttsRes = await fetch(ITHUAN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: controller.signal,
    });

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      res
        .status(502)
        .json({ error: `Taiwanese TTS error ${ttsRes.status}: ${errText.slice(0, 200)}` });
      return;
    }

    const buf = Buffer.from(await ttsRes.arrayBuffer());

    // Guard against tiny/empty or non-audio responses on anomalous 200s.
    if (buf.length < 256 || !looksLikeMp3(buf)) {
      res.status(502).json({ error: "Taiwanese TTS returned invalid audio" });
      return;
    }

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-cache");
    res.end(buf);
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      res.status(504).json({ error: "Taiwanese TTS timed out" });
      return;
    }
    res.status(500).json({ error: String(e) });
  } finally {
    clearTimeout(timer);
  }
});

export default router;
