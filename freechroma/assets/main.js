(() => {
  "use strict";

  const data = window.FREECHROMA_DATA;
  const config = window.FREECHROMA_CONFIG || {};
  if (!data) return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const basename = (asset) => asset.src.split("/").pop().replace(/\.[^.]+$/, "");
  const output = (sample) => sample.figures.find(asset => basename(asset) === "ours");
  const references = (sample) => sample.figures.filter(asset => asset.type === "image");
  const resultVideos = (sample) => sample.figures.filter(asset =>
    asset.type === "video" && !["fg", "control", "gt"].includes(basename(asset))
  );
  function referenceTilt(asset) {
    // Stable variation per image avoids a new pose each time a gallery cycles.
    let hash = 2166136261;
    for (const character of asset.src) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    const angle = (2.5 + ((hash >>> 1) % 21) / 10) * (hash & 1 ? 1 : -1);
    return `--reference-angle: ${angle.toFixed(1)}deg`;
  }
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const compactLayout = window.matchMedia("(max-width: 640px), (max-width: 980px) and (pointer: coarse)");
  // Landscape tablets can be wider than the mobile layout while still sharing
  // a limited video decoder budget. Include touch when a trackpad is attached.
  const tabletGallery = window.matchMedia("(min-width: 641px) and (max-width: 1440px) and (any-pointer: coarse)");
  const focusedGallery = () => compactLayout.matches || tabletGallery.matches;
  const saveData = Boolean(navigator.connection?.saveData);
  let allStopped = reducedMotion.matches || saveData;
  let modalOpen = false;
  const groups = new Map();
  // Reuse only the currently selected comparison/ablation sample when a phone
  // changes methods or rotates. A new sample releases the previous cache.
  const galleryMediaCaches = new Map();
  const interactingGalleries = new Set();
  const downloadQueue = [];
  let activeDownloads = 0;

  // Bound network concurrency and finish each short clip before decoding it.
  // Browsers otherwise make different choices about paused-video preloading.
  function downloadVideo(url, signal, onProgress) {
    return new Promise((resolve, reject) => {
      const job = { url, signal, onProgress, resolve, reject };
      downloadQueue.push(job);
      const abort = () => {
        const index = downloadQueue.indexOf(job);
        if (index !== -1) {
          downloadQueue.splice(index, 1);
          reject(new DOMException("Video replaced", "AbortError"));
        }
      };
      signal.addEventListener("abort", abort, { once: true });
      job.cleanup = () => signal.removeEventListener("abort", abort);
      pumpDownloads();
    });
  }

  function pumpDownloads() {
    while (activeDownloads < 3 && downloadQueue.length) {
      const job = downloadQueue.shift();
      job.cleanup();
      if (job.signal.aborted) {
        job.reject(new DOMException("Video replaced", "AbortError"));
        continue;
      }
      activeDownloads++;
      fetch(job.url, { signal: job.signal, priority: "low" })
        .then(async response => {
          if (!response.ok) throw new Error(`Video request failed (${response.status})`);
          const total = Number(response.headers.get("Content-Length"));
          if (!response.body || !total) return response.blob();
          const reader = response.body.getReader();
          const chunks = [];
          let received = 0;
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.byteLength;
            job.onProgress(Math.min(1, received / total));
          }
          return new Blob(chunks, { type: response.headers.get("Content-Type") || "video/mp4" });
        })
        .then(job.resolve, job.reject)
        .finally(() => {
          activeDownloads--;
          pumpDownloads();
        });
    }
  }

  // Load only the selected examples when visible. Keep their buffers while
  // scrolling; release them when a different example replaces the group.
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const group = groups.get(entry.target.id);
      if (!group) return;
      clearTimeout(group.mountTimer);
      if (entry.isIntersecting) group.mountTimer = setTimeout(() => group.mount(), 120);
      else group.suspend();
    });
  }, { threshold: 0.01 });

  function reserveInputSpace(element) {
    const inputs = $(".comparison-inputs", element);
    const row = inputs && $(".input-row", inputs);
    if (!row) return () => {};
    const measure = () => {
      if (!row.isConnected) return;
      if (compactLayout.matches) {
        inputs.style.removeProperty("--input-row-height");
        return;
      }
      const figure = $(".media-figure", row);
      const frame = $(".media-frame", figure);
      const caption = $(".media-caption", figure);
      const plus = $(".input-plus", row);
      const rowStyle = getComputedStyle(row);
      const figureStyle = getComputedStyle(figure);
      const plusStyle = getComputedStyle(plus);
      const captionStyle = getComputedStyle(caption);
      const gap = parseFloat(rowStyle.columnGap) || 0;
      const plusWidth = plus.getBoundingClientRect().width +
        (parseFloat(plusStyle.marginLeft) || 0) + (parseFloat(plusStyle.marginRight) || 0);
      const width = Math.min(parseFloat(figureStyle.maxWidth) || Infinity,
        Math.max(0, (row.clientWidth - gap * 2 - plusWidth) / 2));
      const frameBox = frame.getBoundingClientRect();
      if (!frameBox.width) return;
      const [ratioWidth, ratioHeight] = getComputedStyle(frame).aspectRatio.split("/").map(Number);
      const ratio = ratioWidth > 0 && ratioHeight > 0
        ? ratioHeight / ratioWidth : frameBox.height / frameBox.width;
      // Reserve the height of the largest, two-input arrangement. The inner
      // row keeps its natural height, so its plus sign still follows the images.
      const height = Math.ceil(width * ratio +
        caption.getBoundingClientRect().height + (parseFloat(captionStyle.marginTop) || 0));
      const value = `${height}px`;
      if (inputs.style.getPropertyValue("--input-row-height") !== value) {
        inputs.style.setProperty("--input-row-height", value);
      }
    };
    measure();
    const resizeObserver = window.ResizeObserver ? new ResizeObserver(measure) : null;
    if (resizeObserver) resizeObserver.observe(row);
    else window.addEventListener("resize", measure);
    compactLayout.addEventListener("change", measure);
    return () => {
      resizeObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener("resize", measure);
      compactLayout.removeEventListener("change", measure);
    };
  }

  class VideoGroup {
    constructor(element, previous) {
      this.element = element;
      this.videos = $$("video[data-src]", element);
      this.mediaCache = galleryMediaCaches.get(element.id)?.blobs;
      this.active = false;
      this.loaded = false;
      this.userRequestedData = false;
      this.destroyed = false;
      this.playing = previous?.playing ?? !allStopped;
      this.running = false;
      this.speed = previous?.speed ?? 1;
      this.time = previous?.time || 0;
      this.duration = previous?.duration || 5.0625;
      this.lastSync = 0;
      this.alignPending = true;
      this.onCycle = null;
      this.onAdvance = null;
      this.completion = null;
      this.waitingSince = null;
      this.failed = new Set();
      this.downloads = new AbortController();
      this.sliders = $$(`[data-seek="${element.id}"]`);
      const playButton = document.createElement("button");
      playButton.type = "button";
      playButton.className = "video-start";
      playButton.dataset.play = element.id;
      playButton.innerHTML = '<span class="sr-only">Play</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z" fill="currentColor"/></svg>';
      $(".media-frame", element).appendChild(playButton);
      this.playButtons = [playButton];
      this.loading = document.createElement("div");
      this.loading.className = "video-loading";
      this.loading.hidden = true;
      this.loading.innerHTML = '<span role="status">Loading videos…</span><progress max="100" value="0" aria-label="Video loading progress"></progress>';
      element.appendChild(this.loading);
      this.videos.forEach(video => {
        video.muted = true;
        // Restart the whole group together instead of letting each clip loop.
        video.loop = false;
        video.onloadedmetadata = () => {
          if (this.destroyed) return;
          if (video === this.master() && Number.isFinite(video.duration) && video.duration > 0) {
            this.duration = video.duration;
            this.time %= this.duration;
          }
          this.sync();
        };
        video.onloadeddata = () => {
          video.classList.add("is-ready");
          this.sync();
        };
        video.onprogress = video.oncanplay = video.oncanplaythrough = video.onseeked = () => this.sync();
        video.onwaiting = () => this.sync();
        video.onended = () => {
          if (this.active && this.playing && (this.onAdvance || video === this.master())) this.finishCycle();
        };
        video.onerror = () => {
          if (this.destroyed || !video.getAttribute("src")) return;
          this.failed.add(video);
          const message = $(".video-error", video.parentElement);
          if (message) message.hidden = false;
          this.sync();
        };
      });
      groups.set(element.id, this);
      observer.observe(element);
      this.releaseInputSpace = reserveInputSpace(element);
      this.updateButtons();
    }

    mount() {
      if (this.destroyed || (this.active && this.loaded)) return;
      this.active = true;
      if (!this.loaded && (!saveData || this.playing || this.userRequestedData)) {
        this.loaded = true;
        this.videos.forEach(video => {
          video.preload = this.playing ? "auto" : "metadata";
          if (location.protocol === "file:") {
            video.src = video.dataset.src;
            video.load();
            return;
          }
          video._downloadProgress = 0;
          const load = this.element.id === "hero-stage" ? loadHeroVideo : downloadVideo;
          const cached = this.mediaCache?.get(video.dataset.src);
          const pending = cached ? Promise.resolve(cached) : load(video.dataset.src, this.downloads.signal, fraction => {
            video._downloadProgress = fraction;
          });
          pending.then(blob => {
            if (this.destroyed) return;
            this.mediaCache?.set(video.dataset.src, blob);
            video._downloadProgress = 1;
            video._fullyFetched = true;
            video._blobURL = URL.createObjectURL(blob);
            video.src = video._blobURL;
            video.load();
          }).catch(error => {
            if (this.destroyed || error.name === "AbortError") return;
            this.failed.add(video);
            const message = $(".video-error", video.parentElement);
            if (message) message.hidden = false;
            this.sync();
          });
        });
      }
      this.sync();
    }

    suspend() {
      this.freeze();
      this.active = false;
      this.alignPending = true;
      if (this.completion) this.completion.lastTick = null;
      this.setLoading(false);
    }

    destroy() {
      this.destroyed = true;
      clearTimeout(this.mountTimer);
      this.entrance?.cancel();
      this.releaseInputSpace?.();
      this.downloads.abort();
      this.onCycle = null;
      this.onAdvance = null;
      this.completion = null;
      observer.unobserve(this.element);
      this.suspend();
      this.videos.forEach(video => {
        video.onloadedmetadata = null;
        video.onloadeddata = null;
        video.onprogress = video.oncanplay = video.oncanplaythrough = video.onseeked = null;
        video.onwaiting = video.onended = null;
        video.onerror = null;
        if (video.hasAttribute("src")) {
          video.removeAttribute("src");
          video.load();
        }
        if (video._blobURL) URL.revokeObjectURL(video._blobURL);
      });
      groups.delete(this.element.id);
    }

    master() {
      return this.videos.find(video => !this.failed.has(video));
    }

    finishCycle() {
      if (this.destroyed || !this.active || !this.playing || document.hidden || modalOpen) return;
      if (this.completion) return;
      if (this.onAdvance) {
        // Let every result reach its final frame, including clips slightly
        // behind the shared foreground clock. Never restart an ended pane.
        if (!this.videos.filter(video => !this.failed.has(video)).every(video => video.ended)) return;
        this.freeze();
        this.time = this.duration;
        this.alignPending = false;
        let hasOutcome = false;
        this.videos.forEach(video => {
          const badge = $(".task-outcome", video.parentElement);
          if (badge && video.ended && !this.failed.has(video)) {
            badge.hidden = false;
            hasOutcome = true;
          }
        });
        this.completion = { remaining: hasOutcome ? 2000 : 0, lastTick: null };
        this.setLoading(false);
        this.updateSliders();
        return;
      }
      if (this.onCycle?.()) return;
      this.seek(0);
    }

    freeze() {
      if (this.running && this.master()) this.time = this.master().currentTime;
      this.running = false;
      this.videos.forEach(video => {
        if (!video.paused) video.pause();
        if (video.playbackRate !== this.speed) video.playbackRate = this.speed;
      });
    }

    align() {
      let pending = false;
      this.videos.forEach(video => {
        if (this.failed.has(video)) return;
        if (video.readyState < 1 || !Number.isFinite(video.duration) || video.seeking) {
          pending = true;
          return;
        }
        const target = Math.min(this.time, Math.max(0, video.duration - 0.025));
        // Only seek for an explicit timeline change, a resume, or a loop.
        // Never chase a wall clock while the network is still loading.
        if (Math.abs(video.currentTime - target) > 0.025) {
          video.currentTime = target;
          pending = true;
        }
      });
      this.alignPending = pending;
    }

    bufferedForPlayback(video) {
      // An ended result has no future frame to decode; let longer peers finish.
      if (this.onAdvance && video.ended) return true;
      // A downloaded Blob is not necessarily decoded. HAVE_CURRENT_DATA (2)
      // only guarantees one frame; wait for future frames after a decoder stall.
      if (video._fullyFetched) return video.readyState >= 3 && !video.seeking;
      if (video.readyState < 3 || video.seeking || !Number.isFinite(video.duration)) return false;
      // For direct file previews, honor a browser that has finished preloading.
      if (video.readyState === 4 && video.networkState === 1) return true;
      // The gallery clips are short. Buffer a complete loop once so a slow
      // connection causes one initial wait instead of repeated interruptions.
      const shortClip = video.duration <= 12;
      const start = shortClip ? 0 : video.currentTime;
      const end = shortClip ? video.duration : Math.min(video.duration, start + 2 * this.speed);
      for (let index = 0; index < video.buffered.length; index++) {
        if (video.buffered.start(index) <= start + 0.05 && video.buffered.end(index) >= end - 0.08) return true;
      }
      return false;
    }

    setLoading(waiting) {
      if (waiting) this.waitingSince ??= performance.now();
      else this.waitingSince = null;
      this.element.setAttribute("aria-busy", String(waiting));
      // Brief seeks at a loop boundary should not flash a loading indicator.
      this.loading.hidden = !waiting || performance.now() - this.waitingSince < 180;
      if (this.loading.hidden) return;
      const videos = this.videos.filter(video => !this.failed.has(video));
      const fraction = videos.reduce((total, video) => {
        if (video._downloadProgress !== undefined) return total + video._downloadProgress;
        if (!Number.isFinite(video.duration) || !video.duration) return total;
        let buffered = 0;
        for (let index = 0; index < video.buffered.length; index++) {
          buffered += video.buffered.end(index) - video.buffered.start(index);
        }
        return total + Math.min(1, buffered / video.duration);
      }, 0) / Math.max(1, videos.length);
      $("progress", this.loading).value = Math.round(fraction * 100);
    }

    sync() {
      if (this.destroyed) return;
      if (this.completion) {
        this.freeze();
        if (!this.active || !this.playing || document.hidden || modalOpen) this.completion.lastTick = null;
        this.setLoading(false);
        return;
      }
      if (!this.active || !this.playing || this.holdPlayback || document.hidden || modalOpen) {
        if (this.running) this.alignPending = true;
        this.freeze();
        if (this.active && this.alignPending) this.align();
        this.setLoading(false);
        return;
      }
      const videos = this.videos.filter(video => !this.failed.has(video));
      if (!videos.length) {
        this.freeze();
        this.setLoading(false);
        return;
      }
      if (!this.alignPending && (this.onAdvance ? videos.every(video => video.ended) : this.master().ended)) {
        this.finishCycle();
        return;
      }
      const master = this.master();
      if (this.running && !master.ended && !videos.some(video => video._playPending) &&
          videos.some(video => !video.ended && (video.paused ||
            Math.abs(video.currentTime - master.currentTime) > 0.2))) {
        // Rate nudges cannot recover a large decoder delay promptly. Pause the
        // entire group, align it once, then wait for every seek/decode to finish.
        this.freeze();
        this.alignPending = true;
      }
      if (this.alignPending) this.align();
      if (this.alignPending || !videos.every(video => this.bufferedForPlayback(video))) {
        if (this.running) {
          this.freeze();
          this.alignPending = true;
        }
        this.setLoading(true);
        return;
      }
      this.setLoading(false);
      this.running = true;
      videos.forEach(video => {
        if (this.onAdvance && video.ended) return;
        if (video.paused && !video._playPending) {
          video.playbackRate = this.speed;
          video._playPending = true;
          video.play().catch(error => {
            if (error.name === "NotAllowedError" && this.active && !modalOpen) this.setPlaying(false);
          }).finally(() => { video._playPending = false; });
        }
      });
    }

    setPlaying(playing) {
      this.freeze();
      this.playing = playing;
      this.alignPending = true;
      if (playing) {
        this.videos.forEach(video => { video.preload = "auto"; });
        if (this.active && !this.loaded) this.mount();
      }
      this.sync();
      this.updateButtons();
      updatePlaybackState();
    }

    seek(ratio) {
      this.freeze();
      this.completion = null;
      $$(".task-outcome", this.element).forEach(badge => { badge.hidden = true; });
      this.time = Math.max(0, Math.min(0.999, ratio)) * this.duration;
      this.alignPending = true;
      if (this.active && !this.loaded) {
        this.userRequestedData = true;
        this.mount();
      }
      this.sync();
      this.updateSliders();
    }

    updateButtons() {
      this.playButtons.forEach(button => {
        button.hidden = this.playing;
        $(".sr-only", button).textContent = this.playing ? "Pause" : "Play";
        const label = this.element.getAttribute("aria-label") || this.element.id.replace("-stage", "");
        button.setAttribute("aria-label", `${this.playing ? "Pause" : "Play"} ${label} videos`);
      });
    }

    updateSliders() {
      this.sliders.forEach(slider => {
        if (!slider.matches(":active")) slider.value = Math.round(this.time / this.duration * 1000);
        slider.setAttribute("aria-valuetext", `${this.time.toFixed(1)} of ${this.duration.toFixed(1)} seconds`);
      });
    }

    tick(now) {
      if (this.completion) {
        const completion = this.completion;
        if (!this.active || !this.playing || this.holdPlayback || document.hidden || modalOpen ||
            interactingGalleries.has(this.element.id)) {
          completion.lastTick = null;
          return;
        }
        if (completion.lastTick !== null) completion.remaining -= Math.min(250, now - completion.lastTick);
        completion.lastTick = now;
        if (completion.remaining <= 0) this.onAdvance?.();
        return;
      }
      if (!this.active || document.hidden || modalOpen) return;
      if (now - this.lastSync > 100) {
        this.sync();
        if (this.destroyed) return;
        const master = this.master();
        if (this.running && master && !master.seeking) {
          this.time = master.currentTime;
          this.videos.forEach(video => {
            if (this.failed.has(video) || video.seeking || video.ended) return;
            const drift = this.time - video.currentTime;
            // Small rate corrections keep frames together without repeatedly
            // seeking and discarding frames that are already decoded.
            const correction = !master.ended && Math.abs(drift) > 0.04 ? Math.max(-0.06, Math.min(0.06, drift * 0.3)) : 0;
            const rate = video === master ? this.speed : this.speed * (1 + correction);
            if (Math.abs(video.playbackRate - rate) > 0.002) video.playbackRate = rate;
          });
        }
        this.updateSliders();
        this.lastSync = now;
      }
    }
  }

  function renderGroup(id, html, selectId, options = {}) {
    const root = document.getElementById(id);
    const previous = groups.get(id);
    const wasActive = previous?.active;
    const state = previous ? {
      playing: previous.playing, speed: previous.speed,
      time: options.preserveTime ? previous.master()?.currentTime || previous.time : 0,
      duration: options.preserveTime ? previous.duration : undefined
    } : null;
    previous?.destroy();
    root.innerHTML = html;
    const group = new VideoGroup(root, state);
    if (selectId) group.onAdvance = () => {
      const select = document.getElementById(selectId);
      select.selectedIndex = (select.selectedIndex + 1) % select.options.length;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    };
    if (selectId && wasActive) {
      // Only the newly selected, visible group is warmed. Initial offscreen
      // galleries keep lazy images and do not download their video sources.
      $$("img", root).filter(image => !image.closest("[hidden]")).forEach(image => { image.loading = "eager"; });
      group.mount();
      if (!reducedMotion.matches && !document.hidden && !modalOpen && root.animate) {
        group.entrance = root.animate([{ opacity: .65 }, { opacity: 1 }], {
          duration: 180, easing: "ease-out"
        });
        group.entrance.finished.catch(() => {});
      }
    }
  }

  function updatePlaybackState() {
    const playing = [...groups.values()].some(group => group.playing);
    allStopped = !playing;
  }

  function taskOutcomeBadge(outcome) {
    if (outcome !== "success" && outcome !== "failure") return "";
    const label = outcome === "success" ? "Success" : "Failure";
    return `<span class="task-outcome task-${outcome}" role="status" aria-label="Task execution: ${label.toLowerCase()}" hidden><span aria-hidden="true">${outcome === "success" ? "✓" : "×"}</span>${label}</span>`;
  }

  function figure(asset, label = asset.label, options = {}) {
    const ours = options.ours || false;
    const isReference = asset.type === "image";
    const overlay = options.foreground && !options.inactive ? `
      <div class="foreground-overlay" aria-hidden="true">
        <img class="overlay-poster" src="${escape(options.foreground.poster)}" alt="" width="640" height="360" loading="lazy">
        <canvas class="foreground-canvas" width="640" height="360"></canvas>
      </div>
      <div class="overlay-divider" aria-hidden="true"><span>↔</span></div>
      <input class="overlay-scrubber" type="range" min="0" max="100" step="1" value="50" data-overlay-slider aria-label="Compare input foreground with ${escape(label)}" aria-describedby="overlay-help">
    ` : "";
    const media = asset.type === "video"
      ? `<img class="poster" src="${escape(asset.poster)}" alt="" aria-hidden="true" width="640" height="360" decoding="async" loading="lazy">
         ${options.inactive ? "" : `<video data-src="${escape(asset.src)}" muted playsinline preload="none" aria-label="${escape(label)}"></video>`}
         <span class="video-error" hidden>Video could not load. The preview is shown.</span>`
      : `<img class="single-image" src="${escape(asset.src)}" alt="${escape(label)}" width="640" height="360" decoding="async" loading="lazy">`;
    return `<figure class="media-figure ${ours ? "result-ours" : ""} ${options.foreground ? "overlay-figure" : ""} ${escape(options.className || "")}"${options.inactive ? " hidden" : ""}>
      <div class="media-frame${isReference ? " reference-frame" : ""}"${isReference ? ` style="${referenceTilt(asset)}"` : ""}>
        ${isReference ? `<div class="reference-visual">${media}</div>` : media}
        ${overlay}
        ${taskOutcomeBadge(options.outcome)}
        ${options.inset && asset.inset ? `<img class="inset" src="${escape(asset.inset)}" alt="Background reference" loading="lazy">` : ""}
        <button type="button" class="expand-media" ${asset.type === "video" ? "data-video" : "data-image"}="${escape(asset.src)}" data-poster="${escape(asset.poster || "")}" data-caption="${escape(label)}"${options.outcome ? ` data-outcome="${escape(options.outcome)}"` : ""} aria-label="Expand ${escape(label)}"><span aria-hidden="true">⤢</span></button>
      </div>
      <figcaption class="media-caption"><${ours ? "strong" : "span"}>${options.shortLabel ? `<span class="full-label">${escape(label)}</span><span class="compact-label">${escape(options.shortLabel)}</span>` : escape(label)}</${ours ? "strong" : "span"}>${ours && options.badge !== false ? '<span class="ours-badge">Ours</span>' : ""}</figcaption>
      ${options.description ? `<p class="media-explanation">${escape(options.description)}</p>` : ""}
    </figure>`;
  }

  function inputs(sample) {
    const images = references(sample);
    return `<div class="comparison-inputs" data-input-count="${images.length + 1}"><div class="input-row">
      ${figure(sample.figures[0], "Masked foreground", { shortLabel: "Foreground" })}
      <span class="input-plus" aria-hidden="true">+</span>
      ${images.map((asset, index, list) => figure(asset, `Background reference${list.length > 1 ? ` ${index + 1}` : ""}`, { shortLabel: `Reference${list.length > 1 ? ` ${index + 1}` : ""}` })).join("")}
    </div></div>`;
  }

  function updateCaseCounter(selectId, counterId) {
    const select = document.getElementById(selectId);
    document.getElementById(counterId).textContent =
      `${String(select.selectedIndex + 1).padStart(2, "0")} / ${String(select.options.length).padStart(2, "0")}`;
  }

  function createThumbnailStrip(containerId, selectId, items) {
    const container = document.getElementById(containerId);
    container.innerHTML = items.map((item, index) => `
      <button type="button" class="sample-thumb" data-pick-for="${escape(selectId)}" data-value="${escape(item.value)}" aria-pressed="false" aria-label="View ${escape(item.label)}" title="${escape(item.label)}">
        <span class="sample-thumb-image"><img src="${escape(item.poster)}" alt="" width="160" height="90" loading="lazy" decoding="async"><span>${String(index + 1).padStart(2, "0")}</span></span>
      </button>
    `).join("");
  }

  function updateThumbnailStrip(containerId, selectId) {
    const container = document.getElementById(containerId);
    const value = document.getElementById(selectId).value;
    let selected = null;
    $$("[data-pick-for]", container).forEach(button => {
      const active = button.dataset.value === value;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
      if (active) selected = button;
    });
    if (selected) {
      const left = selected.offsetLeft - (container.clientWidth - selected.offsetWidth) / 2;
      container.scrollTo({ left: Math.max(0, left), behavior: "instant" });
    }
  }

  // Move controls, rather than the media, to preserve decoding and playback
  // when a phone rotates or the browser crosses the compact breakpoint.
  function updateGalleryLayout() {
    $$(".gallery-panel").forEach(panel => {
      const stage = $(".video-group", panel);
      const navigation = $(".gallery-navigation", panel);
      if (compactLayout.matches) panel.insertBefore(navigation, stage);
      else stage.after(navigation);
    });
  }
  compactLayout.addEventListener("change", updateGalleryLayout);
  updateGalleryLayout();

  const heroIds = ["s13", "s6", "s4", "s1", "s11", "s14", "s21", "s23", "s24"];
  const heroRevealTiming = {
    settle: 180, keyPress: 200, referenceDelay: 50,
    referencePulse: 800, revealDelay: 100, revealDuration: 1300
  };
  let heroIndex = 0;
  let heroOverlay = null;
  let heroAutoPending = !reducedMotion.matches;
  let heroOverlayAmount = reducedMotion.matches ? 0 : 100;
  let heroPlaysCompleted = 0;
  let heroScrubbing = false;
  let heroPreparation = null;
  let heroTransition = null;
  const heroVideoCache = new Map();

  // Reuse compressed clips as each sample enters the playlist, while only
  // decoding the visible pair and preparing the next sample.
  function loadHeroVideo(url, signal, onProgress) {
    if (heroVideoCache.has(url)) return Promise.resolve(heroVideoCache.get(url));
    const prepared = heroPreparation?.loads.get(url);
    if (prepared && !heroPreparation.failed && !heroPreparation.controller.signal.aborted) {
      onProgress(prepared.progress);
      prepared.listeners.add(onProgress);
      return prepared.promise.finally(() => prepared.listeners.delete(onProgress));
    }
    return downloadVideo(url, signal, onProgress).then(blob => {
      heroVideoCache.set(url, blob);
      return blob;
    });
  }

  function prepareHero(index) {
    if (heroPreparation?.index === index) return heroPreparation;
    heroPreparation?.controller.abort();
    const preparation = {
      index, controller: new AbortController(), loads: new Map(), ready: false, failed: false
    };
    heroPreparation = preparation;
    if (location.protocol === "file:") {
      preparation.ready = true;
      return preparation;
    }
    const sample = data.comparisons.find(item => item.id === heroIds[index]);
    const videos = [sample.figures.find(asset => basename(asset) === "fg"), output(sample)];
    const tasks = videos.map(asset => {
      const entry = { progress: heroVideoCache.has(asset.src) ? 1 : 0, listeners: new Set() };
      entry.promise = heroVideoCache.has(asset.src)
        ? Promise.resolve(heroVideoCache.get(asset.src))
        : downloadVideo(asset.src, preparation.controller.signal, fraction => {
            entry.progress = fraction;
            entry.listeners.forEach(listener => listener(fraction));
          }).then(blob => {
            heroVideoCache.set(asset.src, blob);
            return blob;
          });
      preparation.loads.set(asset.src, entry);
      return entry.promise;
    });
    // Warm the next posters and references too, so the new inputs never start
    // with an empty frame while the browser attaches the cached video blobs.
    tasks.push(...[...videos.map(asset => asset.poster), ...references(sample).map(asset => asset.src)].map(src =>
      new Promise(resolve => {
        const image = new Image();
        image.onload = image.onerror = resolve;
        image.src = src;
      })
    ));
    Promise.all(tasks).then(() => { preparation.ready = true; }).catch(error => {
      if (error.name !== "AbortError") preparation.failed = true;
    });
    return preparation;
  }

  function tickHeroPlaylist() {
    const group = groups.get("hero-stage");
    if (!group || heroTransition) return;
    if (!group.active || !group.playing || document.hidden || modalOpen) {
      if (heroPreparation && heroPreparation.index !== heroIndex && !heroPreparation.ready) {
        heroPreparation.controller.abort();
        heroPreparation = null;
      }
      return;
    }
    if (group.running && (!saveData || heroPlaysCompleted > 0)) {
      prepareHero((heroIndex + 1) % heroIds.length);
    }
  }

  function onHeroCycle(group) {
    if (heroScrubbing || heroAutoPending || heroOverlay?.isRevealing()) return false;
    if (heroPlaysCompleted === 0) {
      heroPlaysCompleted = 1;
      group.seek(0);
      heroOverlay.showResult();
      return true;
    }
    const nextIndex = (heroIndex + 1) % heroIds.length;
    const preparation = prepareHero(nextIndex);
    if (preparation.ready || preparation.failed) {
      stepHero(1);
    } else {
      group.freeze();
      group.setLoading(true);
      $("span", group.loading).textContent = "Loading next example…";
      const progress = [...preparation.loads.values()];
      $("progress", group.loading).value = Math.round(
        100 * progress.reduce((sum, entry) => sum + entry.progress, 0) / Math.max(1, progress.length)
      );
    }
    return true;
  }

  function updateHeroOverlay(value) {
    heroOverlayAmount = Math.round(Math.max(0, Math.min(100, value)) * 100) / 100;
    const stage = $("#hero-stage");
    stage.style.setProperty("--overlay-position", `${heroOverlayAmount}%`);
    stage.classList.toggle("is-result-only", heroOverlayAmount === 0);
    stage.classList.toggle("is-foreground-only", heroOverlayAmount === 100);
    const slider = $("[data-hero-overlay-slider]", stage);
    slider.value = Math.round(heroOverlayAmount);
    slider.setAttribute("aria-valuetext", `${Math.round(heroOverlayAmount)}% input foreground`);
  }

  function bindHeroOverlay(stage) {
    stage.style.setProperty("--reference-delay", `${heroRevealTiming.referenceDelay}ms`);
    stage.style.setProperty("--reference-duration", `${heroRevealTiming.referencePulse}ms`);
    const slider = $("[data-hero-overlay-slider]", stage);
    const showcase = stage.closest(".hero-showcase");
    const compose = $("[data-hero-compose]", stage);
    const group = groups.get(stage.id);
    const videos = $$("video", stage);
    const images = $$(".hero-video-layer > .poster, .hero-references img", stage);
    const frame = $(".hero-output .media-frame", stage);
    const handle = $(".overlay-divider > span", stage);
    const hint = $("#hero-overlay-hint", showcase);
    let frameVisible = false;
    let keyVisible = false;
    let readySince = null;
    let startedAt = null;
    let revealFrom = heroOverlayAmount;
    let automaticReveal = false;

    const visibilityObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const visible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
        if (entry.target === frame) frameVisible = visible;
        if (entry.target === compose) keyVisible = visible;
      });
      if (!frameVisible || !keyVisible) readySince = null;
    }, { threshold: 0.5 });
    if (heroAutoPending) {
      visibilityObserver.observe(frame);
      visibilityObserver.observe(compose);
    }

    function cancelAutoReveal() {
      heroAutoPending = false;
      readySince = null;
      visibilityObserver.disconnect();
    }

    function setPhase(phase) {
      if (stage.dataset.compositionPhase !== phase) stage.dataset.compositionPhase = phase;
    }

    function setDragHint(active) {
      stage.classList.toggle("is-drag-hint", active);
      hint.classList.toggle("is-active", active);
    }

    function stopReveal(showResult = false) {
      startedAt = null;
      compose.classList.remove("is-auto-pressed");
      setDragHint(false);
      if (showResult) updateHeroOverlay(0);
      setPhase(heroOverlayAmount === 0 ? "complete" : "input");
    }

    function beginReveal(now, automatic = false) {
      cancelAutoReveal();
      if (reducedMotion.matches || heroOverlayAmount === 0) {
        stopReveal(true);
        return;
      }
      revealFrom = heroOverlayAmount;
      startedAt = now;
      automaticReveal = automatic;
      compose.classList.toggle("is-auto-pressed", automatic);
      setPhase("reveal");
    }

    // Let the key and reference activation lead the reveal by a few frames;
    // the motions overlap, with no separate waiting step between them.
    // Automatic activation never starts downloads in Save-Data mode.
    // Manual activation and dragging remain available without competing timers.
    setPhase(heroOverlayAmount === 0 ? "complete" : "input");

    const onInteraction = event => {
      if (event.target.closest("[data-hero-compose], [data-play]")) return;
      cancelAutoReveal();
      if (startedAt !== null || stage.classList.contains("is-drag-hint")) stopReveal();
    };
    const onInput = () => {
      cancelAutoReveal();
      updateHeroOverlay(Number(slider.value));
      stopReveal();
    };
    const onVisibility = () => {
      if (document.hidden) readySince = null;
      if (document.hidden && (startedAt !== null || stage.classList.contains("is-drag-hint"))) stopReveal(true);
    };
    const onReducedMotion = () => {
      if (reducedMotion.matches && (heroAutoPending || startedAt !== null || stage.classList.contains("is-drag-hint"))) {
        cancelAutoReveal();
        stopReveal(true);
      }
    };
    const onCompose = () => {
      cancelAutoReveal();
      if (!group.playing) group.setPlaying(true);
      if (!group.active) group.mount();
      if (startedAt !== null) return;
      beginReveal(performance.now());
    };
    const onHintEnd = () => setDragHint(false);
    slider.addEventListener("input", onInput);
    compose.addEventListener("click", onCompose);
    showcase.addEventListener("pointerdown", onInteraction, { passive: true });
    showcase.addEventListener("focusin", onInteraction);
    document.addEventListener("visibilitychange", onVisibility);
    reducedMotion.addEventListener("change", onReducedMotion);
    handle.addEventListener("animationend", onHintEnd);

    return {
      isRevealing() {
        return startedAt !== null;
      },
      showResult() {
        cancelAutoReveal();
        stopReveal(true);
      },
      tick(now) {
        if (heroAutoPending) {
          const ready = !heroTransition && group.active && frameVisible && keyVisible && !document.hidden && !modalOpen &&
            images.every(image => image.complete) && (saveData || (group.running &&
              videos.every(video => video.readyState >= 2 && !video.paused && !video.seeking)));
          if (!ready) readySince = null;
          else {
            readySince ??= now;
            if (now - readySince >= heroRevealTiming.settle) beginReveal(now, true);
          }
        }
        if (startedAt === null) return;
        if (document.hidden || modalOpen || !group.active || reducedMotion.matches) {
          stopReveal(true);
          return;
        }
        const elapsed = now - startedAt;
        if (elapsed >= heroRevealTiming.keyPress) compose.classList.remove("is-auto-pressed");
        const progress = Math.max(0, Math.min(1,
          (elapsed - heroRevealTiming.revealDelay) / heroRevealTiming.revealDuration));
        const eased = progress * progress * (3 - 2 * progress);
        updateHeroOverlay(revealFrom * (1 - eased));
        if (progress === 1) {
          stopReveal(true);
          if (automaticReveal && heroPlaysCompleted === 0) setDragHint(true);
        }
      },
      destroy() {
        cancelAutoReveal();
        stopReveal();
        slider.removeEventListener("input", onInput);
        compose.removeEventListener("click", onCompose);
        showcase.removeEventListener("pointerdown", onInteraction);
        showcase.removeEventListener("focusin", onInteraction);
        document.removeEventListener("visibilitychange", onVisibility);
        reducedMotion.removeEventListener("change", onReducedMotion);
        handle.removeEventListener("animationend", onHintEnd);
      }
    };
  }

  function heroFigure(sample) {
    const source = sample.figures.find(asset => basename(asset) === "fg");
    const result = output(sample);
    const layer = (asset, name, label) => `
      <div class="hero-video-layer hero-${name}-layer">
        <img class="poster" src="${escape(asset.poster)}" alt="" aria-hidden="true" width="640" height="360" decoding="async">
        <video data-src="${escape(asset.src)}" muted playsinline preload="none" aria-label="${escape(label)}"></video>
        <span class="video-error" hidden>Video could not load. The preview is shown.</span>
      </div>`;
    return `<figure class="media-figure hero-output overlay-figure" aria-label="Input foreground and generated video comparison">
      <div class="media-frame">
        ${layer(source, "input", "Input foreground video")}
        ${layer(result, "result", "FreeCHROMA generated video")}
        <div class="overlay-divider" aria-hidden="true"><span>↔</span></div>
        <div class="overlay-labels" aria-hidden="true"><span>Input foreground</span><span>Result</span></div>
        <input class="overlay-scrubber" type="range" min="0" max="100" step="1" value="100" data-hero-overlay-slider aria-label="Compare the input foreground and generated video" aria-describedby="hero-overlay-hint">
        <button type="button" class="expand-media" data-video="${escape(result.src)}" data-poster="${escape(result.poster)}" data-caption="FreeCHROMA generated video" aria-label="Expand generated video"><span aria-hidden="true">⤢</span></button>
      </div>
    </figure>`;
  }

  function renderHero() {
    const sample = data.comparisons.find(item => item.id === heroIds[heroIndex]);
    const refs = references(sample);
    const wasActive = groups.get("hero-stage")?.active;
    heroOverlay?.destroy();
    if (heroPreparation && heroPreparation.index !== heroIndex) {
      heroPreparation.controller.abort();
      heroPreparation = null;
    }
    heroPlaysCompleted = 0;
    heroAutoPending = !reducedMotion.matches;
    heroOverlayAmount = reducedMotion.matches ? 0 : 100;
    $("#hero-scene-title").textContent = sample.title;
    $("#hero-counter").textContent = `${String(heroIndex + 1).padStart(2, "0")} / ${String(heroIds.length).padStart(2, "0")}`;
    renderGroup("hero-stage", `
      ${heroFigure(sample)}
      <aside class="hero-conditioning" aria-label="Background references and FreeCHROMA">
        <div class="hero-references">
          <p class="input-label">Background reference${refs.length > 1 ? "s" : ""}</p>
          <div class="reference-images" style="--refs: ${refs.length}">${refs.map((asset, index) => `<button type="button" class="hero-reference" style="${referenceTilt(asset)}" data-image="${escape(asset.src)}" data-caption="Unaligned background reference ${index + 1}" aria-label="Expand background reference ${index + 1}"><span class="reference-visual"><img src="${escape(asset.src)}" alt="Unaligned background reference ${index + 1}" width="640" height="360" decoding="async"></span></button>`).join("")}</div>
        </div>
        <button type="button" class="hero-compose-key" data-hero-compose aria-label="Reveal the FreeCHROMA generated video">
          <strong>Free<span>CHROMA</span></strong>
          <span class="hero-return-symbol" aria-hidden="true">↵</span>
        </button>
      </aside>
    `);
    updateHeroOverlay(heroOverlayAmount);
    heroOverlay = bindHeroOverlay($("#hero-stage"));
    const group = groups.get("hero-stage");
    group.onCycle = () => onHeroCycle(group);
    group.holdPlayback = Boolean(heroTransition);
    if (wasActive) group.mount();
  }

  function heroSnapshot(stage) {
    // Freeze the outgoing pair into two small still frames. The slide adds no
    // video decoders, downloads, or continuous canvas rendering.
    const snapshot = stage.cloneNode(false);
    const template = document.createElement("template");
    template.innerHTML = stage.innerHTML;
    snapshot.appendChild(template.content);
    snapshot.removeAttribute("id");
    snapshot.classList.remove("is-drag-hint");
    snapshot.classList.add("hero-slide-outgoing");
    snapshot.setAttribute("aria-hidden", "true");
    snapshot.inert = true;
    const videos = $$("video", stage);
    $$("video", snapshot).forEach((copy, index) => {
      const video = videos[index];
      if (video.readyState >= 2 && video.videoWidth) {
        const still = document.createElement("canvas");
        still.className = "hero-transition-frame";
        still.width = Math.min(960, video.videoWidth);
        still.height = Math.round(still.width * video.videoHeight / video.videoWidth);
        try {
          still.getContext("2d", { alpha: false }).drawImage(video, 0, 0, still.width, still.height);
          copy.replaceWith(still);
          return;
        } catch (_) { /* Keep the existing poster if a frame cannot be read. */ }
      }
      copy.remove();
    });
    $$("*", snapshot).forEach(element => {
      [...element.attributes].forEach(attribute => {
        if (attribute.name === "id" || attribute.name.startsWith("data-")) element.removeAttribute(attribute.name);
      });
      if (element.matches("button, input")) element.tabIndex = -1;
    });
    $(".video-loading", snapshot)?.remove();
    return snapshot;
  }

  function stepHero(direction) {
    heroTransition?.finish();
    const stage = $("#hero-stage");
    const viewport = stage.parentElement;
    const visible = groups.get("hero-stage")?.active && !document.hidden;
    const snapshot = visible && !reducedMotion.matches && stage.animate ? heroSnapshot(stage) : null;
    heroIndex = (heroIndex + direction + heroIds.length) % heroIds.length;
    if (!snapshot) {
      renderHero();
      return;
    }
    const animations = [];
    const transition = {
      finish() {
        if (heroTransition !== transition) return;
        heroTransition = null;
        animations.forEach(animation => animation.cancel());
        snapshot.remove();
        viewport.classList.remove("is-sliding");
        delete viewport.dataset.slideDirection;
        stage.inert = false;
        const group = groups.get("hero-stage");
        group.holdPlayback = false;
        group.sync();
      }
    };
    heroTransition = transition;
    renderHero();
    stage.inert = true;
    viewport.appendChild(snapshot);
    viewport.classList.add("is-sliding");
    viewport.dataset.slideDirection = direction > 0 ? "next" : "previous";
    const distance = stage.getBoundingClientRect().width + 16;
    const options = { duration: 480, easing: "cubic-bezier(.22, 1, .36, 1)", fill: "both" };
    animations.push(
      stage.animate([{ transform: `translateX(${direction * distance}px)` }, { transform: "translateX(0)" }], options),
      snapshot.animate([{ transform: "translateX(0)" }, { transform: `translateX(${-direction * distance}px)` }], options)
    );
    Promise.all(animations.map(animation => animation.finished)).then(transition.finish, transition.finish);
  }

  $("#hero-prev").addEventListener("click", () => stepHero(-1));
  $("#hero-next").addEventListener("click", () => stepHero(1));
  window.addEventListener("resize", () => heroTransition?.finish());
  document.addEventListener("visibilitychange", () => { if (document.hidden) heroTransition?.finish(); });
  reducedMotion.addEventListener("change", () => { if (reducedMotion.matches) heroTransition?.finish(); });
  const heroShowcase = $(".hero-showcase");
  const isHeroSlider = target => target.matches("[data-hero-overlay-slider], #hero-seek");
  heroShowcase.addEventListener("pointerdown", event => {
    if (isHeroSlider(event.target)) heroScrubbing = true;
  });
  heroShowcase.addEventListener("keydown", event => {
    if (isHeroSlider(event.target) && /^(Arrow|Home|End|Page)/.test(event.key)) heroScrubbing = true;
  });
  document.addEventListener("pointerup", () => { heroScrubbing = false; });
  document.addEventListener("pointercancel", () => { heroScrubbing = false; });
  document.addEventListener("keyup", () => { heroScrubbing = false; });

  // One compact selector belongs to the same viewer as the results. Every
  // original sample stays available, in its original order, without categories.
  $("#comparison-sample").innerHTML = data.comparisons.map(sample =>
    `<option value="${escape(sample.id)}">${escape(sample.title)}</option>`
  ).join("");
  createThumbnailStrip("comparison-thumbnails", "comparison-sample", data.comparisons.map(sample => ({
    value: sample.id, label: sample.title, poster: `assets/thumbnails/${sample.id}.webp`
  })));

  let overlayAmount = 50;
  let comparisonOverlay = null;
  const mobileMethods = { comparison: 0, ablation: 0 };
  function cacheGallerySample(key, sample) {
    const id = `${key}-stage`;
    if (galleryMediaCaches.get(id)?.sample !== sample.id) {
      galleryMediaCaches.set(id, { sample: sample.id, blobs: new Map() });
    }
  }
  function methodPicker(key, alternatives) {
    const label = key === "comparison" ? "Baseline method" : "Ablation variant";
    const shortNames = { norelight: "No lighting perturbation", bgclean: "No viewpoint augmentation" };
    const name = asset => shortNames[basename(asset)] || asset.label;
    return `<div class="mobile-method-picker" role="group" aria-label="${label}">
      <button type="button" class="icon-button" data-method-step="${key}" data-direction="-1" aria-label="Previous ${label.toLowerCase()}">←</button>
      <label class="mobile-method-choice"><span aria-hidden="true">${escape(name(alternatives[mobileMethods[key]]))}</span>
        <select data-method-for="${key}" aria-label="${label}">${alternatives.map((asset, index) =>
          `<option value="${index}"${index === mobileMethods[key] ? " selected" : ""}>${escape(name(asset))}</option>`
        ).join("")}</select>
      </label>
      <button type="button" class="icon-button" data-method-step="${key}" data-direction="1" aria-label="Next ${label.toLowerCase()}">→</button>
    </div>`;
  }

  // All result panes use frames from the same foreground video decoder.
  // This keeps their foregrounds identical without loading eight extra videos.
  function bindForegroundOverlay(stage, source = $(".comparison-inputs video", stage)) {
    const canvases = $$(".foreground-canvas", stage);
    const contexts = canvases.map(canvas => canvas.getContext("2d", { alpha: false }));
    let alive = true;
    let frameHandle = null;
    let lastPaintedTime = -1;
    const paint = (force = false) => {
      if (!alive || source.readyState < 2 || !source.getAttribute("src")) return;
      if (!force && lastPaintedTime === source.currentTime) return;
      canvases.forEach((canvas, index) => {
        const context = contexts[index];
        if (!context) return;
        if (canvas.width !== source.videoWidth || canvas.height !== source.videoHeight) {
          canvas.width = source.videoWidth;
          canvas.height = source.videoHeight;
        }
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        canvas.classList.add("is-ready");
      });
      lastPaintedTime = source.currentTime;
    };
    const refresh = () => paint(true);
    const reset = () => {
      lastPaintedTime = -1;
      canvases.forEach(canvas => canvas.classList.remove("is-ready"));
    };
    const onVideoFrame = () => {
      if (!alive) return;
      paint(true);
      frameHandle = source.requestVideoFrameCallback(onVideoFrame);
    };
    source.addEventListener("loadeddata", refresh);
    source.addEventListener("seeked", refresh);
    source.addEventListener("emptied", reset);
    const nativeVideoFrames = typeof source.requestVideoFrameCallback === "function";
    if (nativeVideoFrames) frameHandle = source.requestVideoFrameCallback(onVideoFrame);
    return {
      tick() { if (!nativeVideoFrames) paint(); },
      destroy() {
        alive = false;
        if (frameHandle !== null) source.cancelVideoFrameCallback(frameHandle);
        source.removeEventListener("loadeddata", refresh);
        source.removeEventListener("seeked", refresh);
        source.removeEventListener("emptied", reset);
      }
    };
  }

  function updateOverlay() {
    const stage = $("#comparison-stage");
    stage.style.setProperty("--overlay-position", `${overlayAmount}%`);
    stage.classList.toggle("is-result-only", overlayAmount === 0);
    stage.classList.toggle("is-foreground-only", overlayAmount === 100);
    $$("[data-overlay-slider]").forEach(slider => {
      slider.value = overlayAmount;
      slider.setAttribute("aria-valuetext", `${overlayAmount}% input foreground`);
    });
  }

  $("#comparison-sample").value = "s1";
  function renderComparison(options = {}) {
    const sample = data.comparisons.find(item => item.id === $("#comparison-sample").value);
    const selected = resultVideos(sample);
    const alternatives = selected.filter(asset => basename(asset) !== "ours");
    cacheGallerySample("comparison", sample);
    comparisonOverlay?.destroy();
    $("#comparison-stage").classList.toggle("is-tablet-gallery", tabletGallery.matches && !compactLayout.matches);
    renderGroup("comparison-stage", inputs(sample) + `<div class="comparison-videos">
      ${methodPicker("comparison", alternatives)}
      ${selected.map(asset => figure(asset, basename(asset) === "ours" ? "FreeCHROMA" : asset.label, {
        ours: basename(asset) === "ours", badge: false, foreground: sample.figures[0],
        inactive: focusedGallery() && basename(asset) !== "ours" && asset !== alternatives[mobileMethods.comparison]
      })).join("")}
    </div>`, "comparison-sample", options);
    comparisonOverlay = bindForegroundOverlay($("#comparison-stage"));
    updateOverlay();
    updateCaseCounter("comparison-sample", "comparison-counter");
    updateThumbnailStrip("comparison-thumbnails", "comparison-sample");
  }
  $("#comparison-sample").addEventListener("change", renderComparison);
  document.addEventListener("input", event => {
    if (!event.target.matches("[data-overlay-slider]")) return;
    overlayAmount = Math.max(0, Math.min(100, Number(event.target.value)));
    updateOverlay();
  });

  $("#abstract-text").textContent = data.abstract;

  $("#ablation-sample").innerHTML = data.ablations.map(sample =>
    `<option value="${escape(sample.id)}">${escape(sample.title)}</option>`
  ).join("");
  $("#ablation-sample").value = "abl5";
  createThumbnailStrip("ablation-thumbnails", "ablation-sample", data.ablations.map(sample => ({
    value: sample.id, label: sample.title, poster: output(sample).poster
  })));
  const ablationDescriptions = new Map($$(".ablation-notes [data-method]").map(note => [
    note.dataset.method,
    [...note.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join("").trim()
  ]));
  function renderAblation(options = {}) {
    const sample = data.ablations.find(item => item.id === $("#ablation-sample").value);
    const selected = resultVideos(sample);
    const alternatives = selected.filter(asset => basename(asset) !== "ours");
    cacheGallerySample("ablation", sample);
    $("#ablation-stage").classList.toggle("is-tablet-gallery", tabletGallery.matches && !compactLayout.matches);
    renderGroup("ablation-stage", inputs(sample) + `<div class="ablation-videos">${methodPicker("ablation", alternatives)}${selected.map(asset =>
      figure(asset, basename(asset) === "ours" ? "FreeCHROMA · full model" : asset.label, {
        ours: basename(asset) === "ours", badge: false, description: ablationDescriptions.get(basename(asset)),
        inactive: focusedGallery() && basename(asset) !== "ours" && asset !== alternatives[mobileMethods.ablation]
      })
    ).join("")}</div>`, "ablation-sample", options);
    updateCaseCounter("ablation-sample", "ablation-counter");
    updateThumbnailStrip("ablation-thumbnails", "ablation-sample");
  }
  $("#ablation-sample").addEventListener("change", renderAblation);

  function chooseMobileMethod(key, index, focusSelector) {
    if (!focusedGallery() || mobileMethods[key] === index) return;
    mobileMethods[key] = index;
    (key === "comparison" ? renderComparison : renderAblation)();
    if (focusSelector) $(focusSelector)?.focus({ preventScroll: true });
  }
  document.addEventListener("change", event => {
    const select = event.target.closest("[data-method-for]");
    if (select) chooseMobileMethod(select.dataset.methodFor, Number(select.value), `[data-method-for="${select.dataset.methodFor}"]`);
  });
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-method-step]");
    if (!button) return;
    const key = button.dataset.methodStep;
    const count = $(`[data-method-for="${key}"]`).options.length;
    const next = (mobileMethods[key] + Number(button.dataset.direction) + count) % count;
    chooseMobileMethod(key, next, `[data-method-step="${key}"][data-direction="${button.dataset.direction}"]`);
  });
  const updateGalleryMode = () => {
    renderComparison({ preserveTime: true });
    renderAblation({ preserveTime: true });
  };
  compactLayout.addEventListener("change", updateGalleryMode);
  tabletGallery.addEventListener("change", updateGalleryMode);

  const robotDemo = data.robots.find(sample => sample.id === "rdemo0");
  const worldDemo = data.robots.find(sample => sample.id === "rdemo1");
  // Original supplement, sec-vwm-sim: the explicitly captioned example
  // succeeds; the other environments fail. DROID outcomes are not annotated.
  const worldOutcomes = new Map(resultVideos(worldDemo).map(asset =>
    [asset.src, /successfully/i.test(asset.label) ? "success" : "failure"]
  ));
  const directExamples = data.robots.filter(sample => sample.id.startsWith("rrobot_direct"));
  const realWorldExamples = data.robots.filter(sample => /^rrobot\d+$/.test(sample.id));
  const environmentName = (asset) => {
    const names = {
      s01_white_marble: "White marble", s02_farmhouse: "Farmhouse", s03_industrial: "Industrial",
      s04_japandi: "Japandi", s05_retro70s: "Retro 70s", s06_cafe: "Café",
      s07_night_neon: "Night neon", s08_scandi: "Scandinavian", s09_luxury: "Luxury",
      s10_mediterranean: "Mediterranean"
    };
    return names[basename(asset).replace(/^r_/, "")] || "Environment";
  };
  const robotApplications = ["sim2real", "environment", "world"];
  const robotDescriptions = {
    sim2real: {
      title: "Sim-to-real transfer",
      description: "Rendered RoboCasa sequences preserve the robot body, interacting objects, and their motion in new environments.",
      dataset: "RoboCasa"
    },
    environment: {
      title: "Environment augmentation",
      description: "Retain the robot arm and manipulated objects while generating the surrounding environment.",
      dataset: "DROID"
    },
    world: {
      title: "Visual world modeling",
      description: "Foreground conditions retain only the robot body; FreeCHROMA generates the surrounding scene and objects’ responses.",
      dataset: "RoboCasa / DROID"
    }
  };
  function configureRobotApplication(application) {
    const prefix = `robot-${application}`;
    const description = robotDescriptions[application];
    $(`#${prefix}-title`).textContent = description.title;
    $(`#${prefix}-description`).textContent = description.description;
    $(`#${prefix}-dataset`).textContent = description.dataset;
    $(`#${prefix}-select-label`).textContent = application === "sim2real" ? "Environment" : "Example";
    const select = $(`#${prefix}-sample`);
    if (application === "sim2real") {
      select.innerHTML = resultVideos(robotDemo).map((asset, index) => `<option value="${index}">${escape(environmentName(asset))}</option>`).join("");
    } else if (application === "environment") {
      select.innerHTML = directExamples.map((sample, index) => `<option value="${escape(sample.id)}">Sample ${index + 1}</option>`).join("");
    } else {
      select.innerHTML = `<optgroup label="RoboCasa · simulation">${resultVideos(worldDemo).map((asset, index) => `<option value="sim-${index}">${escape(environmentName(asset))}</option>`).join("")}</optgroup>
        <optgroup label="DROID · real capture">${realWorldExamples.map((sample, index) => `<option value="${escape(sample.id)}">Real capture ${index + 1}</option>`).join("")}</optgroup>`;
    }
    const items = [...select.options].map(option => {
      let result;
      if (application === "sim2real") result = resultVideos(robotDemo)[Number(option.value)];
      else if (application === "world" && option.value.startsWith("sim-")) result = resultVideos(worldDemo)[Number(option.value.slice(4))];
      else result = output(data.robots.find(sample => sample.id === option.value));
      return { value: option.value, label: option.textContent, poster: result.poster };
    });
    createThumbnailStrip(`${prefix}-thumbnails`, `${prefix}-sample`, items);
    select.addEventListener("change", () => renderRobot(application));
    renderRobot(application);
  }
  function renderRobot(application) {
    const prefix = `robot-${application}`;
    const value = $(`#${prefix}-sample`).value;
    let control, ref, result, sourceVideo;
    if (application === "sim2real" || (application === "world" && value.startsWith("sim-"))) {
      const sample = application === "sim2real" ? robotDemo : worldDemo;
      const index = Number(value.replace("sim-", ""));
      result = resultVideos(sample)[index];
      control = sample.figures.find(asset => basename(asset) === "control");
      sourceVideo = sample.figures.find(asset => basename(asset) === "gt");
      ref = { type: "image", src: result.inset };
    } else {
      const collection = application === "environment" ? directExamples : realWorldExamples;
      const sample = collection.find(item => item.id === value);
      control = sample.figures.find(asset => basename(asset) === "control");
      ref = sample.figures.find(asset => asset.type === "image");
      result = output(sample);
    }
    renderGroup(`${prefix}-stage`,
      figure(control, "Input foreground") + figure(ref, "Reference") +
      figure(result, "FreeCHROMA", { ours: true, badge: false, outcome: worldOutcomes.get(result.src) }),
      `${prefix}-sample`
    );
    const sourceButton = $(`#${prefix}-source`);
    sourceButton.hidden = !sourceVideo;
    if (sourceVideo) {
      sourceButton.dataset.video = sourceVideo.src;
      sourceButton.dataset.poster = sourceVideo.poster;
      sourceButton.dataset.caption = "Source video · RoboCasa";
    } else {
      delete sourceButton.dataset.video;
      delete sourceButton.dataset.poster;
      delete sourceButton.dataset.caption;
    }
    updateCaseCounter(`${prefix}-sample`, `${prefix}-counter`);
    updateThumbnailStrip(`${prefix}-thumbnails`, `${prefix}-sample`);
  }
  function updateRobotNavigation() {
    robotApplications.forEach(application => {
      const prefix = `robot-${application}`;
      const panel = $(`#${prefix}-panel`);
      const controls = $(".robot-controls", panel);
      const picker = $(".case-picker", controls);
      const strip = $(`#${prefix}-thumbnails`);
      const source = $(`#${prefix}-source`);
      if (compactLayout.matches) {
        picker.insertBefore(strip, $('[data-step="1"]', picker));
        panel.appendChild(source);
      } else {
        $(`#${prefix}-stage`).after(strip);
        picker.after(source);
      }
      updateThumbnailStrip(`${prefix}-thumbnails`, `${prefix}-sample`);
    });
  }
  compactLayout.addEventListener("change", updateRobotNavigation);

  document.addEventListener("click", event => {
    const step = event.target.closest("[data-step-for]");
    if (step) {
      const select = document.getElementById(step.dataset.stepFor);
      select.selectedIndex = (select.selectedIndex + Number(step.dataset.step) + select.options.length) % select.options.length;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const pick = event.target.closest("[data-pick-for]");
    if (pick) {
      const select = document.getElementById(pick.dataset.pickFor);
      if (select.value !== pick.dataset.value) {
        select.value = pick.dataset.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    const play = event.target.closest("[data-play]");
    if (play) {
      const group = groups.get(play.dataset.play);
      if (group) group.setPlaying(!group.playing);
    }
  });
  $$(".sample-strip").forEach(strip => {
    strip.addEventListener("keydown", event => {
      const buttons = $$("[data-pick-for]", strip);
      let index = buttons.indexOf(document.activeElement);
      if (index < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "ArrowLeft") index = (index + buttons.length - 1) % buttons.length;
      if (event.key === "ArrowRight") index = (index + 1) % buttons.length;
      if (event.key === "Home") index = 0;
      if (event.key === "End") index = buttons.length - 1;
      buttons[index].focus({ preventScroll: true });
      buttons[index].click();
    });
  });
  // Finish the current clip while a control is held, but keep its sample in
  // place until the drag or keyboard interaction has ended.
  function holdGalleryInteraction(event) {
    if (event.type === "keydown" && !/^(Arrow|Home|End|Page|Enter| )/.test(event.key)) return;
    const panel = event.target.closest("#comparison, #ablation, .robot-panel");
    const stage = panel && $(".video-group", panel);
    if (stage) interactingGalleries.add(stage.id);
  }
  document.addEventListener("pointerdown", holdGalleryInteraction);
  document.addEventListener("keydown", holdGalleryInteraction);
  ["pointerup", "pointercancel", "keyup"].forEach(type =>
    document.addEventListener(type, () => interactingGalleries.clear()));
  window.addEventListener("blur", () => interactingGalleries.clear());
  $$("[data-seek]").forEach(slider => {
    slider.addEventListener("input", () => groups.get(slider.dataset.seek)?.seek(Number(slider.value) / 1000));
  });
  reducedMotion.addEventListener("change", event => {
    if (event.matches) groups.forEach(group => {
      group.entrance?.finish();
      group.setPlaying(false);
    });
  });
  document.addEventListener("visibilitychange", () => groups.forEach(group => group.sync()));

  const modal = $("#media-modal");
  const modalPlay = $("#modal-play");
  let modalTrigger = null;
  function updateModalPlayback() {
    const video = $("video", modal);
    modalPlay.hidden = !video || (!video.paused && !video.ended);
    if (!video) return;
    const label = video.ended ? "Replay" : video.paused ? "Play" : "Pause";
    $(".sr-only", modalPlay).textContent = label;
    modalPlay.setAttribute("aria-label", `${label} expanded video`);
    video.setAttribute("aria-label", `${label} expanded video`);
  }
  function openMedia(trigger) {
    modalTrigger = trigger;
    modalOpen = true;
    groups.forEach(group => group.sync());
    $("#modal-title").textContent = trigger.dataset.caption || "FreeCHROMA";
    const isVideo = Boolean(trigger.dataset.video);
    const element = document.createElement(isVideo ? "video" : "img");
    const previewScope = trigger.closest(".media-frame") || trigger;
    const preview = isVideo
      ? $$("video", previewScope).find(video => video.dataset.src === trigger.dataset.video) ||
        $("img.poster", previewScope)
      : $("img.single-image, img", previewScope);
    const previewWidth = preview?.videoWidth || preview?.naturalWidth || Number(preview?.getAttribute("width"));
    const previewHeight = preview?.videoHeight || preview?.naturalHeight || Number(preview?.getAttribute("height"));
    if ((previewWidth && previewHeight) || isVideo) {
      element.width = previewWidth || 640;
      element.height = previewHeight || 360;
      element.style.aspectRatio = `auto ${element.width} / ${element.height}`;
    }
    element.src = isVideo ? trigger.dataset.video : trigger.dataset.image;
    if (isVideo) {
      element.controls = false;
      element.muted = true;
      element.playsInline = true;
      element.loop = !trigger.dataset.outcome;
      element.poster = trigger.dataset.poster || "";
      element.tabIndex = 0;
      element.addEventListener("click", toggleModalPlayback);
      element.addEventListener("keydown", event => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        toggleModalPlayback();
      });
    } else {
      element.alt = trigger.dataset.caption || "FreeCHROMA method figure";
    }
    $("#modal-content").replaceChildren(element);
    updateModalPlayback();
    if (isVideo) {
      ["play", "pause", "ended"].forEach(event => element.addEventListener(event, updateModalPlayback));
      $("#modal-content").insertAdjacentHTML("beforeend", taskOutcomeBadge(trigger.dataset.outcome));
      const badge = $(".task-outcome", $("#modal-content"));
      if (badge) {
        element.addEventListener("ended", () => { badge.hidden = false; });
        element.addEventListener("play", () => { badge.hidden = true; });
        element.addEventListener("seeking", () => { badge.hidden = true; });
      }
    }
    document.body.classList.add("modal-open");
    modal.showModal();
    if (isVideo && !reducedMotion.matches) element.play().catch(() => {});
  }
  document.addEventListener("click", event => {
    const trigger = event.target.closest("[data-video], [data-image]");
    if (trigger) openMedia(trigger);
  });
  function toggleModalPlayback() {
    const video = $("video", modal);
    if (!video) return;
    if (video.paused || video.ended) {
      const badge = $(".task-outcome", modal);
      if (badge) badge.hidden = true;
      video.play().catch(updateModalPlayback);
    } else video.pause();
  }
  modalPlay.addEventListener("click", toggleModalPlayback);
  $("#close-modal").addEventListener("click", () => modal.close());
  modal.addEventListener("click", event => {
    if (event.target !== modal) return;
    const rect = modal.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) modal.close();
  });
  modal.addEventListener("close", () => {
    const video = $("video", modal);
    if (video) { video.pause(); video.removeAttribute("src"); video.load(); }
    $("#modal-content").replaceChildren();
    modalPlay.hidden = true;
    modalOpen = false;
    document.body.classList.remove("modal-open");
    groups.forEach(group => group.sync());
    if (document.activeElement === document.body || document.activeElement === document.documentElement || modal.contains(document.activeElement)) {
      modalTrigger?.focus({ preventScroll: true });
    }
  });

  let copyTimeout;
  $("#copy-citation").addEventListener("click", async () => {
    const text = $("#bibtex").textContent.trim();
    let copied = false;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.cssText = "position:fixed;left:-9999px;top:0;";
      document.body.appendChild(textarea);
      textarea.select();
      copied = document.execCommand("copy");
      textarea.remove();
      $("#copy-citation").focus({ preventScroll: true });
    }
    $("#copy-citation").textContent = copied ? "Copied ✓" : "Select text to copy";
    $("#copy-status").textContent = copied ? "Citation copied to clipboard." : "Copy is unavailable. Select the BibTeX text and copy it manually.";
    clearTimeout(copyTimeout);
    copyTimeout = setTimeout(() => { $("#copy-citation").textContent = "Copy citation"; }, 2500);
  });

  Object.entries({ paper: config.paperUrl, code: config.codeUrl, model: config.modelUrl }).forEach(([key, url]) => {
    if (!url) return;
    const link = $(`[data-resource="${key}"]`);
    link.href = url;
    link.hidden = false;
    if (/^https?:/.test(url)) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
  });

  const navigation = $("#navigation");
  const menu = $("#menu-toggle");
  const themeToggle = $("#theme-toggle");
  const themeModes = ["auto", "light", "dark"];
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  let themeMode = document.documentElement.dataset.themeMode || "auto";
  function applyTheme(mode, remember = false) {
    themeMode = themeModes.includes(mode) ? mode : "auto";
    const theme = themeMode === "auto" ? (systemTheme.matches ? "dark" : "light") : themeMode;
    document.documentElement.dataset.themeMode = themeMode;
    document.documentElement.dataset.theme = theme;
    $$('meta[name="theme-color"]').forEach(meta => {
      meta.content = theme === "dark" ? "#101b1e" : "#f2f6f7";
    });
    const label = themeMode[0].toUpperCase() + themeMode.slice(1);
    const next = themeModes[(themeModes.indexOf(themeMode) + 1) % themeModes.length];
    const nextLabel = next[0].toUpperCase() + next.slice(1);
    const description = `Color theme: ${label}${themeMode === "auto" ? " (follow system)" : ""}. Switch to ${nextLabel}.`;
    themeToggle.setAttribute("aria-label", description);
    themeToggle.title = description;
    $$("[data-theme-icon]", themeToggle).forEach(icon => {
      icon.toggleAttribute("hidden", icon.dataset.themeIcon !== themeMode);
    });
    if (remember) {
      try { localStorage.setItem("freechroma-theme", themeMode); } catch {}
    }
  }
  themeToggle.addEventListener("click", () => {
    applyTheme(themeModes[(themeModes.indexOf(themeMode) + 1) % themeModes.length], true);
  });
  systemTheme.addEventListener("change", () => {
    if (themeMode === "auto") applyTheme("auto");
  });
  window.addEventListener("storage", event => {
    if (event.key === "freechroma-theme" || event.key === null) {
      let saved;
      try { saved = localStorage.getItem("freechroma-theme"); } catch {}
      applyTheme(saved);
    }
  });
  applyTheme(themeMode);
  function closeMenu() {
    navigation.classList.remove("is-open");
    menu.setAttribute("aria-expanded", "false");
    menu.setAttribute("aria-label", "Open navigation");
  }
  menu.addEventListener("click", () => {
    const open = !navigation.classList.contains("is-open");
    navigation.classList.toggle("is-open", open);
    menu.setAttribute("aria-expanded", String(open));
    menu.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  });
  $$("a", navigation).forEach(link => link.addEventListener("click", closeMenu));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && navigation.classList.contains("is-open")) {
      closeMenu();
      menu.focus();
    }
  });
  const navLinks = $$("a", navigation);
  const navTargets = navLinks.map(link => ({ link, target: $(link.getAttribute("href")) }));
  const dockHeader = $(".site-header");
  const dockPanel = $("#navigation-dock");
  const dockPeek = $("#dock-peek");
  let dockCollapsed = false;
  let dockScrollY = Math.max(0, scrollY);
  let dockDirection = 0;
  let dockTravel = 0;
  let dockHoldUntil = performance.now() + 900;
  let dockPointerHeld = false;
  let dockNavigating = false;
  let dockNavigationTimer;
  let dockFocusFrame;
  let dockViewportWidth = innerWidth;

  function resetDockScroll(y = Math.max(0, scrollY)) {
    dockScrollY = y;
    dockDirection = 0;
    dockTravel = 0;
  }
  function setDockCollapsed(collapse, focusControl = false) {
    collapse = compactLayout.matches && collapse;
    if (collapse === dockCollapsed) return;
    cancelAnimationFrame(dockFocusFrame);
    const focused = document.activeElement;
    const transferFocus = focusControl || (!collapse && focused === dockPeek);
    if ((collapse && dockPanel.contains(focused)) || (!collapse && focused === dockPeek)) focused.blur();
    dockCollapsed = collapse;
    dockHeader.classList.toggle("is-dock-collapsed", collapse);
    // The fading controls must immediately leave the keyboard and accessibility trees.
    dockPanel.inert = collapse;
    dockPanel.setAttribute("aria-hidden", String(collapse));
    dockPeek.inert = !collapse;
    dockPeek.setAttribute("aria-hidden", String(!collapse));
    dockPeek.setAttribute("aria-expanded", String(!collapse));
    if (transferFocus) {
      // Let visibility and inert updates settle before restoring keyboard focus.
      dockFocusFrame = requestAnimationFrame(() => {
        if (dockCollapsed !== collapse || modalOpen) return;
        const target = collapse ? dockPeek : compactLayout.matches
          ? $('a[aria-current="location"]', navigation) || $(".nav-home", navigation)
          : $(".brand", dockPanel);
        target.focus({ preventScroll: true });
      });
    }
  }
  function keepDockOpen(focusControl = false) {
    dockHoldUntil = performance.now() + 900;
    setDockCollapsed(false, focusControl);
    resetDockScroll();
  }
  function finishDockNavigationSoon() {
    clearTimeout(dockNavigationTimer);
    dockNavigationTimer = setTimeout(() => {
      dockNavigating = false;
      dockHoldUntil = performance.now() + 240;
      resetDockScroll();
    }, 180);
  }
  function updateDock(maxScroll) {
    const y = Math.max(0, Math.min(scrollY, maxScroll));
    const delta = y - dockScrollY;
    dockScrollY = y;
    if (!compactLayout.matches || y < 100 || maxScroll - y < 12) {
      setDockCollapsed(false);
      resetDockScroll(y);
      return;
    }
    if (dockNavigating) {
      finishDockNavigationSoon();
      resetDockScroll(y);
      return;
    }
    if (dockPointerHeld || modalOpen || interactingGalleries.size ||
        performance.now() < dockHoldUntil || dockPanel.querySelector(":focus-visible")) {
      resetDockScroll(y);
      return;
    }
    if (Math.abs(delta) < 2) return;
    const direction = delta > 0 ? 1 : -1;
    if (direction !== dockDirection) dockTravel = 0;
    dockDirection = direction;
    dockTravel += Math.abs(delta);
    // Different thresholds avoid flicker from small scroll corrections and touch bounce.
    if (direction > 0 && dockTravel >= 64 && y > 160) setDockCollapsed(true);
    else if (direction < 0 && dockTravel >= 24) setDockCollapsed(false);
  }
  dockPeek.addEventListener("click", () => keepDockOpen(true));
  dockHeader.addEventListener("pointerdown", event => {
    dockPointerHeld = true;
    if (dockPanel.contains(event.target)) keepDockOpen();
  }, { passive: true });
  ["pointerup", "pointercancel"].forEach(type =>
    document.addEventListener(type, () => { dockPointerHeld = false; }, { passive: true }));
  navLinks.forEach(link => link.addEventListener("click", () => {
    if (!compactLayout.matches) return;
    keepDockOpen();
    dockNavigating = true;
    finishDockNavigationSoon();
  }));
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !compactLayout.matches || modalOpen || dockCollapsed ||
        !dockPanel.contains(document.activeElement)) return;
    event.preventDefault();
    setDockCollapsed(true, true);
    resetDockScroll();
  });
  window.addEventListener("resize", () => {
    if (innerWidth !== dockViewportWidth) {
      dockViewportWidth = innerWidth;
      keepDockOpen();
    }
    resetDockScroll();
  }, { passive: true });
  let scrollQueued = false;
  function updateNavigation() {
    const compact = compactLayout.matches;
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    let current = compact ? "top" : null;
    navTargets.forEach(({ link, target }) => {
      // Home covers the title and overview in the dock; desktop keeps Overview.
      if (link.classList.contains(compact ? "nav-overview" : "nav-home")) return;
      if (target.getBoundingClientRect().top < (compact ? 96 : 180)) current = target.id;
    });
    // The short, collapsed phone citation cannot always reach the top of the viewport.
    if (scrollY > 0 && Math.ceil(scrollY) >= maxScroll - 2) {
      current = navTargets[navTargets.length - 1].target.id;
    }
    navLinks.forEach(link => {
      const active = link.getAttribute("href") === `#${current}`;
      link.classList.toggle("is-active", active);
      if (active) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
    updateDock(maxScroll);
    scrollQueued = false;
  }
  window.addEventListener("scroll", () => {
    if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(updateNavigation); }
  }, { passive: true });
  compactLayout.addEventListener("change", () => {
    closeMenu();
    dockNavigating = false;
    clearTimeout(dockNavigationTimer);
    keepDockOpen();
    updateNavigation();
  });

  renderHero();
  renderComparison();
  renderAblation();
  robotApplications.forEach(configureRobotApplication);
  updateRobotNavigation();
  updatePlaybackState();
  updateNavigation();
  function animate(now) {
    groups.forEach(group => group.tick(now));
    heroOverlay?.tick(now);
    tickHeroPlaylist();
    comparisonOverlay?.tick();
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
})();
