/**
 * Reconstroi as folhas de sprites do personagem a partir das artes originais
 * em art/source/player.
 *
 * O pipeline anterior fatiava as folhas em uma grade rigida, cortava os pes das
 * poses de ataque e reescalava cada quadro para a mesma altura, o que fazia o
 * personagem "pulsar" e tremer. Este script:
 *
 *  1. remove o fundo de papel por flood-fill (preserva os olhos brancos);
 *  2. separa os componentes conexos e agrupa cada pose (corpo, maos, pincel);
 *  3. apaga os numeros de quadro desenhados na arte;
 *  4. usa UMA escala por folha (calculada na pose "em pe") para todos os quadros;
 *  5. ancora todos os quadros no chao (pes) e no centro do corpo.
 *
 * Uso: npm run sprites
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'art', 'source', 'player');
const OUTPUT = join(ROOT, 'public', 'sprites', 'hope');
const DEBUG = process.env.SPRITE_DEBUG_DIR;

/** Altura (px de saida) do corpo em pe, sem contar mãos/pincel. */
const BODY_HEIGHT = 132;
const BG_THRESHOLD = 205;
const INK = [26, 26, 30];

const SHEETS = [
  { name: 'idle', file: 'idle.jpeg', cols: 8, rows: 1, labels: true, refFrame: 0 },
  { name: 'run', file: 'run.jpeg', cols: 5, rows: 2, labels: false, refFrame: 0 },
  { name: 'crouch', file: 'crouch.jpeg', cols: 6, rows: 1, labels: false, refFrame: 0 },
  {
    name: 'brush-attack',
    file: 'brush-attack.jpeg',
    cols: 6,
    rows: 2,
    labels: true,
    refFrame: 0,
  },
  {
    name: 'ink-projectile',
    file: 'ink-projectile.jpeg',
    cols: 6,
    rows: 2,
    labels: true,
    mode: 'projectile',
    fixedScale: 0.62,
    minArea: 5,
  },
];

async function loadRaw(path) {
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function luminance(data, index) {
  return (
    data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
  );
}

/** Marca o fundo conectado as bordas; devolve mascara de primeiro plano. */
function extractForeground({ data, width, height }) {
  const total = width * height;
  const isBackground = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const tryPush = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (isBackground[p]) return;
    const o = p * 4;
    if (Math.min(data[o], data[o + 1], data[o + 2]) < BG_THRESHOLD) return;
    isBackground[p] = 1;
    queue[tail++] = p;
  };

  for (let x = 0; x < width; x++) {
    tryPush(x, 0);
    tryPush(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    tryPush(0, y);
    tryPush(width - 1, y);
  }
  while (head < tail) {
    const p = queue[head++];
    const x = p % width;
    const y = (p / width) | 0;
    tryPush(x - 1, y);
    tryPush(x + 1, y);
    tryPush(x, y - 1);
    tryPush(x, y + 1);
  }

  const alpha = new Uint8Array(total);
  const rgb = new Uint8Array(total * 3);
  for (let p = 0; p < total; p++) {
    if (isBackground[p]) continue;
    const x = p % width;
    const y = (p / width) | 0;
    const o = p * 4;
    const touchesBackground =
      (x > 0 && isBackground[p - 1]) ||
      (x < width - 1 && isBackground[p + 1]) ||
      (y > 0 && isBackground[p - width]) ||
      (y < height - 1 && isBackground[p + width]);
    if (touchesBackground) {
      const lum = luminance(data, o);
      alpha[p] = Math.round(
        255 * Math.min(1, Math.max(0.2, (236 - lum) / 120)),
      );
      rgb[p * 3] = INK[0];
      rgb[p * 3 + 1] = INK[1];
      rgb[p * 3 + 2] = INK[2];
    } else {
      alpha[p] = 255;
      rgb[p * 3] = data[o];
      rgb[p * 3 + 1] = data[o + 1];
      rgb[p * 3 + 2] = data[o + 2];
    }
  }
  return { alpha, rgb };
}

function labelComponents(alpha, width, height, minArea) {
  const total = width * height;
  const labels = new Int32Array(total);
  const queue = new Int32Array(total);
  const comps = [];
  for (let start = 0; start < total; start++) {
    if (alpha[start] === 0 || labels[start] !== 0) continue;
    const id = comps.length + 1;
    const comp = {
      area: 0,
      id,
      maxX: 0,
      maxY: 0,
      minX: width,
      minY: height,
      sumX: 0,
      sumY: 0,
    };
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = id;
    while (head < tail) {
      const p = queue[head++];
      const x = p % width;
      const y = (p / width) | 0;
      comp.area++;
      comp.sumX += x;
      comp.sumY += y;
      if (x < comp.minX) comp.minX = x;
      if (x > comp.maxX) comp.maxX = x;
      if (y < comp.minY) comp.minY = y;
      if (y > comp.maxY) comp.maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const np = ny * width + nx;
          if (alpha[np] === 0 || labels[np] !== 0) continue;
          labels[np] = id;
          queue[tail++] = np;
        }
      }
    }
    comp.cx = comp.sumX / comp.area;
    comp.cy = comp.sumY / comp.area;
    comp.w = comp.maxX - comp.minX + 1;
    comp.h = comp.maxY - comp.minY + 1;
    comps.push(comp);
  }
  return { comps: comps.filter((c) => c.area >= minArea), labels };
}

