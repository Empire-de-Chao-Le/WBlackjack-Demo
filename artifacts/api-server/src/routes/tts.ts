import { Router, type IRouter } from "express";

const router: IRouter = Router();

const DASHSCOPE_ENDPOINT =
  "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";

/**
 * POST /tts/minnan
 * Body: { text: string }
 * Calls Alibaba Cloud DashScope Qwen3-TTS-instruct-flash with a Minnan (Taiwanese Hokkien)
 * instruction, fetches the resulting WAV, and streams it back as audio/wav.
 * The API key never leaves the server.
 */
router.post("/tts/minnan", async (req, res): Promise<void> => {
  const { text } = req.body ?? {};
  if (typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "text (non-empty string) is required" });
    return;
  }

  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "DASHSCOPE_API_KEY is not configured" });
    return;
  }

  try {
    const ttsRes = await fetch(DASHSCOPE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen3-tts-instruct-flash",
        input: {
          text: text.trim(),
          voice: "Cherry",
          language_type: "Chinese",
          instruction:
            "請用台語（臺灣閩南語）朗讀這段文字。聲調和發音請完全按照台語規則，不要用普通話發音。",
        },
      }),
    });

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      res
        .status(ttsRes.status)
        .json({ error: `DashScope TTS error ${ttsRes.status}: ${errText}` });
      return;
    }

    const json = (await ttsRes.json()) as {
      output?: { audio?: { url?: string; data?: string } };
    };

    const audioUrl = json?.output?.audio?.url;
    const audioData = json?.output?.audio?.data;

    if (audioData && audioData.length > 0) {
      // Base64-encoded PCM/WAV data returned directly
      const buf = Buffer.from(audioData, "base64");
      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Cache-Control", "no-cache");
      res.end(buf);
      return;
    }

    if (audioUrl) {
      // Fetch the audio file from the temporary URL and proxy it to the client
      const audioRes = await fetch(audioUrl);
      if (!audioRes.ok) {
        res
          .status(502)
          .json({ error: `Failed to fetch audio from DashScope URL: ${audioRes.status}` });
        return;
      }
      const buf = Buffer.from(await audioRes.arrayBuffer());
      const ct = audioRes.headers.get("content-type") ?? "audio/wav";
      res.setHeader("Content-Type", ct);
      res.setHeader("Cache-Control", "no-cache");
      res.end(buf);
      return;
    }

    res.status(502).json({ error: "DashScope returned no audio data or URL" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
