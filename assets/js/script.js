'use strict';


// theme preference
const themeToggle = document.querySelector("[data-theme-toggle]");
const themeToggleText = document.querySelector("[data-theme-toggle-text]");
const colorSchemeQuery = window.matchMedia("(prefers-color-scheme: light)");
const themeModes = ["light", "dark"];

const getStoredThemeMode = function () {
  const storedMode = localStorage.getItem("theme-mode");
  if (themeModes.includes(storedMode)) return storedMode;
  if (storedMode) localStorage.removeItem("theme-mode");

  const legacyTheme = localStorage.getItem("theme");
  return themeModes.includes(legacyTheme) ? legacyTheme : (colorSchemeQuery.matches ? "light" : "dark");
};

let themeMode = getStoredThemeMode();

const getResolvedTheme = function () {
  return themeMode;
};

const updateThemeToggle = function () {
  if (!themeToggle || !themeToggleText) return;

  themeToggleText.textContent = `${themeMode.charAt(0).toUpperCase()}${themeMode.slice(1)} mode`;
  themeToggle.setAttribute("aria-label", `Switch color theme. Current mode: ${themeToggleText.textContent}`);
};

const applyTheme = function () {
  document.documentElement.dataset.theme = getResolvedTheme();
  updateThemeToggle();
};

if (themeToggle) {
  themeToggle.addEventListener("click", function () {
    themeMode = themeModes[(themeModes.indexOf(themeMode) + 1) % themeModes.length];
    localStorage.setItem("theme-mode", themeMode);
    localStorage.removeItem("theme");
    applyTheme();
  });
}

colorSchemeQuery.addEventListener("change", function () {
  if (!localStorage.getItem("theme-mode") && !localStorage.getItem("theme")) {
    themeMode = colorSchemeQuery.matches ? "light" : "dark";
    applyTheme();
  }
});

applyTheme();



// element toggle function
const elementToggleFunc = function (elem) { elem.classList.toggle("active"); }



// sidebar variables
const sidebar = document.querySelector("[data-sidebar]");
const sidebarBtn = document.querySelector("[data-sidebar-btn]");

// sidebar toggle functionality for mobile
if (sidebar && sidebarBtn) {
  sidebarBtn.setAttribute("aria-expanded", sidebar.classList.contains("active") ? "true" : "false");

  sidebarBtn.addEventListener("click", function () {
    elementToggleFunc(sidebar);
    const isExpanded = sidebar.classList.contains("active");
    sidebarBtn.setAttribute("aria-expanded", isExpanded ? "true" : "false");

    const label = sidebarBtn.querySelector("span");
    if (label) label.textContent = isExpanded ? "Hide Contacts" : "Show Contacts";
  });
}



// testimonials variables
const testimonialsItem = document.querySelectorAll("[data-testimonials-item]");
const modalContainer = document.querySelector("[data-modal-container]");
const modalCloseBtn = document.querySelector("[data-modal-close-btn]");
const overlay = document.querySelector("[data-overlay]");

// modal variable
const modalImg = document.querySelector("[data-modal-img]");
const modalTitle = document.querySelector("[data-modal-title]");
const modalText = document.querySelector("[data-modal-text]");

// modal toggle function
const testimonialsModalFunc = function () {
  if (modalContainer && overlay) {
    modalContainer.classList.toggle("active");
    overlay.classList.toggle("active");
  }
}

// add click event to all modal items
for (let i = 0; i < testimonialsItem.length; i++) {

  testimonialsItem[i].addEventListener("click", function () {

    if (modalImg && modalTitle && modalText) {
      modalImg.src = this.querySelector("[data-testimonials-avatar]").src;
      modalImg.alt = this.querySelector("[data-testimonials-avatar]").alt;
      modalTitle.innerHTML = this.querySelector("[data-testimonials-title]").innerHTML;
      modalText.innerHTML = this.querySelector("[data-testimonials-text]").innerHTML;
    }

    testimonialsModalFunc();

  });

}

// add click event to modal close button
if (modalCloseBtn && overlay) {
  modalCloseBtn.addEventListener("click", testimonialsModalFunc);
  overlay.addEventListener("click", testimonialsModalFunc);
}



// custom select variables
const select = document.querySelector("[data-select]");
const selectItems = document.querySelectorAll("[data-select-item]");
const selectValue = document.querySelector("[data-selecct-value]");
const filterBtn = document.querySelectorAll("[data-filter-btn]");

