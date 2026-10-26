(() => {
  "use strict";

  const compact = window.matchMedia("(max-width: 640px), (max-width: 980px) and (pointer: coarse)");
  const abstract = document.getElementById("abstract");
  const abstractText = document.getElementById("abstract-text");
  const citation = document.getElementById("citation-details");
  if (!abstract || !abstractText || !citation) return;

  const abstractSummary = abstract.querySelector("summary");
  const abstractLabel = [...abstractSummary.childNodes].find(node =>
    node.nodeType === Node.TEXT_NODE && node.textContent.trim());
  const desktopLabel = abstractLabel.textContent;
  const citationSummary = citation.querySelector("summary");
  const paragraphs = [...document.querySelectorAll(".overview-copy > .overview-detail")].map(paragraph => {
    const anchor = document.createComment("Overview paragraph position");
    paragraph.before(anchor);
    return { paragraph, anchor };
  });

  let currentCompact = null;
  let mobileAbstractOpen = false;
  let desktopAbstractOpen = abstract.open;
  let mobileCitationOpen = false;

  function updateReadingLayout() {
    const mobile = compact.matches;
    if (mobile === currentCompact) return;
    if (currentCompact === true) {
      mobileAbstractOpen = abstract.open;
      mobileCitationOpen = citation.open;
    } else if (currentCompact === false) {
      desktopAbstractOpen = abstract.open;
    }
    currentCompact = mobile;

    paragraphs.forEach(({ paragraph, anchor }) => {
      if (mobile) abstract.insertBefore(paragraph, abstractText);
      else anchor.after(paragraph);
    });
    abstractLabel.textContent = mobile ? "Read more " : desktopLabel;
    abstract.open = mobile ? mobileAbstractOpen : desktopAbstractOpen;
    citation.open = mobile ? mobileCitationOpen : true;
    citationSummary.tabIndex = mobile ? 0 : -1;
  }

  citationSummary.addEventListener("click", event => {
    // Copy remains usable while the code is collapsed, and must not toggle it.
    if (!compact.matches || event.target.closest("#copy-citation")) event.preventDefault();
  });
  compact.addEventListener("change", updateReadingLayout);
  updateReadingLayout();
})();
