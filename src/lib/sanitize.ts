/**
 * Limpieza de texto escrito por usuarios. React escapa siempre al renderizar (nunca usamos
 * dangerouslySetInnerHTML), así que esto es defensa en profundidad: quita caracteres de control,
 * marcas de dirección (ataques de texto invertido) y caracteres invisibles, y limita longitudes.
 */
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;

export const NAME_MAX = 24;
export const MESSAGE_MAX = 500;

export function cleanName(input: string): string {
  return Array.from(
    input
      .normalize("NFC")
      .replace(CONTROL, "")
      .replace(/[<>&"'`\\/]/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  )
    .slice(0, NAME_MAX)
    .join("")
    .trim();
}

export function cleanMessage(input: string): string {
  return Array.from(
    input
      .normalize("NFC")
      .replace(/[\r\n\t]+/g, " ")
      .replace(CONTROL, "")
      .replace(/ {2,}/g, " ")
      .trim(),
  )
    .slice(0, MESSAGE_MAX)
    .join("")
    .trim();
}

export const PLAYER_COLORS = [
  "#c2512e",
  "#2f7d6d",
  "#7a4fa0",
  "#b07a12",
  "#2d6cb0",
  "#b8436e",
  "#5e8c3a",
  "#8a5a3c",
] as const;

export function cleanColor(input: string): string {
  return /^#[0-9a-f]{6}$/i.test(input) ? input.toLowerCase() : PLAYER_COLORS[0];
}