if (select) {
  select.addEventListener("click", function () { elementToggleFunc(this); });
}

// add event in all select items
for (let i = 0; i < selectItems.length; i++) {
  selectItems[i].addEventListener("click", function () {

    let selectedValue = this.innerText.toLowerCase();
    if (selectValue) selectValue.innerText = this.innerText;
    if (select) elementToggleFunc(select);
    filterFunc(selectedValue);

  });
}

// filter variables
const filterItems = document.querySelectorAll("[data-filter-item]");
let filterAnimationTimer;
let filterAnimationFrame;

const filterFunc = function (selectedValue) {
  clearTimeout(filterAnimationTimer);
  cancelAnimationFrame(filterAnimationFrame);
  let visibleIndex = 0;

  for (let i = 0; i < filterItems.length; i++) {
    const shouldShow = selectedValue === "all" || selectedValue === filterItems[i].dataset.category;

    filterItems[i].classList.remove("is-filter-animating");

    if (shouldShow) {
      filterItems[i].classList.add("active");
      filterItems[i].style.setProperty("--filter-stagger", `${visibleIndex * 55}ms`);
      visibleIndex++;
    } else {
      filterItems[i].classList.remove("active");
      filterItems[i].style.removeProperty("--filter-stagger");
    }

  }

  filterAnimationFrame = requestAnimationFrame(function () {
    for (let i = 0; i < filterItems.length; i++) {
      if (filterItems[i].classList.contains("active")) {
        filterItems[i].classList.add("is-filter-animating");
      }
    }
  });

  filterAnimationTimer = setTimeout(function () {
    for (let i = 0; i < filterItems.length; i++) {
      filterItems[i].classList.remove("is-filter-animating");
    }
  }, 680 + visibleIndex * 55);

}

// add event in all filter button items for large screen
let lastClickedBtn = filterBtn[0];

for (let i = 0; i < filterBtn.length; i++) {

  filterBtn[i].addEventListener("click", function () {

    let selectedValue = this.innerText.toLowerCase();
    if (selectValue) selectValue.innerText = this.innerText;
    filterFunc(selectedValue);

    if (lastClickedBtn) lastClickedBtn.classList.remove("active");
    this.classList.add("active");
    lastClickedBtn = this;

  });

}



// contact form variables
const form = document.querySelector("[data-form]");
const formInputs = document.querySelectorAll("[data-form-input]");
const formBtn = document.querySelector("[data-form-btn]");

// add event to all form input field
for (let i = 0; i < formInputs.length; i++) {
  formInputs[i].addEventListener("input", function () {

    // check form validation
    if (form && formBtn && form.checkValidity()) {
      formBtn.removeAttribute("disabled");
    } else if (formBtn) {
      formBtn.setAttribute("disabled", "");
    }

  });
}



// page navigation variables
const navigationLinks = document.querySelectorAll("[data-nav-link]");
const pages = document.querySelectorAll("[data-page]");
const mainContent = document.querySelector(".main-content");
const navbarLinksWrap = document.querySelector(".navbar-links");
const navbarList = document.querySelector(".navbar-list");
const navbarIndicator = document.querySelector(".navbar-indicator");
const pageTransitionMs = 440;
const pageSwapDelayMs = 160;
let pageTransitionTimer;
let pageSwapTimer;

for (let i = 0; i < pages.length; i++) {
  pages[i].setAttribute("aria-hidden", String(!pages[i].classList.contains("active")));
}

const setMainContentTransitionHeight = function (targetPage) {
  if (!mainContent || !targetPage || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  mainContent.style.height = `${mainContent.offsetHeight}px`;

  const previousDisplay = targetPage.style.display;
  targetPage.style.display = "block";
  const targetHeight = targetPage.offsetHeight;
  targetPage.style.display = previousDisplay;

  return targetHeight;
};

const switchActivePage = function (targetPage, targetLink) {
  for (let i = 0; i < pages.length; i++) {
    const isTarget = pages[i] === targetPage;

    pages[i].classList.toggle("active", isTarget);
    pages[i].setAttribute("aria-hidden", String(!isTarget));
    navigationLinks[i].classList.toggle("active", navigationLinks[i] === targetLink);
  }

  if (targetPage.dataset.page === "about") {
    playGreetingAnimation();
  }
};

const updateNavbarIndicator = function (activeLink) {
  if (!navbarIndicator || !navbarLinksWrap || !navbarList || !activeLink) return;

  const wrapRect = navbarLinksWrap.getBoundingClientRect();
  const linkRect = activeLink.getBoundingClientRect();
  const insetX = linkRect.width * 0.22;

  navbarIndicator.style.width = `${Math.max(0, linkRect.width - insetX * 2)}px`;
  navbarIndicator.style.left = `${linkRect.left - wrapRect.left + insetX}px`;
  navbarLinksWrap.classList.add("is-indicator-ready");
};

const syncNavbarIndicator = function () {
  updateNavbarIndicator(document.querySelector("[data-nav-link].active"));
};

if (navbarLinksWrap && navbarIndicator && navbarList) {
  window.addEventListener("resize", syncNavbarIndicator);

  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(syncNavbarIndicator).observe(navbarLinksWrap);
  }

  window.requestAnimationFrame(syncNavbarIndicator);
}