/**
 * Numeros de quadro: componentes pequenos, alinhados na mesma "linha de rotulo"
 * e posicionados ABAIXO de todos os componentes principais da linha (as maos
 * do personagem tambem sao pequenas e alinhadas, mas ficam acima dos pes).
 */
function findLabelComponents(comps, cols, rows, height) {
  const rowHeight = height / rows;
  const bottomOfPoses = new Array(rows).fill(0);
  for (let row = 0; row < rows; row++) {
    const inRow = comps.filter(
      (c) => c.cy >= row * rowHeight && c.cy < (row + 1) * rowHeight,
    );
    const largest = inRow.sort((a, b) => b.area - a.area).slice(0, cols);
    bottomOfPoses[row] = Math.max(...largest.map((c) => c.maxY));
  }
  const small = comps.filter(
    (c) =>
      c.h >= 12 &&
      c.h <= 34 &&
      c.w <= 50 &&
      c.area < 900 &&
      c.minY > bottomOfPoses[Math.min(rows - 1, Math.floor(c.cy / rowHeight))],
  );
  const buckets = new Map();
  for (const comp of small) {
    const key = Math.round(comp.cy / 10);
    const list = buckets.get(key) ?? [];
    list.push(comp);
    buckets.set(key, list);
  }
  const rowBuckets = [...buckets.entries()].filter(
    ([, list]) => list.length >= Math.max(3, cols - 2),
  );
  const labelIds = new Set();
  for (const [key] of rowBuckets) {
    for (const k of [key - 1, key, key + 1]) {
      for (const comp of buckets.get(k) ?? []) {
        labelIds.add(comp.id);
      }
    }
  }
  return labelIds;
}

function boxGap(a, b) {
  const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
  const dy = Math.max(0, a.minY - b.maxY, b.minY - a.maxY);
  return Math.hypot(dx, dy);
}

function groupPoses(comps, sheet, width, height) {
  const cellW = width / sheet.cols;
  const cellH = height / sheet.rows;
  const mains = [];
  for (let row = 0; row < sheet.rows; row++) {
    for (let col = 0; col < sheet.cols; col++) {
      const inside = comps.filter(
        (c) =>
          c.cx >= col * cellW &&
          c.cx < (col + 1) * cellW &&
          c.cy >= row * cellH &&
          c.cy < (row + 1) * cellH,
      );
      inside.sort((a, b) => b.area - a.area);
      if (inside.length === 0) {
        throw new Error(`${sheet.name}: sem pose em linha ${row} coluna ${col}`);
      }
      mains.push({ main: inside[0], parts: [inside[0]] });
    }
  }
  const mainIds = new Set(mains.map((m) => m.main.id));
  for (const comp of comps) {
    if (mainIds.has(comp.id)) continue;
    let best = mains[0];
    let bestGap = Infinity;
    for (const candidate of mains) {
      const gap = boxGap(comp, candidate.main);
      if (gap < bestGap) {
        bestGap = gap;
        best = candidate;
      }
    }
    best.parts.push(comp);
  }
  return mains;
}

async function buildPoseImage(pose, labels, alpha, rgb, sheetWidth) {
  const minX = Math.min(...pose.parts.map((c) => c.minX));
  const minY = Math.min(...pose.parts.map((c) => c.minY));
  const maxX = Math.max(...pose.parts.map((c) => c.maxX));
  const maxY = Math.max(...pose.parts.map((c) => c.maxY));
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const ids = new Set(pose.parts.map((c) => c.id));
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (minY + y) * sheetWidth + (minX + x);
      if (!ids.has(labels[p])) continue;
      const o = (y * w + x) * 4;
      out[o] = rgb[p * 3];
      out[o + 1] = rgb[p * 3 + 1];
      out[o + 2] = rgb[p * 3 + 2];
      out[o + 3] = alpha[p];
    }
  }
  return { buffer: out, h, minX, minY, w };
}

