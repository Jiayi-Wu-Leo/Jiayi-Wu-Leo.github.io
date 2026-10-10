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

const getStoredThemeMode = function () {
  const storedMode = localStorage.getItem("theme-mode");
  if (themeModes.includes(storedMode)) return storedMode;
  if (storedMode) localStorage.removeItem("theme-mode");

  const legacyTheme = localStorage.getItem("theme");
  if (["light", "dark"].includes(legacyTheme)) return legacyTheme;
  if (legacyTheme) localStorage.removeItem("theme");

  return "system";
};

let themeMode = getStoredThemeMode();

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

const applyTheme = function () {
  document.documentElement.dataset.theme = getResolvedTheme();
  updateThemeToggle();
};

if (themeToggle) {
  themeToggle.addEventListener("click", function () {
    themeMode = themeModes[(themeModes.indexOf(themeMode) + 1) % themeModes.length];
    if (themeMode === "system") {
      localStorage.removeItem("theme-mode");
    } else {
      localStorage.setItem("theme-mode", themeMode);
    }
    localStorage.removeItem("theme");
    applyTheme();
  });
}

colorSchemeQuery.addEventListener("change", function () {
  if (themeMode === "system") applyTheme();
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