// add event to all nav link
for (let i = 0; i < navigationLinks.length; i++) {
  navigationLinks[i].addEventListener("click", function () {
    const targetPageName = this.textContent.trim().toLowerCase();
    const currentPage = document.querySelector("[data-page].active");
    const targetPage = document.querySelector(`[data-page="${targetPageName}"]`);

    if (!targetPage || targetPage === currentPage) {
      updateNavbarIndicator(this);
      return;
    }

    clearTimeout(pageTransitionTimer);
    clearTimeout(pageSwapTimer);

    if (!mainContent || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      switchActivePage(targetPage, this);
      updateNavbarIndicator(this);
      return;
    }

    const targetHeight = setMainContentTransitionHeight(targetPage);
    for (let i = 0; i < navigationLinks.length; i++) {
      navigationLinks[i].classList.toggle("active", navigationLinks[i] === this);
    }

    mainContent.classList.add("is-switching");
    updateNavbarIndicator(this);

    pageSwapTimer = setTimeout(() => {
      switchActivePage(targetPage, this);
      mainContent.style.height = `${targetHeight}px`;

      window.requestAnimationFrame(function () {
        mainContent.classList.remove("is-switching");
      });

      pageTransitionTimer = setTimeout(function () {
        mainContent.style.height = "";
      }, pageTransitionMs);
    }, pageSwapDelayMs);

  });
}



// interactive about greeting — split-text reveal (React Bits–style staggered chars)
const greetingTitle = document.querySelector("[data-greeting-title]");
const greetingText = document.querySelector("[data-greeting-text]");
const greetingMessages = [
  "Hello there!",
  "Hi, I'm Jiayi!",
  "Welcome!"
];
let greetingIndex = 0;

const GREETING_STAGGER_MS = 32;
const GREETING_CHAR_DURATION_MS = 420;

const prefersGreetingReducedMotion = function () {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

const renderSplitGreeting = function (message) {
  if (!greetingText || !greetingTitle) return;

  greetingTitle.setAttribute(
    "aria-label",
    `${message} Activate to change greeting.`
  );

  if (prefersGreetingReducedMotion()) {
    greetingText.removeAttribute("aria-hidden");
    greetingText.textContent = message;
    return;
  }

  greetingText.setAttribute("aria-hidden", "true");
  greetingText.replaceChildren();

  const strip = [...message];
  const frag = document.createDocumentFragment();

  strip.forEach(function (ch) {
    const span = document.createElement("span");
    span.className = "greeting-char";
    span.textContent = ch === " " ? "\u00a0" : ch;
    frag.appendChild(span);
  });

  greetingText.appendChild(frag);

  window.requestAnimationFrame(function () {
    const chars = greetingText.querySelectorAll(".greeting-char");
    chars.forEach(function (el, i) {
      el.style.animationDelay = `${i * GREETING_STAGGER_MS}ms`;
      el.style.animationDuration = `${GREETING_CHAR_DURATION_MS}ms`;
      el.classList.add("greeting-char--in");
    });
  });
};

const playGreetingAnimation = function () {
  renderSplitGreeting(greetingMessages[greetingIndex]);
};

const cycleGreeting = function () {
  greetingIndex = (greetingIndex + 1) % greetingMessages.length;
  playGreetingAnimation();
};

if (greetingTitle && greetingText) {
  greetingTitle.addEventListener("click", cycleGreeting);
  greetingTitle.addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      cycleGreeting();
    }
  });

  playGreetingAnimation();
}



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