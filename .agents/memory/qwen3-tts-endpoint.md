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
    "instruction": "Speak in Taiwanese Hokkien (台語/閩南語)..."
    // DO NOT include language_type: "Chinese" — it pins to Mandarin and ignores instruction
  }
}
```

Response: `output.audio.url` — temporary WAV URL (expires 24h). Fetch and proxy to client.
If `output.audio.data` is non-empty it's base64 PCM — decode directly.

**Why:** The compatible-mode `/chat/completions` and `/audio/speech` endpoints do NOT work for
qwen3-tts models. The native DashScope `/api/v1/services/audio/tts` returns "task can not be null".
Only `/api/v1/services/aigc/multimodal-generation/generation` works.

**CRITICAL: language_type: "Chinese" overrides the instruction and forces Mandarin output.**
Omit language_type entirely when instructing Minnan/Hokkien — let the model infer from instruction.

**The suggested "top-level parameters" format (text/voice/instructions at top level) returns HTTP 400.**
The correct format keeps all fields inside `input` with `instruction` (singular).

**Voice must be inside `input` object, NOT at the top level or inside `parameters`.**

**CosyVoice (loonghokkien voice) is NOT on the international endpoint** — "Model not exist".
The `loonghokkien` voice name also fails on qwen3-tts-instruct-flash with "Voice not supported".

**Available voices:** Cherry, Serena, Ethan, Chelsie, Ryan, Vivian, Aiden
**Key that works:** sk-ws-H... prefix, DASHSCOPE_API_KEY on dashscope-intl.aliyuncs.com only
(does NOT work on dashscope.aliyuncs.com — different region)
