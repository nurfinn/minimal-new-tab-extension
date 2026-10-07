// QA-only crop/density normalization, never a production UI asset.
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const dir = resolve(process.argv[2]);
const reference = '/Users/nurfinn/.codex/generated_images/019f13bd-0a4a-7131-bbe8-6147ca74e7d6/exec-68147260-9d7a-46da-ba67-335e9937494f.png';
const normalized = await sharp(reference).resize(1280, 800).removeAlpha().toBuffer();
await sharp({ create: { width: 2560, height: 800, channels: 3, background: '#fff' } })
  .composite([{ input: normalized, left: 0, top: 0 }, { input: join(dir, 'chrome-design-v1.png'), left: 1280, top: 0 }])
  .png().toFile(join(dir, 'comparison-full.png'));
const crop = await sharp(reference).extract({ left: 911, top: 231, width: 464, height: 584 })
  .resize(376, 473).removeAlpha().toBuffer();
const actual = join(dir, 'chrome-palette-v1.png');
const metadata = await sharp(actual).metadata();
await sharp({ create: { width: 752, height: Math.max(473, metadata.height), channels: 3, background: '#fff' } })
  .composite([{ input: crop, left: 0, top: 0 }, { input: actual, left: 376, top: 0 }])
  .png().toFile(join(dir, 'comparison-palette.png'));
console.log('Source left, implementation right: ' + dir);
