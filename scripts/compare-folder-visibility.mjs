// QA-only density normalization and comparison; never a production asset.
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const dir = resolve(process.argv[2]);
const reference = '/Users/nurfinn/.codex/generated_images/019f13bd-0a4a-7131-bbe8-6147ca74e7d6/exec-05c0b8f7-d24a-46be-aa36-2a9ebbe25fd4.png';
for (const platform of ['chrome', 'firefox']) {
  const fullActual = join(dir, platform + '-en-folder-visibility.png');
  const fullMetadata = await sharp(fullActual).metadata();
  const fullSource = await sharp(reference).resize(fullMetadata.width, fullMetadata.height).removeAlpha().toBuffer();
  await sharp({ create: { width: fullMetadata.width * 2, height: fullMetadata.height, channels: 3, background: '#fff' } })
    .composite([{ input: fullSource, left: 0, top: 0 }, { input: fullActual, left: fullMetadata.width, top: 0 }])
    .png().toFile(join(dir, platform + '-folder-visibility-comparison-full.png'));
  const actual = join(dir, platform + '-en-folder-visibility-modal.png');
  const metadata = await sharp(actual).metadata();
  const source = await sharp(reference).extract({ left: 502, top: 233, width: 485, height: 585 })
    .resize({ width: metadata.width }).removeAlpha().toBuffer();
  const sourceMetadata = await sharp(source).metadata();
  await sharp({ create: { width: metadata.width * 2, height: Math.max(metadata.height, sourceMetadata.height), channels: 3, background: '#fff' } })
    .composite([{ input: source, left: 0, top: 0 }, { input: actual, left: metadata.width, top: 0 }])
    .png().toFile(join(dir, platform + '-folder-visibility-comparison.png'));
}
console.log('Selected source left, implementation right: ' + dir);
