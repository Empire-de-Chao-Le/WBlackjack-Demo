// ── ISO 639-1 code → flag emoji (primary country for that language) ──────────
const ISO_TO_FLAG: Record<string, string> = {
  af: '🇿🇦', sq: '🇦🇱', am: '🇪🇹', ar: '🇸🇦', hy: '🇦🇲',
  az: '🇦🇿', eu: '🇪🇸', be: '🇧🇾', bn: '🇧🇩', bs: '🇧🇦',
  bg: '🇧🇬', ca: '🇪🇸', zh: '🇨🇳', hr: '🇭🇷', cs: '🇨🇿',
  da: '🇩🇰', nl: '🇳🇱', en: '🇬🇧', et: '🇪🇪', fi: '🇫🇮',
  fr: '🇫🇷', gl: '🇪🇸', ka: '🇬🇪', de: '🇩🇪', el: '🇬🇷',
  gu: '🇮🇳', he: '🇮🇱', hi: '🇮🇳', hu: '🇭🇺', is: '🇮🇸',
  id: '🇮🇩', ga: '🇮🇪', it: '🇮🇹', ja: '🇯🇵', kn: '🇮🇳',
  kk: '🇰🇿', km: '🇰🇭', ko: '🇰🇷', ky: '🇰🇬', lo: '🇱🇦',
  lv: '🇱🇻', lt: '🇱🇹', lb: '🇱🇺', mk: '🇲🇰', ms: '🇲🇾',
  ml: '🇮🇳', mt: '🇲🇹', mr: '🇮🇳', mn: '🇲🇳', ne: '🇳🇵',
  nb: '🇳🇴', nn: '🇳🇴', no: '🇳🇴', ps: '🇦🇫', fa: '🇮🇷',
  pl: '🇵🇱', pt: '🇧🇷', pa: '🇮🇳', ro: '🇷🇴', ru: '🇷🇺',
  sr: '🇷🇸', si: '🇱🇰', sk: '🇸🇰', sl: '🇸🇮', so: '🇸🇴',
  es: '🇪🇸', sw: '🇹🇿', sv: '🇸🇪', tl: '🇵🇭', tg: '🇹🇯',
  ta: '🇮🇳', te: '🇮🇳', th: '🇹🇭', tr: '🇹🇷', tk: '🇹🇲',
  uk: '🇺🇦', ur: '🇵🇰', uz: '🇺🇿', vi: '🇻🇳', cy: '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
  xh: '🇿🇦', yi: '🇮🇱', yo: '🇳🇬', zu: '🇿🇦', ht: '🇭🇹',
  my: '🇲🇲', jv: '🇮🇩', su: '🇮🇩', ceb: '🇵🇭',
};

// Overrides for language names that are not standard ISO 639-1 display names
// or that need a different country than their code would suggest.
const SPECIAL_FLAGS: Record<string, string> = {
  cantonese: '🇭🇰',
  mandarin: '🇨🇳',
  'traditional chinese': '🇹🇼',
  'simplified chinese': '🇨🇳',
  farsi: '🇮🇷',
  filipino: '🇵🇭',
  flemish: '🇧🇪',
  tagalog: '🇵🇭',
  'haitian creole': '🇭🇹',
  quechua: '🇵🇪',
  guarani: '🇵🇾',
  nahuatl: '🇲🇽',
  burmese: '🇲🇲',
  sinhalese: '🇱🇰',
  kurdish: '🇮🇶',
};

// Lazily built: English display name (lowercase) → ISO code
// Populated from Intl.DisplayNames at first call — covers every language
// the browser knows about without any manual maintenance.
let _nameToCode: Map<string, string> | null = null;

function getNameToCode(): Map<string, string> {
  if (_nameToCode) return _nameToCode;
  _nameToCode = new Map();
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'language' });
    for (const code of Object.keys(ISO_TO_FLAG)) {
      const name = dn.of(code);
      if (name) _nameToCode.set(name.toLowerCase(), code);
    }
  } catch {
    // Intl.DisplayNames not supported — will fall back to 🌐
  }
  return _nameToCode;
}

export const getLanguageFlag = (lang: string): string => {
  const key = lang.toLowerCase().trim();
  if (SPECIAL_FLAGS[key]) return SPECIAL_FLAGS[key];
  const code = getNameToCode().get(key);
  if (code && ISO_TO_FLAG[code]) return ISO_TO_FLAG[code];
  return '🌐';
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
