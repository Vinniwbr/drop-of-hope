/**
 * Converte as artes grandes (art/source/backgrounds e art/source/bosses) em
 * WebP leve dentro de public/. Os originais ficam em art/ e NAO sao publicados.
 *
 * Uso: npm run assets
 */
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const JOBS = [
  {
    input: join(ROOT, 'art', 'source', 'backgrounds'),
    maxWidth: 1600,
    output: join(ROOT, 'public', 'backgrounds'),
    quality: 80,
  },
  {
    input: join(ROOT, 'art', 'source', 'bosses'),
    maxWidth: 1772,
    output: join(ROOT, 'public', 'sprites', 'bosses'),
    quality: 88,
  },
];

let before = 0;
let after = 0;

for (const job of JOBS) {
  if (!existsSync(job.input)) continue;
  mkdirSync(job.output, { recursive: true });
  for (const file of readdirSync(job.input)) {
    if (!/\.(png|jpe?g)$/i.test(file)) continue;
    const source = join(job.input, file);
    const target = join(job.output, `${parse(file).name}.webp`);
    await sharp(source)
      .resize({ width: job.maxWidth, withoutEnlargement: true })
      .webp({ alphaQuality: 95, quality: job.quality })
      .toFile(target);
    before += statSync(source).size;
    after += statSync(target).size;
    console.log(
      `${file}  ${(statSync(source).size / 1024).toFixed(0)} KB -> ${(statSync(target).size / 1024).toFixed(0)} KB`,
    );
  }
}
console.log(
  `Total: ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB`,
);
