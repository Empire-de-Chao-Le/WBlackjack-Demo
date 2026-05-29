import { Router, type IRouter } from "express";
import OpenAI from "openai";

const router: IRouter = Router();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

router.post("/songs/distractors", async (req, res): Promise<void> => {
  const { word, line, language } = req.body as {
    word?: string;
    line?: string;
    language?: string;
  };

  if (!word || !line) {
    res.status(400).json({ error: "word and line are required" });
    return;
  }

  const lang = language || "the target language";

  const prompt = `You are a language-learning exercise designer. Given a target word and its sentence context, generate exactly 5 high-quality distractor words in ${lang}.

Target word: "${word}"
Sentence context: "${line}"

Requirements for distractors — include a mix of:
1. Morphological/grammatical variants (same root, wrong tense/case/number/person/aspect)
2. Semantic near-synonyms or contextually plausible words
3. Visually or phonetically similar words with different meanings

Rules:
- All 5 must be in ${lang} (the same language as the target word)
- None may be the correct answer ("${word}")
- Each must be clearly distinct from the others
- Return ONLY a JSON array of exactly 5 strings, no explanations, no markdown

Example output format: ["word1","word2","word3","word4","word5"]`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "[]";

    let distractors: string[] = [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        distractors = parsed
          .filter((d): d is string => typeof d === "string" && d.trim() !== "" && d.toLowerCase() !== word.toLowerCase())
          .slice(0, 5);
      }
    } catch {
      // fallback: extract quoted strings
      const matches = raw.match(/"([^"]+)"/g);
      if (matches) {
        distractors = matches
          .map((m) => m.replace(/"/g, ""))
          .filter((d) => d.toLowerCase() !== word.toLowerCase())
          .slice(0, 5);
      }
    }

    res.json({ distractors });
  } catch (err) {
    console.error("Distractor generation failed:", err);
    res.status(500).json({ error: "Failed to generate distractors" });
  }
});

export default router;
