import { Language } from '../types';
import { catalogs, en } from './catalog';

/**
 * Resolve a translation key for a language.
 * Fallback order: target language → English → the raw key.
 * Supports simple {var} interpolation.
 */
export function translate(
  lang: Language,
  key: string,
  vars?: Record<string, string | number>
): string {
  const table = catalogs[lang] ?? en;
  let str = table[key] ?? en[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      str = str.split(`{${name}}`).join(String(value));
    }
  }
  return str;
}
