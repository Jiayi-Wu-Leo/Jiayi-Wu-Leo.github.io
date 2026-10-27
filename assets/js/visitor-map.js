'use strict';

// Observe the supplied embed; never recreate it on theme or viewport changes.
(() => {
  const container = document.getElementById('visitor-map-widget');
  const placeholder = container?.querySelector('[data-visitor-map-placeholder]');
  const embed = document.getElementById('mapmyvisitors');
  if (!container || !placeholder || !embed) return;

  const unavailable = () => {
    if (container.dataset.mapState === 'ready') return;
    container.dataset.mapState = 'unavailable';
    placeholder.querySelector('p').textContent = 'Visitor map is temporarily unavailable.';
  };

  const checkMap = () => {
    // The provider creates the vector overlay after its data response arrives.
    if (!container.querySelector('.jvectormap-container svg')) return;
    container.dataset.mapState = 'ready';
    placeholder.hidden = true;
    const link = container.querySelector('#mapmyvisitors-widget');
    if (link) {
      link.setAttribute('aria-label', 'Visitor locations on a world map — open statistics');
      if (link.getAttribute('href')?.startsWith('http://mapmyvisitors.com')) {
        link.href = link.href.replace('http:', 'https:');
      }
    }
    clearTimeout(timeout);
    observer.disconnect();
  };

  const observer = new MutationObserver(checkMap);
  observer.observe(container, { childList: true, subtree: true });
  const timeout = setTimeout(unavailable, 20000);
  embed.addEventListener('error', unavailable, { once: true });
  checkMap();
})();
