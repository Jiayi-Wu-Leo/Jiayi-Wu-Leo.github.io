// Rebuild the homepage's input/reference/result preview from the original example.
// Usage: node scripts/render-freechroma-preview.cjs /path/to/ffmpeg [/path/to/sharp]
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const ffmpeg = process.argv[2] || process.env.FREECHROMA_FFMPEG || 'ffmpeg';
const source = path.join(root, 'freechroma/media/bgedit_5922495-hd_2048_1080_25fps');
const video = path.join(root, 'assets/videos/freechroma-compositing.mp4');
const poster = path.join(root, 'assets/images/freechroma-compositing-poster.jpg');
const fallback = path.join(root, 'assets/images/freechroma-compositing.webp');
const font = '/System/Library/Fonts/Helvetica.ttc';
fs.mkdirSync(path.dirname(video), { recursive: true });

function run(args) {
  const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'warning', '-y', ...args], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

function text(label, x, y, size, color = '0x33443F', extra = '') {
  return `drawtext=fontfile='${font}':text='${label}':x=${x}:y=${y}:fontsize=${size}:fontcolor=${color}${extra}`;
}

// Show the inputs first, then enlarge the window while revealing the real output.
// The wipe is a synchronized before/after comparison, not a denoising trajectory.
const duration = 10;
const ease = value => `((${value})*(${value})*(3-2*(${value})))`;
const progress = `if(lt(t,2.6),0,if(lt(t,3.8),${ease('(t-2.6)/1.2')},if(lt(t,8.8),1,1-${ease('(t-8.8)/1.2')})))`;
const reveal = progress.replaceAll('t', 'T').replaceAll('lT', 'lt');
const filters = [
  '[0:v]fps=16,setpts=PTS-STARTPTS,scale=1280:720:flags=lanczos,setsar=1[before]',
  '[1:v]fps=16,setpts=PTS-STARTPTS,setsar=1[after]',
  `[before][after]blend=all_expr='if(lte(X,W*(${reveal})),B,A)'[comparison]`,
  `[comparison]scale=w='trunc((832+448*(${progress}))/2)*2':h='trunc(ow*9/16/2)*2':eval=frame:flags=lanczos,setsar=1[window]`,
  '[2:v]scale=304:172:force_original_aspect_ratio=decrease:flags=lanczos,pad=304:172:(ow-iw)/2:(oh-ih)/2:color=0xF3F6F2,setsar=1[ref-one]',
  '[3:v]scale=304:172:force_original_aspect_ratio=decrease:flags=lanczos,pad=304:172:(ow-iw)/2:(oh-ih)/2:color=0xF3F6F2,setsar=1[ref-two]',
  'color=c=black@0:s=1280x720:r=16:d=10,format=rgba[transparent]',
  '[transparent][ref-one]overlay=944:146[with-ref-one]',
  '[with-ref-one][ref-two]overlay=944:398[with-refs]',
  '[with-refs]' + [
    text('Foreground video', 32, 64, 42),
    text('Background refs', 928, 74, 34),
    text('+', 886, 342, 52, '0x246C5B'),
    'format=rgba',
    'split=2[refs-intro][refs-return]',
  ].join(','),
  '[refs-intro]fade=t=out:st=2.35:d=0.75:alpha=1[intro]',
  '[refs-return]fade=t=in:st=8.75:d=1.25:alpha=1[return]',
  '[4:v][intro]overlay=0:0[base-intro]',
  '[base-intro][return]overlay=0:0[base]',
  `[base][window]overlay=x='32*(1-(${progress}))':y='140*(1-(${progress}))'[expanded]`,
  '[expanded]' + [
    text('FreeCHROMA', 28, 24, 38, 'white', ":box=1:boxcolor=0x13201C@0.5:boxborderw=12:enable='between(t,3.8,8.8)'"),
    'format=yuv420p',
  ].join(',') + '[out]',
].join(';');

run([
  '-stream_loop', '-1', '-i', path.join(source, 'fg.mp4'),
  '-stream_loop', '-1', '-i', path.join(source, 'ours.mp4'),
  '-loop', '1', '-framerate', '16', '-i', path.join(source, 'ref0.jpg'),
  '-loop', '1', '-framerate', '16', '-i', path.join(source, 'ref1.jpg'),
  '-f', 'lavfi', '-i', `color=c=0xF3F6F2:s=1280x720:r=16:d=${duration}`,
  '-filter_complex', filters,
  '-map', '[out]', '-t', String(duration), '-r', '16', '-an',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '23',
  '-profile:v', 'main', '-level:v', '3.1', '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart', video,
]);
run(['-ss', '1', '-i', video, '-frames:v', '1', '-q:v', '2', poster]);
require('./render-freechroma-fallback.cjs')({ ffmpeg, video, fallback, sharpPath: process.argv[3] })
  .then(() => console.log(JSON.stringify({ video, poster, fallback, bytes: fs.statSync(video).size }, null, 2)))
  .catch(error => { console.error(error); process.exitCode = 1; });
