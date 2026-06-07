import { Router, type IRouter } from "express";

const router: IRouter = Router();

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * POST /tts/minnan
 * Body: { text: string }
 * Proxies to Azure Cognitive Services Neural TTS (nan-TW locale, A-saiNeural voice)
 * and streams back the MP3 audio. The API key never leaves the server.
 */
router.post("/tts/minnan", async (req, res): Promise<void> => {
  const { text } = req.body ?? {};
  if (typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "text (non-empty string) is required" });
    return;
  }

  const key = process.env.AZURE_TTS_KEY;
  const region = process.env.AZURE_TTS_REGION;
  if (!key || !region) {
    res.status(500).json({ error: "Azure TTS not configured (missing AZURE_TTS_KEY / AZURE_TTS_REGION)" });
    return;
  }

  const ssml = [
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='nan-TW'>`,
    `<voice name='nan-TW-A-saiNeural'>${escapeXml(text.trim())}</voice>`,
    `</speak>`,
  ].join("");

  try {
    const azureRes = await fetch(
      `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
        },
        body: ssml,
      }
    );

    if (!azureRes.ok) {
      const errText = await azureRes.text();
      res.status(azureRes.status).json({ error: `Azure TTS error ${azureRes.status}: ${errText}` });
      return;
    }

    const buf = Buffer.from(await azureRes.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-cache");
    res.end(buf);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
