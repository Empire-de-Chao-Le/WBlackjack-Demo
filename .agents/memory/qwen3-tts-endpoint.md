---
name: DashScope Qwen3-TTS working endpoint
description: Correct API format for Qwen3-TTS-instruct-flash on dashscope-intl (international key)
---

## Correct endpoint and request format

```
POST https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
Authorization: Bearer $DASHSCOPE_API_KEY
Content-Type: application/json

{
  "model": "qwen3-tts-instruct-flash",
  "input": {
    "text": "...",
    "voice": "Cherry",
    "language_type": "Chinese",
    "instruction": "請用台語（臺灣閩南語）朗讀..."
  }
}
```

Response: `output.audio.url` — temporary WAV URL (expires 24h). Fetch and proxy to client.
If `output.audio.data` is non-empty it's base64 PCM — decode directly.

**Why:** The compatible-mode `/chat/completions` and `/audio/speech` endpoints do NOT work for
qwen3-tts models. The native DashScope `/api/v1/services/audio/tts` returns "task can not be null".
Only `/api/v1/services/aigc/multimodal-generation/generation` works. Voice MUST be inside `input`,
not at the top level or inside `parameters`.

**Available voices:** Cherry, Serena, Ethan, Chelsie, Ryan, Vivian, Aiden
**language_type values:** "Chinese", "English", "Japanese", etc., or "Auto"
**instruction field:** supports Minnan dialect control via natural language

**Key that works:** sk-ws-H... prefix, DASHSCOPE_API_KEY secret on dashscope-intl.aliyuncs.com only
(does NOT work on dashscope.aliyuncs.com — different region)
