// Deterministic asset export: the original artwork and its colours are unchanged.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

async function main() {
  const root = path.resolve(__dirname, '..');
  const branding = path.join(root, 'public', 'branding');
  const icons = path.join(root, 'public', 'icons');
  const master = path.join(branding, 'ricettario-ai-logo.png');
  await fs.mkdir(icons, { recursive: true });

  // These bounds separate the official book symbol from the wordmark below it.
  // A little transparent margin retains the original antialiased edges.
  const markCrop = { left: 248, top: 128, width: 920, height: 776 };
  const fullCrop = { left: 40, top: 128, width: 1160, height: 996 };
  const mark = await sharp(master).extract(markCrop).png().toBuffer();
  const full = await sharp(master).extract(fullCrop)
    .resize(640, 560, { fit: 'contain', background: '#00000000' }).toBuffer();
  await sharp(full).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(branding, 'ricettario-ai-logo-login.webp'));
  await sharp(mark).resize(512, 512, { fit: 'contain', background: '#00000000' })
    .png({ compressionLevel: 9 }).toFile(path.join(branding, 'ricettario-ai-mark.png'));
  await sharp(mark).resize(128, 128, { fit: 'contain', background: '#00000000' })
    .webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(branding, 'ricettario-ai-mark.webp'));

  async function iconPng(size) {
    const artwork = await sharp(mark).resize(Math.round(size * .9), Math.round(size * .9), {
      fit: 'contain', background: '#00000000'
    }).png().toBuffer();
    return sharp({ create: { width: size, height: size, channels: 4, background: '#00000000' } })
      .composite([{ input: artwork, gravity: 'centre' }]).png({ compressionLevel: 9 }).toBuffer();
  }
  for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180], ['favicon-32.png', 32], ['favicon-16.png', 16]]) {
    await fs.writeFile(path.join(icons, name), await iconPng(size));
  }

  // ICO directory with embedded PNG frames, supported natively by Windows.
  const sizes = [16, 32, 48, 64, 128, 256];
  const frames = await Promise.all(sizes.map(iconPng));
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  for (let i = 0; i < sizes.length; i++) {
    const entry = 6 + i * 16;
    header[entry] = sizes[i] === 256 ? 0 : sizes[i];
    header[entry + 1] = sizes[i] === 256 ? 0 : sizes[i];
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(frames[i].length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += frames[i].length;
  }
  const ico = Buffer.concat([header, ...frames]);
  await fs.writeFile(path.join(icons, 'ricettario-ai.ico'), ico);
  await fs.writeFile(path.join(root, 'app', 'favicon.ico'), ico);
  console.log('Official branding exported: transparent PNG/WebP and six-size Windows ICO.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
