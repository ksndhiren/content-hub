// Safety net for the dash tic that GPT outputs love.
// Uses \uXXXX escapes only, so this file survives global text substitutions
// that target the literal dash characters.
//
// em-dash family  (pause)  -> ", "
//   U+2014 em-dash, U+2015 horizontal bar, U+2E3A two-em dash,
//   U+2E3B three-em dash, U+FE58 small em-dash
//
// en-dash / hyphen family  (range) -> "-"
//   U+2010 hyphen, U+2011 non-breaking hyphen, U+2012 figure dash,
//   U+2013 en-dash, U+2212 minus sign, U+FE63 small hyphen-minus,
//   U+FF0D fullwidth hyphen-minus

const PAUSE_DASHES = /[—―⸺⸻﹘]/g;
const RANGE_DASHES = /[‐‑‒–−﹣－]/g;

export function stripDashes(s: string): string {
  if (!s) return s;
  return s
    .replace(PAUSE_DASHES, ", ")
    .replace(RANGE_DASHES, "-")
    // Tidy up sequences the substitution can produce.
    .replace(/,\s*,/g, ",")
    .replace(/,\s*\./g, ".")
    .replace(/\s+,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Walks an object recursively and applies `stripDashes` to every string. */
export function cleanStringsDeep<T>(input: T): T {
  if (typeof input === "string") return stripDashes(input) as unknown as T;
  if (Array.isArray(input)) return input.map(cleanStringsDeep) as unknown as T;
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) out[k] = cleanStringsDeep(v);
    return out as unknown as T;
  }
  return input;
}
