'use strict';


// theme preference
const themeToggle = document.querySelector("[data-theme-toggle]");
const themeToggleText = document.querySelector("[data-theme-toggle-text]");
const themeToggleIcon = themeToggle?.querySelector("ion-icon");
const colorSchemeQuery = window.matchMedia("(prefers-color-scheme: light)");
const themeModes = ["system", "light", "dark"];
const themeIcons = {
  system: "contrast-outline",
  light: "sunny-outline",
  dark: "moon-outline"
};

// Every visit starts with the device theme. Manual choices are in-memory only;
// old localStorage preferences must not override a later daytime/system theme.
let themeMode = "system";

const getResolvedTheme = function () {
  return themeMode === "system" ? (colorSchemeQuery.matches ? "light" : "dark") : themeMode;
};

const updateThemeToggle = function () {
  if (!themeToggle || !themeToggleText) return;

  const resolvedTheme = getResolvedTheme();
  const currentModeLabel = themeMode === "system"
    ? `System mode, using ${resolvedTheme} theme`
    : `${themeMode.charAt(0).toUpperCase()}${themeMode.slice(1)} mode`;
  const nextMode = themeModes[(themeModes.indexOf(themeMode) + 1) % themeModes.length];

  themeToggleText.textContent = currentModeLabel;
  themeToggle.dataset.themeMode = themeMode;
  themeToggle.setAttribute("aria-label", `Color theme: ${currentModeLabel}. Switch to ${nextMode} mode.`);
  themeToggle.setAttribute("title", `Theme: ${currentModeLabel}. Next: ${nextMode}.`);
  if (themeToggleIcon) themeToggleIcon.setAttribute("name", themeIcons[themeMode]);
};

let themePaintFrame;
const applyTheme = function () {
  const root = document.documentElement;
  const resolvedTheme = getResolvedTheme();
  const changed = root.dataset.theme !== resolvedTheme;
  if (changed) {
    cancelAnimationFrame(themePaintFrame);
    root.classList.add('theme-changing');
  }
  root.dataset.theme = resolvedTheme;
  updateThemeToggle();
  if (changed) {
    // Resolve the new palette while transitions are disabled, then retain it
    // through one paint. Rapid toggles cancel the previous cleanup frame.
    void root.offsetHeight;
    themePaintFrame = requestAnimationFrame(() => {
      themePaintFrame = requestAnimationFrame(() => {
        root.classList.remove('theme-changing');
      });
    });
  }
};

if (themeToggle) {
  themeToggle.addEventListener("click", function () {
    themeMode = themeModes[(themeModes.indexOf(themeMode) + 1) % themeModes.length];
    applyTheme();
  });
}

colorSchemeQuery.addEventListener("change", function () {
  if (themeMode === "system") applyTheme();
});

// Mobile browsers may suspend media-query events while the page is hidden.
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "visible" && themeMode === "system") applyTheme();
});

window.addEventListener("pageshow", function (event) {
  // A page restored from the back/forward cache is a new visit, too.
  if (event.persisted) themeMode = "system";
  applyTheme();
});

applyTheme();


// Section navigation follows the reader through the continuous homepage.
const sectionLinks = [...document.querySelectorAll("[data-section-link]")];
const linkedSections = sectionLinks.map(link => document.querySelector(link.getAttribute("href")));

