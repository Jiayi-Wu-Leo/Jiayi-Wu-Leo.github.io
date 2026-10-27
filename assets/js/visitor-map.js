'use strict';

// Observe the supplied embed; never recreate it on theme or viewport changes.
(() => {
  const container = document.getElementById('visitor-map-widget');
  const placeholder = container?.querySelector('[data-visitor-map-placeholder]');
  const embed = document.getElementById('mapmyvisitors');
  if (!container || !placeholder || !embed) return;

  // Convert the provider's white ocean into alpha inside SVG, rather than
  // relying on backdrop blending (which can leave a rectangle on mobile).
  // Only the static basemap image is reused; the tracking embed stays intact.
  const makeTransparentBasemap = () => {
    const map = container.querySelector('.mapmyvisitors-map');
    const background = map?.style.backgroundImage;
    const match = background?.match(/^url\(["']?(.*?)["']?\)$/);
    if (!map || !match) return;

    const svgNS = 'http://www.w3.org/2000/svg';
    const element = (name, attributes) => {
      const node = document.createElementNS(svgNS, name);
      Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
      return node;
    };
    const svg = element('svg', {
      class: 'visitor-map-basemap', width: '100%', height: '100%',
      'aria-hidden': 'true', focusable: 'false'
    });
    const defs = element('defs', {});
    const filter = element('filter', {
      id: 'visitor-map-land-filter', x: '0', y: '0', width: '100%', height: '100%',
      'color-interpolation-filters': 'sRGB'
    });
    filter.append(
      element('feColorMatrix', {
        in: 'SourceGraphic', type: 'matrix', result: 'landAlpha',
        values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2 0 0 0 2'
      }),
      element('feFlood', { class: 'visitor-map-land-color', result: 'landColor' }),
      element('feComposite', { in: 'landColor', in2: 'landAlpha', operator: 'in' })
    );
    // The provider also bakes decorative +/- symbols into the PNG itself.
    // Exclude that small, ocean-only bottom-left area from the basemap.
    const clip = element('clipPath', {
      id: 'visitor-map-ocean-clip', clipPathUnits: 'objectBoundingBox'
    });
    clip.append(element('path', { d: 'M0 0H1V1H.07V.75H0Z' }));
    defs.append(filter, clip);
    const image = element('image', {
      href: match[1], width: '100%', height: '100%',
      preserveAspectRatio: 'none', filter: 'url(#visitor-map-land-filter)',
      'clip-path': 'url(#visitor-map-ocean-clip)'
    });
    svg.append(defs, image);
    map.prepend(svg);
    container.dataset.mapSurface = 'transparent';
  };

  const unavailable = () => {
    if (container.dataset.mapState === 'ready') return;
    container.dataset.mapState = 'unavailable';
    placeholder.querySelector('p').textContent = 'Visitor map is temporarily unavailable.';
  };

  const checkMap = () => {
    // The provider creates the vector overlay after its data response arrives.
    if (!container.querySelector('.jvectormap-container svg')) return;
    makeTransparentBasemap();
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
