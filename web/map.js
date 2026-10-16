// Pathly: the Oldham map inside the orange site. Uses Akshita's map data (frontend/data/oldham-map.js, served at
// /map/data/) and the contract in web/README.md: picking an area calls Pathly.setDistrict(), and the map follows
// 'pathly:district' (picks made in the form) and 'pathly:results' (numbered pins for the matches).
(() => {
  const D = window.OLDHAM;
  const slot = document.getElementById('oldham-map');
  if (!D || !window.L || !slot) return; // keep the plain district buttons if the map can't load

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Postcode district to Oldham Council district, as in frontend/app.js. Approximate: some straddle two.
  const DISTRICT_OF = { OL1: 'Central', OL2: 'North', OL3: 'East', OL4: 'East', OL8: 'South', OL9: 'West', M35: 'South' };
  const DISTRICTS = ['Central', 'East', 'North', 'South', 'West'];
  // Map layer keys to the site's three opportunity types and their colours.
  const TYPE_OF_LAYER = { vol: 'voluntary', work: 'paid_work', social: 'social_work' };
  const COLOR = { voluntary: '--orange', paid_work: '--ink', social_work: '--tint' };  // the page's three colours
  // Opportunities in data/opportunities.json have no coordinates. Pin them at the provider's listing on the map
  // (same mapping as frontend/app.js).
  const API_PIN = {
    'work-get-oldham-working': 'Get Oldham Working', 'work-careers-positive-steps': 'Positive Steps career guidance',
    'work-empower-oldham': 'Positive Steps career guidance', 'social-young-carers': 'Positive Steps career guidance',
    'work-oldham-college-apprenticeships': 'Oldham College Careers Service', 'social-mahdlo': 'Mahdlo Youth Zone',
    'social-theatre-workshop': 'Oldham Theatre Workshop',
    // Youth Council and Barrier Breakers both meet at Rock Street Resource Centre, listed on the map as Barrier Breakers.
    'vol-youth-council': 'Barrier Breakers', 'social-barrier-breakers': 'Barrier Breakers',
  };

  const located = (i) => i.lat != null && i.lng != null;
  const outcode = (pc) => String(pc || '').trim().split(/\s+/)[0].toUpperCase();
  const districtOf = (i) => DISTRICT_OF[outcode(i.pc)] || null;
  // Point-in-polygon on the borough outline ([lat, lng] pairs), so places just over the border are left out.
  const inOldham = (lat, lng) => {
    const ring = D.boundary[0];
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [yi, xi] = ring[i];
      const [yj, xj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const PLACES = D.items.filter((i) => located(i) && i.ks.some((k) => TYPE_OF_LAYER[k]) && inOldham(i.lat, i.lng));
  const byName = (n) => D.items.find((i) => i.n === n && located(i));

  // ---- Base map, drawn from the data in the site's colours (no tile server) ----
  slot.replaceChildren();
  const canvas = document.createElement('div');
  canvas.className = 'map-canvas';
  canvas.setAttribute('role', 'region');
  canvas.setAttribute('aria-label', 'Map of Oldham. Use the area buttons below to choose without a mouse.');
  slot.append(canvas);

  const RING = D.boundary[0];
  const home = L.latLngBounds(RING).pad(0.03);
  const map = L.map(canvas, { zoomControl: true, minZoom: 10.5, maxZoom: 17, zoomSnap: 0.5, scrollWheelZoom: false,
    maxBounds: home.pad(0.6), attributionControl: true });
  map.attributionControl.setPrefix(false).addAttribution(
    'Map data &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors, '
    + 'listings: <a href="https://services.oldham.gov.uk/" target="_blank" rel="noopener">Oldham Council</a>');
  map.fitBounds(home);
  const draw = L.canvas({ padding: 0.4 });

  L.polygon(RING, { renderer: draw, stroke: false, fillColor: css('--land'), fillOpacity: 1, interactive: false }).addTo(map);
  D.parks.forEach((p) => L.polygon(p.p, { renderer: draw, stroke: false, fillColor: css('--tint'), fillOpacity: 0.55, interactive: false }).addTo(map));
  D.water.polys.forEach((w) => L.polygon(w.p, { renderer: draw, stroke: false, fillColor: css('--ink-soft'), fillOpacity: 1, interactive: false }).addTo(map));
  D.water.rivers.forEach((r) => L.polyline(r.p, { renderer: draw, color: css('--ink-soft'), weight: 2, interactive: false }).addTo(map));
  const ROAD = { motorway: 3.6, trunk: 2.8, primary: 2.2, secondary: 1.2 };
  Object.entries(ROAD).forEach(([cls, weight]) => (D.roads[cls] || []).forEach((r) =>
    L.polyline(r.p, { renderer: draw, color: css('--line'), weight, interactive: false }).addTo(map)));
  D.tram.lines.forEach((l) => L.polyline(l, { renderer: draw, color: css('--ink'), weight: 2, opacity: 0.6, interactive: false }).addTo(map));
  const outside = [[53.2, -2.8], [53.2, -1.3], [53.9, -1.3], [53.9, -2.8]];
  L.polygon([outside, RING], { renderer: draw, stroke: false, fillColor: css('--paper'), fillOpacity: 0.78, interactive: false }).addTo(map);
  L.polyline(RING.concat([RING[0]]), { renderer: draw, color: css('--ink'), weight: 2, interactive: false }).addTo(map);

  // ---- Districts: a label on the map and a button row below it ----
  const centre = {};
  DISTRICTS.forEach((d) => {
    const pts = Object.entries(D.outcodes).filter(([oc]) => DISTRICT_OF[oc] === d).map(([, v]) => [v.lat, v.lng]);
    if (pts.length) centre[d] = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
  });
  const districtLabels = {};
  Object.entries(centre).forEach(([d, at]) => {
    districtLabels[d] = L.marker(at, { keyboard: false, icon: L.divIcon({ className: '', iconSize: null, html: `<span class="map-district">${d}</span>` }) })
      .on('click', () => window.Pathly.setDistrict(d)).addTo(map);
  });

  const row = document.createElement('div');
  row.className = 'district-row';
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', 'Choose an area');
  ['Anywhere in Oldham', ...DISTRICTS].forEach((d) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.district = d;
    b.textContent = d === 'Anywhere in Oldham' ? 'Anywhere' : d;
    b.addEventListener('click', () => window.Pathly.setDistrict(d));
    row.append(b);
  });
  slot.append(row);

  // ---- Places: small dots for the chosen type and area; numbered pins for matches ----
  const dots = L.layerGroup().addTo(map);
  const pins = L.layerGroup().addTo(map);
  let pinned = {};

  function popup(i, match) {
    const link = /^https?:/i.test(i.url || '') ? `<a href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">Find out more</a>` : '';
    return `<div class="map-pop"><strong>${esc(match ? match.name : i.n)}</strong>`
      + (match ? `<p>${esc(match.why)}</p>` : (i.d ? `<p>${esc(i.d.length > 160 ? `${i.d.slice(0, 157)}...` : i.d)}</p>` : ''))
      + (i.a ? `<p class="map-pop-meta">${esc(i.a)}</p>` : '')
      + ((match && match.phone) || i.ph ? `<p class="map-pop-meta">Phone: ${esc((match && match.phone) || i.ph)}</p>` : '')
      + `${link}</div>`;
  }

  function drawDots() {
    dots.clearLayers();
    const { type, district } = window.Pathly.answers;
    const wanted = PLACES.filter((i) => (!type || i.ks.some((k) => TYPE_OF_LAYER[k] === type))
      && (!district || district === 'Anywhere in Oldham' || districtOf(i) === district));
    wanted.forEach((i) => {
      const t = TYPE_OF_LAYER[i.ks.find((k) => TYPE_OF_LAYER[k] && (!type || TYPE_OF_LAYER[k] === type))];
      L.circleMarker([i.lat, i.lng], { radius: 5, weight: 1.5, color: css('--ink'), fillColor: css(COLOR[t]), fillOpacity: 1 })
        .bindPopup(() => popup(i), { maxWidth: 280 }).bindTooltip(i.n).addTo(dots);
    });
    return wanted;
  }

  function focusDistrict(name) {
    row.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.district === name)));
    Object.entries(districtLabels).forEach(([d, m]) => m.getElement()?.firstElementChild?.classList.toggle('is-on', d === name));
    const shown = drawDots();
    if (!name || name === 'Anywhere in Oldham' || !shown.length) map.flyToBounds(home, { duration: 0.6 });
    else map.flyToBounds(L.latLngBounds(shown.map((i) => [i.lat, i.lng])).pad(0.25), { duration: 0.6, maxZoom: 14 });
  }

  function showMatches(matches) {
    pins.clearLayers();
    pinned = {};
    const points = [];
    matches.forEach((m, n) => {
      const at = API_PIN[m.id] && byName(API_PIN[m.id]);
      if (!at) return;
      const marker = L.marker([at.lat, at.lng], { zIndexOffset: 1000, title: `${n + 1}. ${m.name}`,
        icon: L.divIcon({ className: '', iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -14],
          html: `<span class="map-pin" style="--c:var(${COLOR[m.category] || '--orange'})">${n + 1}</span>` }) })
        .bindPopup(popup(at, m), { maxWidth: 280 }).addTo(pins);
      pinned[m.id] = marker;
      points.push([at.lat, at.lng]);
    });
    if (points.length) map.flyToBounds(L.latLngBounds(points).pad(0.4), { duration: 0.6, maxZoom: 14 });
  }

  window.PathlyMap = {
    canShow: (id) => Boolean(API_PIN[id] && byName(API_PIN[id])),
    show(id) {
      document.getElementById('map').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      const m = pinned[id];
      if (m) setTimeout(() => { map.flyTo(m.getLatLng(), 15, { duration: 0.5 }); m.openPopup(); }, 400);
    },
  };

  document.addEventListener('pathly:district', (e) => focusDistrict(e.detail.district));
  document.addEventListener('pathly:results', (e) => { drawDots(); showMatches(e.detail.matches); });
  // Redraw dots when the type changes (the type buttons and the Paths lanes).
  document.querySelectorAll('[data-type], [data-pick]').forEach((b) => b.addEventListener('click', () => setTimeout(drawDots)));
  new ResizeObserver(() => map.invalidateSize()).observe(canvas);
  focusDistrict(window.Pathly.answers.district || 'Anywhere in Oldham');
})();
