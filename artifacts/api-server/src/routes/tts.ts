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
          // Do NOT set language_type: "Chinese" — that pins the model to Mandarin
          // and overrides the instruction. Let the model infer from the instruction.
          instruction:
            "Speak this text in Taiwanese Hokkien (台語 / 閩南語 / Southern Min). " +
            "This is NOT Mandarin. Use Min Nan phonology: " +
            "你=lí, 好=hó, 我=góa, 是=sī, 有=ū, 無=bô, 食=tsia̍h, 飲=lim, 愛=ài, 來=lâi, 去=khì, " +
            "人=lâng, 甲=kah, 佮=kah, 嘛=mā, 啊=ah. " +
            "Tone the syllables with Min Nan tones (not Mandarin tones). " +
            "請完全用台語（閩南語）的發音朗讀，不要用普通話。",
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
