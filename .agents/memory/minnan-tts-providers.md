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

## What DOES work — TWO-STEP pipeline (critical)
The 媠聲 service needs **two** calls. Skipping step 1 is a silent bug, not an error.
1. **Tokenize**: `POST https://hokbu.ithuan.tw/tau` form `taibun=<Han text>` → JSON;
   take the `KIP` field = word-segmented **Tâi-lô romanization** (e.g. 你叫啥咪名 → "lí kiò siánn mi miâ").
2. **Synthesize**: `POST https://hapsing.ithuan.tw/bangtsam` form `taibun=<Tâi-lô KIP>` → **MP3** (ID3).
   Authentic Kaohsiung-accent Taiwanese Hokkien. Free, no key.

**CRITICAL gotcha:** `bangtsam` expects **Tâi-lô romanization, NOT raw multi-character Han**.
Feeding it raw Han (e.g. "你叫啥咪名") makes it mis-segment and emit only ONE truncated
syllable (~0.6s) — the audio is real Hokkien but only the first character, so it sounds like
a random short single sound. Single Han chars happen to work; multi-char silently truncates.
Verified: "你叫啥咪名" raw Han → 0.684s; via tokenizer "lí kiò siánn mi miâ" → 1.584s. Always
tokenize first. The api-server `/tts/minnan` route does both steps (falls back to raw text if the
tokenizer is unreachable, since single chars still render). Frontend plays the MP3 blob generically.
Keep input short; long sentences can return HTTP 500.

**Why:** Spent a long investigation proving the two configured providers can't do Minnan despite
marketing claims; only a purpose-built Taiwanese TTS produces real Hokkien.
**How to apply:** For any Taiwanese Hokkien audio in this project, use the ithuan endpoint, not
Qwen/Azure. Keep input short. If higher quality/SLA is needed, paid alternatives exist
(Taigi AI Labs ailabs.jp, learn-language.tokyo) but require signup/keys.
