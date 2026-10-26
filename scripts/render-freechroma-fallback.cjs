// Generate only the automatic image fallback, without rebuilding the MP4.
// Usage: node scripts/render-freechroma-fallback.cjs /path/to/ffmpeg [/path/to/sharp]
const { spawnSync } = require('node:child_process');
const path = require('node:path');

async function renderFallback({ ffmpeg, video, fallback, sharpPath }) {
  const sharp = require(sharpPath || 'sharp');
  const width = 640;
  const height = 360;
  const frames = spawnSync(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-i', video,
    '-vf', `fps=12,scale=${width}:${height}:flags=lanczos`,
    '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1',
  ], { maxBuffer: 128 * 1024 * 1024 });
  if (frames.error) throw frames.error;
  if (frames.status !== 0) throw new Error(frames.stderr.toString());
  const pages = frames.stdout.length / (width * height * 4);
  if (!Number.isInteger(pages) || pages === 0) throw new Error('Invalid video frames');
  // Accumulate rounded timestamps so the fallback retains the original 10 s timing.
  const delay = Array.from({ length: pages }, (_, i) => Math.round((i + 1) * 1000 / 12) - Math.round(i * 1000 / 12));
  return sharp(frames.stdout, { raw: { width, height: height * pages, channels: 4, pageHeight: height } })
    .webp({ quality: 65, effort: 4, loop: 0, delay })
    .toFile(fallback);
}

module.exports = renderFallback;
if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  renderFallback({
    ffmpeg: process.argv[2] || process.env.FREECHROMA_FFMPEG || 'ffmpeg',
    video: path.join(root, 'assets/videos/freechroma-compositing.mp4'),
    fallback: path.join(root, 'assets/images/freechroma-compositing.webp'),
    sharpPath: process.argv[3],
  }).then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(error); process.exitCode = 1; });
}
