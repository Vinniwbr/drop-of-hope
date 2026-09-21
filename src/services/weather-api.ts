import { fetchJson, readJson, writeJson } from '../utils';

/**
 * API 2 - Open-Meteo (https://open-meteo.com). Gratuita, sem chave e com CORS
 * liberado. Traz o clima REAL do jogador, que vira clima dentro das fases:
 * chuva, neblina, neve, tempestade com relampagos e noite.
 */
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const LOCATION_KEY = 'drop-off-hope:location:v1';
const CACHE_KEY = 'drop-off-hope:weather:v1';
const CACHE_MS = 30 * 60 * 1000;

export type WeatherKind =
  'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm';

export interface Location {
  city: string;
  latitude: number;
  longitude: number;
}

export interface WeatherInfo {
  city: string;
  isDay: boolean;
  kind: WeatherKind;
  label: string;
  /** true quando veio da API agora; false quando e valor padrao/offline. */
  live: boolean;
  temperature: number;
  windKmh: number;
}

interface ForecastResponse {
  current?: {
    is_day?: number;
    temperature_2m?: number;
    weather_code?: number;
    wind_speed_10m?: number;
  };
}

interface GeocodingResponse {
  results?: {
    admin1?: string;
    country?: string;
    latitude: number;
    longitude: number;
    name: string;
  }[];
}

interface CachedWeather {
  at: number;
  info: WeatherInfo;
  key: string;
}

const DEFAULT_LOCATION: Location = {
  city: 'São Paulo',
  latitude: -23.55,
  longitude: -46.63,
};

let current: WeatherInfo = {
  city: DEFAULT_LOCATION.city,
  isDay: true,
  kind: 'clear',
  label: 'Céu limpo',
  live: false,
  temperature: 0,
  windKmh: 0,
};

/** Traduz o codigo WMO devolvido pela API para um tipo de clima do jogo. */
export function describeWeather(code: number): {
  kind: WeatherKind;
  label: string;
} {
  if (code === 0) return { kind: 'clear', label: 'Céu limpo' };
  if (code <= 2) return { kind: 'clear', label: 'Poucas nuvens' };
  if (code === 3) return { kind: 'cloudy', label: 'Nublado' };
  if (code === 45 || code === 48) return { kind: 'fog', label: 'Neblina' };
  if (code >= 51 && code <= 57) return { kind: 'rain', label: 'Garoa' };
  if (code >= 61 && code <= 67) return { kind: 'rain', label: 'Chuva' };
  if (code >= 71 && code <= 77) return { kind: 'snow', label: 'Neve' };
  if (code >= 80 && code <= 82)
    return { kind: 'rain', label: 'Pancadas de chuva' };
  if (code === 85 || code === 86) return { kind: 'snow', label: 'Neve forte' };
  if (code >= 95) return { kind: 'storm', label: 'Tempestade' };
  return { kind: 'cloudy', label: 'Nublado' };
}

export function getLocation(): Location {
  return readJson<Location>(LOCATION_KEY, DEFAULT_LOCATION);
}

export function saveLocation(location: Location) {
  writeJson(LOCATION_KEY, location);
  writeJson(CACHE_KEY, null);
}

export function getWeather(): WeatherInfo {
  return current;
}

/** Busca cidade pelo nome (geocodificacao do Open-Meteo). */
export async function searchCity(name: string): Promise<Location | null> {
  const query = name.trim();
  if (query.length < 2) {
    return null;
  }
  try {
    const data = await fetchJson<GeocodingResponse>(
      `${GEOCODING_URL}?name=${encodeURIComponent(query)}&count=1&language=pt&format=json`,
    );
    const hit = data.results?.[0];
    if (!hit) {
      return null;
    }
    return {
      city: hit.name,
      latitude: hit.latitude,
      longitude: hit.longitude,
    };
  } catch {
    return null;
  }
}

/** Pede a localizacao ao navegador (so depois de o jogador clicar). */
export function requestGeolocation(): Promise<Location | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          city: 'Minha localização',
          latitude: Number(position.coords.latitude.toFixed(2)),
          longitude: Number(position.coords.longitude.toFixed(2)),
        });
      },
      () => {
        resolve(null);
      },
      { maximumAge: 600000, timeout: 8000 },
    );
  });
}

export async function refreshWeather(): Promise<WeatherInfo> {
  const location = getLocation();
  const key = `${location.latitude.toFixed(2)},${location.longitude.toFixed(2)}`;
  const cached = readJson<CachedWeather | null>(CACHE_KEY, null);
  if (cached?.key === key && Date.now() - cached.at < CACHE_MS) {
    current = { ...cached.info, city: location.city };
    return current;
  }

  try {
    const data = await fetchJson<ForecastResponse>(
      `${FORECAST_URL}?latitude=${String(location.latitude)}&longitude=${String(location.longitude)}&current=temperature_2m,weather_code,is_day,wind_speed_10m&timezone=auto`,
    );
    const now = data.current;
    if (!now) {
      throw new Error('sem dados');
    }
    const { kind, label } = describeWeather(now.weather_code ?? 0);
    current = {
      city: location.city,
      isDay: now.is_day !== 0,
      kind,
      label,
      live: true,
      temperature: Math.round(now.temperature_2m ?? 0),
      windKmh: Math.round(now.wind_speed_10m ?? 0),
    };
    writeJson(CACHE_KEY, { at: Date.now(), info: current, key });
  } catch {
    current = { ...current, city: location.city, live: false };
  }
  return current;
}
