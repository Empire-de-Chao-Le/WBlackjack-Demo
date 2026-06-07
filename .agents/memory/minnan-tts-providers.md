---
name: Minnan / Taiwanese Hokkien TTS — which providers actually work
description: Definitive findings on which TTS services can produce real 台語/閩南語 (not Mandarin)
---

# Real Taiwanese Hokkien (台語/閩南語) TTS — what works and what doesn't

The WBlackjack user strictly requires authentic Minnan audio, NOT Mandarin, on Minnan cards.

## What does NOT work (verified empirically against the live APIs)
- **DashScope Qwen3-TTS (intl endpoint)**: NO Minnan. `language_type` only accepts
  `chinese, english, german, italian, portuguese, spanish, japanese, korean, french, russian, auto`
  — there is no Minnan/Hokkien value (HTTP 400 `InvalidParameter`). Dialect is voice-driven,
  and no exposed voice (Cherry/Dylan/Sunny/Jada/etc.) is Minnan (Dylan=Beijing, Sunny=Sichuan,
  Jada=Shanghai). The `qwen3-tts-instruct-flash` `instructions` field is cosmetic for dialect:
  baseline-Mandarin and instruct-"speak Hokkien" clips BOTH transcribe cleanly back to the input
  Mandarin via DashScope ASR (lang=zh) — i.e. instruction does NOT change pronunciation to Hokkien.
- **Azure TTS**: NO Hokkien. Only Taiwanese **Mandarin** (`zh-TW-HsiaoChenNeural`, `YunJhe`,
  `HsiaoYu`). The old code's `nan-TW-A-saiNeural` voice was **fictional** — Azure rejected it,
  which is why production went silent.

## What DOES work
- **台灣媠聲 / ÌTHUÂN (Taiwan MOE Taiwanese TTS)**: `POST https://hapsing.ithuan.tw/bangtsam`
  form-urlencoded `taibun=<Han text>` → returns an **MP3** stream (audio/octet-stream, ID3).
  Authentic Kaohsiung-accent Taiwanese Hokkien. Free, no key. **Reliable for short words/phrases**
  (flashcards' sweet spot); long sentences can return HTTP 500. This is what the api-server
  `/tts/minnan` route now proxies. Frontend plays the MP3 blob generically (no content-type pin).

**Why:** Spent a long investigation proving the two configured providers can't do Minnan despite
marketing claims; only a purpose-built Taiwanese TTS produces real Hokkien.
**How to apply:** For any Taiwanese Hokkien audio in this project, use the ithuan endpoint, not
Qwen/Azure. Keep input short. If higher quality/SLA is needed, paid alternatives exist
(Taigi AI Labs ailabs.jp, learn-language.tokyo) but require signup/keys.
