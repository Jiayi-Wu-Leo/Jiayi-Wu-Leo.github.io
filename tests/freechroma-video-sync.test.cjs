const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

// Exercise the shipped controller with controllable media clocks. Real devices
// decide when decode/seek finishes; timers would make these regressions flaky.
const source = readFileSync(new URL('../freechroma/assets/main.js', `file://${__filename}`), 'utf8');
const controller = source.slice(source.indexOf('  class VideoGroup {'), source.indexOf('\n  function renderGroup('));
const context = vm.createContext({ document: { hidden: false }, modalOpen: false });
const VideoGroup = vm.runInContext(`${controller}\nVideoGroup`, context);

function media(time = 1) {
  let currentTime = time;
  return {
    paused: false, ended: false, seeking: false, readyState: 4,
    duration: 5, playbackRate: 1, _fullyFetched: true,
    seeks: 0, plays: 0,
    get currentTime() { return currentTime; },
    set currentTime(value) {
      currentTime = value;
      this.seeks++;
      this.seeking = true;
      this.readyState = 2;
    },
    pause() { this.paused = true; },
    play() { this.paused = false; this.plays++; return Promise.resolve(); },
    decoded() { this.seeking = false; this.readyState = 4; }
  };
}

function group(videos) {
  return Object.assign(Object.create(VideoGroup.prototype), {
    videos, active: true, playing: true, running: true, speed: 1,
    time: 1, duration: 5, failed: new Set(), alignPending: false,
    onAdvance() { this.advanced = true; },
    setLoading(value) { this.loading = value; },
    updateSliders() {},
    lastSync: 0
  });
}

test('a fully downloaded but stalled decoder pauses the whole group', () => {
  const master = media(2), follower = media(1.98);
  follower.readyState = 2;
  const g = group([master, follower]);
  g.sync();
  assert.equal(g.running, false);
  assert.equal(master.paused, true);
  assert.equal(follower.paused, true);
  assert.equal(g.loading, true);
  assert.equal(g.time, 2);
  follower.decoded();
  g.sync();
  assert.equal(g.running, true);
  assert.equal(master.plays, 1);
  assert.equal(follower.plays, 1);
});

test('large drift seeks once and waits for every decoder before resuming', () => {
  const master = media(2), follower = media(1.2), third = media(1.5);
  const g = group([master, follower, third]);
  g.sync();
  assert.equal(g.running, false);
  assert.equal(follower.currentTime, 2);
  assert.equal(third.currentTime, 2);
  follower.decoded();
  g.sync();
  assert.equal(master.plays, 0);
  assert.equal(follower.seeks, 1);
  third.decoded();
  g.sync();
  assert.equal(g.running, true);
  for (const video of g.videos) assert.equal(video.plays, 1);
});

test('an independently paused video is realigned before group playback', () => {
  const master = media(2), follower = media(1.9);
  follower.paused = true;
  const g = group([master, follower]);
  g.sync();
  assert.equal(master.paused, true);
  assert.equal(follower.currentTime, 2);
  assert.equal(follower.plays, 0);
  follower.decoded();
  g.sync();
  assert.equal(master.plays, 1);
  assert.equal(follower.plays, 1);
});

test('normal small drift uses rate correction without seeks', () => {
  const master = media(2), follower = media(1.92);
  const g = group([master, follower]);
  g.tick(200);
  assert.equal(g.running, true);
  assert.equal(follower.seeks, 0);
  assert.equal(master.paused, false);
  assert.ok(follower.playbackRate > 1 && follower.playbackRate <= 1.06);
});

test('a shorter ended clip stays ended while the other clips finish', () => {
  const master = media(4.7), follower = media(4.4);
  follower.ended = true;
  follower.paused = true;
  const g = group([master, follower]);
  g.sync();
  assert.equal(follower.seeks, 0);
  assert.equal(follower.plays, 0);
  assert.equal(g.running, true);
  assert.equal(g.advanced, undefined);
});

test('backgrounding pauses the group, then foregrounding realigns it', () => {
  const master = media(2), follower = media(1.9);
  const g = group([master, follower]);
  context.document.hidden = true;
  g.sync();
  assert.equal(master.paused, true);
  assert.equal(follower.paused, true);
  context.document.hidden = false;
  // A resume must align even when its drift is below the hard recovery limit.
  g.sync();
  assert.equal(follower.currentTime, 2);
  follower.decoded();
  g.sync();
  assert.equal(g.running, true);
});
