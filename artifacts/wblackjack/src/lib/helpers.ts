export const getLanguageFlag = (lang: string) => {
  const map: Record<string, string> = {
    'turkish': '🇹🇷',
    'french': '🇫🇷',
    'spanish': '🇪🇸',
    'german': '🇩🇪',
    'japanese': '🇯🇵',
    'chinese': '🇨🇳',
    'korean': '🇰🇷',
    'arabic': '🇸🇦',
    'russian': '🇷🇺',
    'italian': '🇮🇹',
    'portuguese': '🇧🇷',
    'english': '🇬🇧'
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
