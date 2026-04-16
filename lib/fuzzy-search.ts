/**
 * Generates phonetic/spelling variants of a search query to catch common misspellings.
 * Returns an array of alternative queries (excluding the original).
 *
 * Common confusions handled:
 * - sh/ch (Sasha→Sacha), ph/f, ck/k, ie/ei/ey/y, gh/g
 * - Double/single letters (ll→l, tt→t, etc.)
 * - Silent letters (k before n, w before r)
 * - Common suffix confusions (-burg/-berg, -son/-sen, -man/-mann)
 * - c/k/ck swaps, s/z, th/t
 */

const SUBSTITUTIONS: [RegExp, string][] = [
  // Consonant confusions
  [/sh/gi, "ch"],
  [/ch/gi, "sh"],
  [/ph/gi, "f"],
  [/f(?=[aeiouy])/gi, "ph"],
  [/ck/gi, "k"],
  [/(?<=[aeiouy])k(?=[aeiouy])/gi, "ck"],
  [/(?<=[aeiouy])c(?=[eiys])/gi, "s"],
  [/(?<=[aeiouy])s(?=[eiys])/gi, "c"],
  [/sch/gi, "sh"],
  [/th/gi, "t"],
  [/gh/gi, "g"],
  [/wr/gi, "r"],
  [/kn/gi, "n"],
  [/wh/gi, "w"],
  [/z/gi, "s"],
  [/s(?=[aeiouy])/gi, "z"],

  // Vowel confusions
  [/ie/gi, "ei"],
  [/ei/gi, "ie"],
  [/ey/gi, "ie"],
  [/ie/gi, "ey"],
  [/ea/gi, "ee"],
  [/ee/gi, "ea"],
  [/ou/gi, "o"],
  [/ae/gi, "e"],
  [/oe/gi, "e"],

  // Double/single letter
  [/ll/gi, "l"],
  [/(?<=[aeiouy])l(?=[aeiouy])/gi, "ll"],
  [/tt/gi, "t"],
  [/ss/gi, "s"],
  [/rr/gi, "r"],
  [/nn/gi, "n"],
  [/mm/gi, "m"],
  [/pp/gi, "p"],
  [/ff/gi, "f"],

  // Common suffix confusions
  [/burg$/gi, "berg"],
  [/berg$/gi, "burg"],
  [/son$/gi, "sen"],
  [/sen$/gi, "son"],
  [/mann$/gi, "man"],
  [/man$/gi, "mann"],
  [/er$/gi, "re"],
  [/re$/gi, "er"],
];

/**
 * Generate alternative spellings for a query.
 * Returns unique alternatives that differ from the original, limited to the top candidates.
 */
export function generateFuzzyVariants(query: string, maxVariants = 6): string[] {
  const original = query.toLowerCase().trim();
  const variants = new Set<string>();

  for (const [pattern, replacement] of SUBSTITUTIONS) {
    const variant = original.replace(pattern, replacement);
    if (variant !== original && variant.length > 1) {
      variants.add(variant);
    }
  }

  // Also try each word individually for multi-word queries
  const words = original.split(/\s+/);
  if (words.length > 1) {
    for (let w = 0; w < words.length; w++) {
      for (const [pattern, replacement] of SUBSTITUTIONS) {
        const newWord = words[w].replace(pattern, replacement);
        if (newWord !== words[w]) {
          const newWords = [...words];
          newWords[w] = newWord;
          variants.add(newWords.join(" "));
        }
      }
    }
  }

  return [...variants].slice(0, maxVariants);
}
