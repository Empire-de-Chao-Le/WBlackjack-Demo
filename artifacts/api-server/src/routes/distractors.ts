import { Router, type IRouter } from "express";
import OpenAI from "openai";

const router: IRouter = Router();

// DeepSeek is OpenAI-compatible — just swap the base URL and model
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://api.deepseek.com",
});

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

  // Detect character-based (CJK) targets by inspecting the word itself, so this
  // generalizes to ALL Chinese variants (Mandarin, Cantonese, Minnan, etc.) and
  // never relies on the language name. Chinese targets in this game are always a
  // single character, so distractors must also be single characters.
  const isChinese = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(word);

  const prompt = isChinese
    ? `You are a language-learning exercise designer. Given a target Chinese character and its sentence context, generate exactly 5 high-quality distractor characters in ${lang}.

Target character: "${word}"
Sentence context: "${line}"

Requirements for distractors — include a mix of:
1. Near-synonyms or semantically related single characters
2. Characters that share the same Kangxi radical as the target (radical variations)
3. Visually similar characters (similar shape/components) with different meanings

Rules:
- Every distractor MUST be exactly ONE Chinese character — never two or three characters, never a multi-character word
- All 5 must be valid characters in ${lang} (the same language as the target)
- None may be the correct answer ("${word}")
- Each must be clearly distinct from the others
- Return ONLY a JSON array of exactly 5 single-character strings, no explanations, no markdown fences

Example output format: ["字","词","语","文","言"]`
    : `You are a language-learning exercise designer. Given a target word and its sentence context, generate exactly 5 high-quality distractor words in ${lang}.

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
- Return ONLY a JSON array of exactly 5 strings, no explanations, no markdown fences

Example output format: ["word1","word2","word3","word4","word5"]`;

  try {
    const completion = await openai.chat.completions.create({
      model: "deepseek-chat",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "[]";

    // For Chinese targets, keep ONLY single-character distractors. This is a
    // safety net in case the model returns multi-character words despite the
    // prompt. No length restriction is applied to letter-based languages.
    const acceptable = (d: string): boolean => {
      if (d.trim() === "" || d.toLowerCase() === word.toLowerCase()) return false;
      if (isChinese && Array.from(d.trim()).length !== 1) return false;
      return true;
    };

    let distractors: string[] = [];
    try {
      // Strip markdown fences if model wraps output anyway
      const cleaned = raw.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        distractors = parsed
          .filter((d): d is string => typeof d === "string")
          .map((d) => d.trim())
          .filter(acceptable)
          .slice(0, 5);
      }
    } catch {
      const matches = raw.match(/"([^"]+)"/g);
      if (matches) {
        distractors = matches
          .map((m) => m.replace(/"/g, "").trim())
          .filter(acceptable)
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
