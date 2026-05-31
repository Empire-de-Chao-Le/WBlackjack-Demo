export const getLanguageFlag = (lang: string) => {
  const map: Record<string, string> = {
    'turkish': '🇹🇷',
    'french': '🇫🇷',
    'spanish': '🇪🇸',
    'german': '🇩🇪',
    'japanese': '🇯🇵',
    'chinese': '🇨🇳',
    'cantonese': '🇭🇰',
    'korean': '🇰🇷',
    'arabic': '🇸🇦',
    'russian': '🇷🇺',
    'italian': '🇮🇹',
    'portuguese': '🇧🇷',
    'english': '🇬🇧',
    'polish': '🇵🇱'
  };
  const key = lang.toLowerCase().trim();
  return map[key] || '🌐';
};

export const normalizeString = (str: string) => {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

export const isCJK = (char: string) => {
  const code = char.charCodeAt(0);
  return (
    (code >= 0x4E00 && code <= 0x9FFF) || 
    (code >= 0x3040 && code <= 0x30FF) || 
    (code >= 0xAC00 && code <= 0xD7AF)
  );
};

/**
 * Unicode-aware tokenizer:
 * - CJK text → split per character (no spaces between characters)
 * - All other scripts → extract Unicode word tokens (letters + numbers),
 *   stripping leading/trailing punctuation so gap words are always clean.
 *   Hyphenated and apostrophe-joined words are kept as one token (e.g. "don't", "well-known").
 */
export function tokenize(text: string): string[] {
  if ([...text].some((c) => isCJK(c))) {
    return [...text].filter((c) => c.trim() !== "");
  }
  const matches = text.matchAll(/[\p{L}\p{N}]+(?:['\u2019\-][\p{L}\p{N}]+)*/gu);
  return [...matches].map((m) => m[0]).filter(Boolean);
}