const markActiveSection = function (id) {
  sectionLinks.forEach(function (link) {
    const active = link.getAttribute("href") === `#${id}`;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
};

let navigationFrame;
const syncSectionNavigation = function () {
  if (navigationFrame) return;
  navigationFrame = window.requestAnimationFrame(function () {
    navigationFrame = null;
    const activeSection = linkedSections.filter(Boolean).reduce(function (active, section) {
      return section.getBoundingClientRect().top <= 150 ? section : active;
    }, linkedSections[0]);
    if (activeSection) markActiveSection(activeSection.id);
  });
};

window.addEventListener("scroll", syncSectionNavigation, { passive: true });
window.addEventListener("resize", syncSectionNavigation);
window.addEventListener("hashchange", function () {
  // Preserve links shared before the layout changed.
  const legacySections = { portfolio: "publications", resume: "experience", contact: "contact" };
  const legacyTarget = legacySections[window.location.hash.slice(1)];
  if (legacyTarget) document.getElementById(legacyTarget)?.scrollIntoView();
  syncSectionNavigation();
});
const initialLegacyTarget = { portfolio: "publications", resume: "experience" }[window.location.hash.slice(1)];
if (initialLegacyTarget) document.getElementById(initialLegacyTarget)?.scrollIntoView();
syncSectionNavigation();


// Load and play research previews only while they are visible.
const previewMotionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");

document.querySelectorAll("[data-project-preview]").forEach(function (preview) {
  const video = preview.querySelector("[data-preview-video]");
  const fallback = preview.querySelector("[data-preview-fallback]");
  if (!video || !fallback) return;

  let visible = false;
  let pageHidden = false;
  let useFallback = false;
  let pendingPlay = false;
  let reloads = 0;
  let playbackVersion = 0;
  let watchdog;
  let retry;
  let lastTime = 0;
  let lastProgress = 0;
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;

  const shouldAnimate = function () {
    return visible && !pageHidden && !document.hidden && !previewMotionPreference.matches;
  };

  const stopWatchdog = function () {
    window.clearInterval(watchdog);
    watchdog = undefined;
  };

  const updateFallback = function () {
    const active = useFallback && shouldAnimate();
    if (active) {
      // Keep the poster visible while the animated image loads.
      if (!fallback.hasAttribute("src")) fallback.src = fallback.dataset.src;
      const ready = fallback.complete && fallback.naturalWidth > 0;
      fallback.hidden = !ready;
      video.hidden = ready;
    } else {
      fallback.hidden = true;
      fallback.removeAttribute("src");
      video.hidden = false;
    }
  };

  const activateFallback = function () {
    useFallback = true;
    playbackVersion += 1;
    pendingPlay = false;
    window.clearTimeout(retry);
    stopWatchdog();
    video.pause();
    updateFallback();
  };

  const recoverPreview = function () {
    if (!shouldAnimate() || useFallback || retry) return;
    playbackVersion += 1;
    pendingPlay = false;
    stopWatchdog();
    // Retry loading once; never leave an endless reload loop on a poor connection.
    if (reloads >= 1) {
      activateFallback();
      return;
    }
    reloads += 1;
    retry = window.setTimeout(function () {
      retry = undefined;
      if (!shouldAnimate()) return;
      video.load();
      updatePreviewPlayback();
    }, 400);
  };

  const startWatchdog = function () {
    if (watchdog) return;
    lastTime = video.currentTime;
    lastProgress = performance.now();
    watchdog = window.setInterval(function () {
      if (!shouldAnimate() || useFallback) return;
      if (Math.abs(video.currentTime - lastTime) > 0.01) {
        lastTime = video.currentTime;
        lastProgress = performance.now();
      } else if (performance.now() - lastProgress >= 6000) {
        recoverPreview();
      }
    }, 1000);
  };

  const updatePreviewPlayback = function () {
    updateFallback();
    if (!shouldAnimate() || useFallback) {
      playbackVersion += 1;
      pendingPlay = false;
      window.clearTimeout(retry);
      retry = undefined;
      stopWatchdog();
      video.pause();
      return;
    }

    if (!video.hasAttribute("src")) {
      // Assign the media element directly, rather than replacing a nested source.
      video.src = video.dataset.src;
      video.load();
    }
    startWatchdog();
    if (pendingPlay || !video.paused || retry) return;
    pendingPlay = true;
    const version = ++playbackVersion;
    video.play().then(function () {
      if (version === playbackVersion) pendingPlay = false;
    }).catch(function (error) {
      if (version !== playbackVersion) return;
      pendingPlay = false;
      if (!shouldAnimate()) return;
      // A rejected autoplay request cannot be fixed with repeated play() calls.
      if (error.name === "NotAllowedError" || error.name === "NotSupportedError") {
        activateFallback();
      } else {
        recoverPreview();
      }
    });
  };

  fallback.addEventListener("load", updateFallback);
  fallback.addEventListener("error", function () {
    fallback.hidden = true;
    video.hidden = false;
  });
  video.addEventListener("error", recoverPreview);
  document.addEventListener("visibilitychange", updatePreviewPlayback);
  window.addEventListener("pagehide", function () {
    pageHidden = true;
    updatePreviewPlayback();
  });

  const measureVisibility = function () {
    const rect = preview.getBoundingClientRect();
    const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
    const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
    visible = rect.width > 0 && rect.height > 0 && width * height / (rect.width * rect.height) >= 0.15;
    updatePreviewPlayback();
  };
  window.addEventListener("pageshow", function () {
    pageHidden = false;
    measureVisibility();
  });
  previewMotionPreference.addEventListener("change", updatePreviewPlayback);

  if (typeof IntersectionObserver !== "undefined") {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting && entries[0].intersectionRatio >= 0.15;
      updatePreviewPlayback();
    }, { threshold: [0, 0.15] }).observe(preview);
  } else {
    window.addEventListener("scroll", measureVisibility, { passive: true });
    window.addEventListener("resize", measureVisibility);
    measureVisibility();
  }
});


// summary + Details toggle for experience descriptions only
const initEntryDetails = function () {
  const experienceSection = [...document.querySelectorAll("section.timeline")].find(function (section) {
    const heading = section.querySelector(".h3");
    return heading && heading.textContent.trim() === "Experience";
  });

  if (!experienceSection) return;

  experienceSection.querySelectorAll(".education-details").forEach(function (details) {
    if (details.dataset.detailsReady === "true") return;

    const summary = details.querySelector(":scope > .entry-summary");
    const entryDetails = details.querySelector(":scope > .entry-details");

    if (!summary) return;

    details.dataset.detailsReady = "true";

    if (!entryDetails || !entryDetails.textContent.trim()) {
      return;
    }

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "entry-description__toggle";
    toggle.textContent = "Details";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", entryDetails.id || "");

    if (!entryDetails.id) {
      entryDetails.id = `entry-details-${Math.random().toString(36).slice(2, 9)}`;
      toggle.setAttribute("aria-controls", entryDetails.id);
    }

    entryDetails.hidden = true;
    entryDetails.classList.add("entry-details--collapsed");
    summary.after(toggle);

    toggle.addEventListener("click", function () {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      const showDetails = !expanded;

      toggle.setAttribute("aria-expanded", String(showDetails));
      entryDetails.hidden = !showDetails;
      entryDetails.classList.toggle("entry-details--collapsed", !showDetails);
      toggle.textContent = showDetails ? "Hide details" : "Details";
    });
  });
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initEntryDetails);
} else {
  initEntryDetails();
}