async function processSheet(sheet) {
  const raw = await loadRaw(join(SOURCE, sheet.file));
  const { alpha, rgb } = extractForeground(raw);
  const { comps: allComps, labels } = labelComponents(
    alpha,
    raw.width,
    raw.height,
    sheet.minArea ?? 20,
  );
  const labelIds = sheet.labels
    ? findLabelComponents(allComps, sheet.cols, sheet.rows, raw.height)
    : new Set();
  const comps = allComps.filter((c) => !labelIds.has(c.id));
  const poses = groupPoses(comps, sheet, raw.width, raw.height);

  let scale = sheet.fixedScale;
  if (scale === undefined) {
    scale = BODY_HEIGHT / poses[sheet.refFrame].main.h;
  }

  const frames = [];
  for (const [poseIndex, pose] of poses.entries()) {
    const image = await buildPoseImage(pose, labels, alpha, rgb, raw.width);
    let anchorX = pose.main.cx;
    let anchorY = pose.main.maxY;
    if (sheet.mode === 'projectile') {
      anchorX =
        pose.main.w > 140 || pose.main.cx < pose.main.minX + pose.main.w * 0.6
          ? pose.main.maxX - pose.main.h / 2
          : pose.main.cx;
      anchorY = pose.main.cy;
      if (poseIndex >= sheet.cols) {
        // Quadros de respingo: ancora no centro do conjunto de gotas.
        anchorX = (image.minX * 2 + image.w) / 2;
        anchorY = (image.minY * 2 + image.h) / 2;
      }
    }
    const width = Math.max(1, Math.round(image.w * scale));
    const height = Math.max(1, Math.round(image.h * scale));
    const scaled = await sharp(image.buffer, {
      raw: { channels: 4, height: image.h, width: image.w },
    })
      .resize(width, height, { kernel: 'lanczos3' })
      .raw()
      .toBuffer();
    frames.push({
      anchorX: (anchorX - image.minX) * scale,
      anchorY: (anchorY - image.minY) * scale,
      buffer: scaled,
      height,
      width,
    });
  }

  return { frames, name: sheet.name, scale, sheet };
}

async function composeSheets(results) {
  let left = 0;
  let right = 0;
  let up = 0;
  let down = 0;
  for (const result of results) {
    for (const frame of result.frames) {
      left = Math.max(left, frame.anchorX);
      right = Math.max(right, frame.width - frame.anchorX);
      up = Math.max(up, frame.anchorY);
      down = Math.max(down, frame.height - frame.anchorY);
    }
  }
  const halfWidth = Math.ceil(Math.max(left, right)) + 6;
  const frameWidth = halfWidth * 2;
  const feetPadding = 6;
  const frameHeight = Math.ceil(up) + Math.ceil(down) + feetPadding;
  const anchorY = Math.ceil(up);

  console.log(
    `Quadro: ${String(frameWidth)}x${String(frameHeight)} | ancora (${String(halfWidth)}, ${String(anchorY)})`,
  );

  mkdirSync(OUTPUT, { recursive: true });
  for (const result of results) {
    const { cols, rows } = result.sheet;
    const overlays = [];
    result.frames.forEach((frame, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      overlays.push({
        input: frame.buffer,
        left: col * frameWidth + Math.round(halfWidth - frame.anchorX),
        raw: { channels: 4, height: frame.height, width: frame.width },
        top: row * frameHeight + Math.round(anchorY - frame.anchorY),
      });
    });
    const sheetImage = sharp({
      create: {
        background: { alpha: 0, b: 0, g: 0, r: 0 },
        channels: 4,
        height: frameHeight * rows,
        width: frameWidth * cols,
      },
    }).composite(overlays);
    const target = join(OUTPUT, `hope-${result.name}.png`);
    await sheetImage.png({ compressionLevel: 9 }).toFile(target);
    console.log(
      `  hope-${result.name}.png  ${String(result.frames.length)} quadros, escala ${result.scale.toFixed(3)}`,
    );

    if (DEBUG) {
      mkdirSync(DEBUG, { recursive: true });
      const guides = [];
      for (let row = 0; row < rows; row++) {
        guides.push({
          input: {
            create: {
              background: { alpha: 0.9, b: 0, g: 0, r: 255 },
              channels: 4,
              height: 1,
              width: frameWidth * cols,
            },
          },
          left: 0,
          top: row * frameHeight + anchorY,
        });
      }
      const preview = await sharp({
        create: {
          background: { b: 190, g: 190, r: 190 },
          channels: 3,
          height: frameHeight * rows,
          width: frameWidth * cols,
        },
      })
        .composite([
          { input: await sheetImage.clone().png().toBuffer(), left: 0, top: 0 },
          ...guides,
        ])
        .png()
        .toBuffer();
      await sharp(preview).toFile(join(DEBUG, `${result.name}.png`));
    }
  }

  const meta = {
    anchorX: halfWidth,
    anchorY,
    bodyHeight: BODY_HEIGHT,
    frameHeight,
    frameWidth,
  };
  writeFileSync(join(OUTPUT, 'hope-meta.json'), JSON.stringify(meta, null, 2));
  return meta;
}

const results = [];
for (const sheet of SHEETS) {
  results.push(await processSheet(sheet));
}
const meta = await composeSheets(results);
console.log(JSON.stringify(meta));
