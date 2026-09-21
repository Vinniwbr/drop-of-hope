import { fetchJson, readJson, writeJson } from '../utils';

/**
 * API 1 - TheColorAPI (https://www.thecolorapi.com). Gratuita, sem chave e com
 * CORS liberado, entao funciona direto no GitHub Pages.
 *
 * O jogo pergunta o nome oficial da cor que cada chefe roubou e uma paleta
 * harmonica gerada a partir dela. A paleta pinta as particulas da restauracao,
 * os cristais e a tela de vitoria.
 */
const BASE_URL = 'https://www.thecolorapi.com';

export interface ColorInfo {
  hex: string;
  /** Nome retornado pela API (ingles). */
  name: string;
  /** Cinco cores harmonicas em #RRGGBB. */
  palette: string[];
  /** false quando a API estava indisponivel e usamos valores locais. */
  fromApi: boolean;
}

interface ColorEntry {
  hex?: { value?: string };
  name?: { value?: string };
}

interface ColorIdResponse extends ColorEntry {
  hex?: { value?: string };
}

interface ColorSchemeResponse {
  colors?: ColorEntry[];
}

const memory = new Map<number, ColorInfo>();

export function toHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0').toUpperCase()}`;
}

export function hexToNumber(hex: string): number {
  return Number.parseInt(hex.replace('#', ''), 16);
}

function localPalette(color: number): string[] {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  const shades = [0.55, 0.8, 1, 1.15, 1.3];
  return shades.map((shade) => {
    const channel = (value: number) =>
      Math.max(0, Math.min(255, Math.round(value * shade)));
    return toHex((channel(r) << 16) | (channel(g) << 8) | channel(b));
  });
}

export async function loadColorInfo(
  color: number,
  fallbackName: string,
): Promise<ColorInfo> {
  const cached = memory.get(color);
  if (cached) {
    return cached;
  }
  const storageKey = `drop-off-hope:color:v1:${String(color)}`;
  const stored = readJson<ColorInfo | null>(storageKey, null);
  if (stored?.fromApi) {
    memory.set(color, stored);
    return stored;
  }

  const hex = toHex(color);
  const clean = hex.slice(1);
  try {
    const [identity, scheme] = await Promise.all([
      fetchJson<ColorIdResponse>(`${BASE_URL}/id?hex=${clean}&format=json`),
      fetchJson<ColorSchemeResponse>(
        `${BASE_URL}/scheme?hex=${clean}&mode=analogic&count=5&format=json`,
      ),
    ]);
    const palette = (scheme.colors ?? [])
      .map((entry) => entry.hex?.value)
      .filter((value): value is string => typeof value === 'string');
    const info: ColorInfo = {
      fromApi: true,
      hex,
      name: identity.name?.value ?? fallbackName,
      palette: palette.length >= 3 ? palette : localPalette(color),
    };
    memory.set(color, info);
    writeJson(storageKey, info);
    return info;
  } catch {
    const info: ColorInfo = {
      fromApi: false,
      hex,
      name: fallbackName,
      palette: localPalette(color),
    };
    memory.set(color, info);
    return info;
  }
}

/** Sincrono: devolve o que ja foi carregado, ou uma paleta local. */
export function peekColorInfo(color: number, fallbackName: string): ColorInfo {
  return (
    memory.get(color) ?? {
      fromApi: false,
      hex: toHex(color),
      name: fallbackName,
      palette: localPalette(color),
    }
  );
}
