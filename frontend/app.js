/* Pathly front end: question flow, matching and the Oldham map. Settings live in config.js, colours in theme.css. */
(() => {
"use strict";
const D = window.OLDHAM;
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

const ICON = {
  work:'<rect x="2.5" y="5" width="11" height="8" rx="1.5"/><path d="M6 5V3.5h4V5M2.5 8.5h11"/>',
  vol:'<path d="M8 13.2S2.6 9.9 2.6 6.2A2.7 2.7 0 0 1 8 5a2.7 2.7 0 0 1 5.4 1.2C13.4 9.9 8 13.2 8 13.2z"/>',
  social:'<circle cx="5.8" cy="5.8" r="2"/><circle cx="11" cy="6.3" r="1.7"/><path d="M2.4 13c.4-2.3 1.7-3.5 3.4-3.5s3 1.2 3.4 3.5M10 10.1c1.6-.3 3.1.6 3.6 2.9"/>',
  money:'<path d="M10.8 4.7A2.3 2.3 0 0 0 6.7 6.3V12M4.8 8.7h4.4M4.8 12h6.6"/>',
  health:'<path d="M8 3.5v9M3.5 8h9"/>',
  online:'<path d="M2.4 6.6a8 8 0 0 1 11.2 0M4.4 8.9a5.1 5.1 0 0 1 7.2 0M6.5 11.1a2.1 2.1 0 0 1 3 0"/><circle cx="8" cy="13" r=".5"/>',
  support:'<circle cx="8" cy="8" r="5.5"/><path d="M8 7.4V11M8 5.2v.1"/>',
  tram:'<rect x="4" y="3" width="8" height="8.5" rx="2"/><path d="M5.5 14 7 11.5M10.5 14 9 11.5M4 7.5h8"/>',
  pin:'<path d="M8 14s4.5-4.2 4.5-7.5a4.5 4.5 0 0 0-9 0C3.5 9.8 8 14 8 14z"/><circle cx="8" cy="6.5" r="1.6"/>',
  lock:'<rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7"/>',
  student:'<path d="M1.5 6 8 3l6.5 3L8 9 1.5 6z"/><path d="M4.5 7.5v3c1 1 2.2 1.5 3.5 1.5s2.5-.5 3.5-1.5v-3"/>',
  compass:'<circle cx="8" cy="8" r="5.8"/><path d="m10.4 5.6-1.5 3.3-3.3 1.5 1.5-3.3 3.3-1.5z"/>',
};
const svg = (k, s = 16, w = 1.8) => `<svg width="${s}" height="${s}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

const LAYERS = {
  work:{label:"Work, training & careers", short:"Work & training"},
  vol:{label:"Volunteering", short:"Volunteering"},
  social:{label:"Clubs, groups & activities", short:"Clubs & activities"},
  money:{label:"Money & food help", short:"Money & food"},
  health:{label:"Health & wellbeing", short:"Health"},
  online:{label:"Free computers & getting online", short:"Get online"},
  support:{label:"Advice & other support", short:"Other support"},
};
const LKEYS = Object.keys(LAYERS);
const cvar = k => `var(--c-${k})`;

/* ---------- geometry helpers ---------- */
const R_EARTH = 6371000;
function dist(a, b){ const r = Math.PI/180, dLat=(b[0]-a[0])*r, dLng=(b[1]-a[1])*r;
  const h = Math.sin(dLat/2)**2 + Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dLng/2)**2; return 2*R_EARTH*Math.asin(Math.sqrt(h)); }
function inRing(pt, ring){ let c=false; for(let i=0,j=ring.length-1;i<ring.length;j=i++){ const [yi,xi]=ring[i],[yj,xj]=ring[j];
  if(((yi>pt[0])!==(yj>pt[0])) && (pt[1] < (xj-xi)*(pt[0]-yi)/(yj-yi)+xi)) c=!c; } return c; }
const RING = D.boundary[0];
const inOldham = p => inRing(p, RING);
const walkMin = m => Math.max(1, Math.round(m*1.3/80));
function fmtDist(m){ const mi = m/1609.34; return mi < 0.2 ? "under ¼ mile" : mi < 10 ? `${mi.toFixed(1)} miles` : `${Math.round(mi)} miles`; }
const STOPS = D.tram.stops.map(s => ({...s, kind:"Metrolink stop"})).concat(D.rail.stations.map(s => ({...s, kind:"train station"})));
function nearestStop(p){ let best=null, bd=1e12; for(const s of STOPS){ const d=dist(p,[s.lat,s.lng]); if(d<bd){bd=d; best=s;} } return best ? {s:best, d:bd} : null; }

/* ---------- items ---------- */
const ITEMS = D.items;
const BYID = Object.fromEntries(ITEMS.map(i => [i.id, i]));
const located = i => i.lat != null && i.lng != null;
for(const i of ITEMS){ i._t = [i.n, (i.cat||[]).join(" "), (i.sub||[]).join(" "), i.d||"", i.e||""].join(" ").toLowerCase(); }

/* ---------- state ---------- */
const st = { tab:"find", step:0, who:null, want:new Set(), enjoy:"", enjoyC:new Set(), study:"", studyC:new Set(), exp:"", expC:new Set(),
  area:"", lang:"English", helper:false, results:null, how:null, layers:new Set(["work","vol","social","money","online"]), tram:true, mode:"explore" };

const AREAS = { OL1:"Oldham town centre, Coldhurst, Chadderton North", OL2:"Royton, Shaw and Crompton", OL3:"Saddleworth: Uppermill, Delph, Dobcross", OL4:"Lees, Waterhead, Springhead, Grotton", OL8:"Hollinwood, Werneth, Fitton Hill, Hathershaw", OL9:"Chadderton, Westwood, Freehold", M35:"Failsworth" };

/* ---------- copy that changes for assisted mode ---------- */
const T = () => st.helper ? {
  q1:"Where are they right now?", s1:"You're filling this in with or for a young person. Use their words where you can.",
  student:"They're a student", studentD:"At school, college, sixth form or uni",
  efo:"They're exploring options", efoD:"Not in education, between things, or working and want a change",
  q2:"What are they looking for?", s2:"Pick as many as fit.",
  q3:"Tell us a bit about them", enjoyL:"What do they enjoy?", studyL:"What are they studying?", interestL:"What are they interested in?", expL:"Any past work or experience?",
  areaL:"Roughly where do they live?", resQ:"Options for them", you:"them" } : {
  q1:"Where are you right now?", s1:"There are no wrong answers. This takes about a minute.",
  student:"I'm a student", studentD:"At school, college, sixth form or uni",
  efo:"I'm exploring my options", efoD:"Not in education, between things, or working and want a change",
  q2:"What are you looking for?", s2:"Pick as many as you like.",
  q3:"Tell us a bit about you", enjoyL:"What do you enjoy?", studyL:"What are you studying?", interestL:"What are you interested in?", expL:"Any past work or experience?",
  areaL:"Roughly where do you live?", resQ:"Your next steps", you:"you" };

const WANT = {
  vol:{label:"Voluntary work", d:"Give some time, learn skills, meet people", layers:["vol"], k:"vol"},
  paid:{label:"Paid work", d:"Jobs, apprenticeships, training and careers help", layers:["work","online"], k:"work"},
  social:{label:"Social work", d:"Clubs, groups and community projects with other people", layers:["social"], k:"social"},
};
const ENJOY = ["Art & drawing","Music","Sport & fitness","Gaming & tech","Cooking","Outdoors & nature","Helping people","Animals","Drama & dance","Fashion & beauty","Cars & fixing things","Writing","Business ideas"];
const STUDY = ["GCSEs","A levels","BTEC","T level","Apprenticeship","University","ESOL / English"];
const EXP = ["None yet","Retail","Hospitality","Care","Warehouse","Volunteering","Childcare","Building trades"];
const LANGS = ["English","Urdu","Bengali","Polish","Arabic","Romanian"];

/* ---------- Pathly API and safety rules ---------- */
const CFG = window.PATHLY_CONFIG || {};
const API_URL = String(CFG.apiUrl || "").replace(/\/+$/, "");
const SAFETY = window.PATHLY_SAFETY || {pii:[], crisis:[], borough:"Oldham"};
const PII = SAFETY.pii.map(([tag, src, flags]) => [tag, new RegExp(src, "g" + (flags || ""))]);
const CRISIS = SAFETY.crisis.map(r => ({...r, res:r.patterns.map(p => new RegExp(p, "i"))}));
/** Replace phone numbers, emails, postcodes and other identifiers with tags, using the rules exported from safety.py. */
function redact(text){ let t = String(text || ""); for(const [tag, re] of PII) t = t.replace(re, `[${tag}]`); return t; }
/** Return the most severe crisis rule the text matches, mirroring safety.check_crisis. */
function checkCrisis(text){
  const low = String(text || "").toLowerCase(); let best = null;
  for(const r of CRISIS) if(r.res.some(re => re.test(low)) && (!best || r.severity > best.severity)) best = r;
  return best ? {label:best.label, message:best.message.replace("{borough}", SAFETY.borough)} : null;
}
const TYPE_OF = {vol:"voluntary", paid:"paid_work", social:"social_work"};
const LAYER_OF_TYPE = {voluntary:"vol", paid_work:"work", social_work:"social"};
/* Postcode district to Oldham Council district, as used by the API. Approximate: some districts straddle two. */
const DISTRICT_OF = {OL1:"Central", OL2:"North", OL3:"East", OL4:"East", OL8:"South", OL9:"West", M35:"South"};
/* Opportunities in data/opportunities.json have no coordinates. Pin them at the provider's verified listing on the map. */
const API_PIN = {"work-get-oldham-working":"Get Oldham Working", "work-careers-positive-steps":"Positive Steps career guidance",
  "work-empower-oldham":"Positive Steps career guidance", "social-young-carers":"Positive Steps career guidance",
  "work-oldham-college-apprenticeships":"Oldham College Careers Service", "social-mahdlo":"Mahdlo Youth Zone",
  "social-theatre-workshop":"Oldham Theatre Workshop",
  /* Youth Council and Barrier Breakers both meet at Rock Street Resource Centre, listed on the map as Barrier Breakers. */
  "vol-youth-council":"Barrier Breakers", "social-barrier-breakers":"Barrier Breakers"};

const SYN = {
  "art & drawing":["art","arts","creative","drawing","paint","craft","design","gallery","museum"],
  "music":["music","band","choir","sing","dj","instrument"],
  "sport & fitness":["sport","football","boxing","swim","gym","fitness","running","parkrun","cricket","netball","rugby","martial","dance","leisure","active"],
  "gaming & tech":["digital","tech","computer","coding","hack","online","gaming","esports"],
  "cooking":["food","cook","kitchen","cafe","catering","hospitality"],
  "outdoors & nature":["park","parks","countryside","nature","garden","forest","walking","environment","wildlife","trees","outdoor"],
  "helping people":["volunteer","volunteering","care","support","community","help","befriend","youth"],
  "animals":["animal","wildlife","nature","farm"],
  "drama & dance":["theatre","drama","dance","perform","acting","stage"],
  "fashion & beauty":["fashion","beauty","textile","sewing","hair"],
  "cars & fixing things":["engineering","mechanic","construction","repair","manufacturing","bike"],
  "writing":["writing","library","media","creative","reading"],
  "business ideas":["business","enterprise","start","self","employment"],
  "retail":["retail","shop","customer"], "hospitality":["hospitality","cafe","food","catering"], "care":["care","support","health","social"],
  "warehouse":["warehouse","logistics","driver"], "childcare":["childcare","children","early","school"], "building trades":["construction","building","trade","engineering"],
  "esol / english":["esol","english","language"], "apprenticeship":["apprenticeship","apprenticeships","training"], "university":["university","degree","higher"],
  "a levels":["college","sixth","study"], "btec":["college","course"], "t level":["college","placement","technical"], "gcses":["school","study","tuition"],
};
const STOP = new Set("the and for with you your are was have like into from that this not but all any some just really also about want get got can our out then them they what when where who will would very much more lot lots love like things thing stuff doing".split(" "));
const AVOID = /older people|over 50|over-50|aged 50|aged 55|aged 60|aged 65|dementia|care home|pre-school|aged 0 to 5|under 5s|toddler|baby|babies|parent and child|retired|primary school|aged [4-7] to|tuition for children|key stage [12]/;

/* ---------- map ---------- */
const map = L.map("map", { zoomControl:false, minZoom:11, maxZoom:17, zoomSnap:.5, zoomDelta:.5, wheelPxPerZoomLevel:90,
  maxBounds:L.latLngBounds([53.40,-2.40],[53.70,-1.75]), maxBoundsViscosity:.7, attributionControl:true });
map.attributionControl.setPrefix(false).addAttribution('Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors · Listings: <a href="https://services.oldham.gov.uk/" target="_blank" rel="noopener">Oldham Council</a> · Food bank: <a href="https://www.givefood.org.uk/" target="_blank" rel="noopener">Give Food</a>');
const panes = {land:200, water:230, parks:240, roads:300, rail:320, tram:340, mask:380, stops:420, ring:430, labels:450};
for(const [p,z] of Object.entries(panes)){ map.createPane(p).style.zIndex = z; }
map.getPane("labels").style.pointerEvents = "none";
const rr = {}; for(const p of ["land","water","parks","roads","rail","tram","mask","stops","ring"]) rr[p] = L.canvas({pane:p, padding:.4, tolerance:p==="stops"?6:3});

const G = { land:[], water:[], rivers:[], parks:[], case:[], fill:[], rail:[], tram:[], tramCase:[], stops:[], mask:null, bound:null };
const outer = [[53.2,-2.8],[53.2,-1.3],[53.9,-1.3],[53.9,-2.8]];
G.land.push(L.polygon(RING, {renderer:rr.land, stroke:false, fillOpacity:1, interactive:false}).addTo(map));
for(const w of D.water.polys){ const pl = L.polygon(w.p, {renderer:rr.water, weight:1, fillOpacity:1, interactive:!!w.n}); if(w.n) pl.bindTooltip(w.n, {sticky:true}); G.water.push(pl.addTo(map)); }
for(const r of D.water.rivers){ const pl = L.polyline(r.p, {renderer:rr.water, weight:2, interactive:!!r.n}); if(r.n) pl.bindTooltip(r.n, {sticky:true}); G.rivers.push(pl.addTo(map)); }
for(const p of D.parks){ const pl = L.polygon(p.p, {renderer:rr.parks, stroke:false, fillOpacity:1}); pl.bindTooltip(p.n, {sticky:true}); G.parks.push(pl.addTo(map)); }
const RW = {motorway:[7,4.5], trunk:[5.2,3.4], primary:[4.6,2.9], secondary:[3,1.7]};
for(const cls of ["secondary","primary","trunk","motorway"]){
  for(const r of D.roads[cls]){
    const c = L.polyline(r.p, {renderer:rr.roads, weight:RW[cls][0], lineCap:"round", lineJoin:"round", interactive:false}); c._cls = cls; G.case.push(c.addTo(map));
  }
}
for(const cls of ["secondary","primary","trunk","motorway"]){
  for(const r of D.roads[cls]){
    const nm = [r.r, r.n].filter(Boolean).join(" · ");
    const f = L.polyline(r.p, {renderer:rr.roads, weight:RW[cls][1], lineCap:"round", lineJoin:"round", interactive:!!nm && cls!=="secondary"}); f._cls = cls;
    if(nm && cls!=="secondary") f.bindTooltip(nm, {sticky:true});
    G.fill.push(f.addTo(map));
  }
}
for(const l of D.rail.lines) G.rail.push(L.polyline(l, {renderer:rr.rail, weight:1.6, dashArray:"5 4", interactive:false}).addTo(map));
for(const l of D.tram.lines){ G.tramCase.push(L.polyline(l, {renderer:rr.tram, weight:6, interactive:false}).addTo(map)); G.tram.push(L.polyline(l, {renderer:rr.tram, weight:3.4, interactive:false}).addTo(map)); }
G.mask = L.polygon([outer, RING], {renderer:rr.mask, stroke:false, fillOpacity:.62, interactive:false}).addTo(map);
G.bound = L.polyline(RING.concat([RING[0]]), {renderer:rr.mask, weight:2.2, interactive:false}).addTo(map);

const labelLayer = L.layerGroup().addTo(map);
const lbl = (lat,lng,text,cls) => L.marker([lat,lng], {pane:"labels", interactive:false, keyboard:false, icon:L.divIcon({className:"lbl "+cls, html:`<div>${esc(text)}</div>`, iconSize:[0,0]})}).addTo(labelLayer);
for(const p of D.places){ if(!inOldham([p.lat,p.lng])) continue; lbl(p.lat, p.lng, p.n, "r"+p.r + (p.n==="Oldham" ? " big" : "")); }
lbl(53.5585, -1.9905, "Saddleworth", "r1");
const seenPark = new Set();
for(const p of D.parkPts){ if(seenPark.has(p.n) || !inOldham([p.lat,p.lng])) continue; seenPark.add(p.n); lbl(p.lat, p.lng, p.n, "park"); }
for(const w of D.water.polys){ if(!w.n || w.p.length < 8) continue; const b = L.latLngBounds(w.p).getCenter(); if(inOldham([b.lat,b.lng])) lbl(b.lat, b.lng, w.n, "water"); }

/* Metrolink + rail stops */
const stopLayer = L.layerGroup().addTo(map);
for(const s of STOPS){
  const inside = inOldham([s.lat,s.lng]);
  const m = L.circleMarker([s.lat,s.lng], {renderer:rr.stops, radius: s.kind==="train station"?4.5:5, weight:2.2, opacity: inside?1:.5, fillOpacity: inside?1:.5});
  m._stop = s; m.bindTooltip(`${s.n} · ${s.kind}`, {direction:"top", offset:[0,-6]});
  m.on("click", () => openStop(s, m));
  G.stops.push(m); m.addTo(stopLayer);
  if(inside) L.marker([s.lat,s.lng], {pane:"labels", interactive:false, keyboard:false, icon:L.divIcon({className:"lbl stop", html:`<div>${esc(s.n)}</div>`, iconSize:[0,0]})}).addTo(stopLayer);
}

function restyle(){
  const v = n => css(n);
  G.land.forEach(l => l.setStyle({fillColor:v("--m-land")}));
  G.water.forEach(l => l.setStyle({fillColor:v("--m-water"), color:v("--m-water-line")}));
  G.rivers.forEach(l => l.setStyle({color:v("--m-water-line")}));
  G.parks.forEach(l => l.setStyle({fillColor:v("--m-park")}));
  G.case.forEach(l => l.setStyle({color: l._cls==="motorway" ? v("--m-mway-case") : v("--m-case")}));
  G.fill.forEach(l => l.setStyle({color: l._cls==="motorway" ? v("--m-mway") : v("--m-road")}));
  G.rail.forEach(l => l.setStyle({color:v("--m-rail")}));
  G.tramCase.forEach(l => l.setStyle({color:v("--m-land"), opacity:.9}));
  G.tram.forEach(l => l.setStyle({color:v("--m-tram")}));
  G.mask.setStyle({fillColor:v("--m-out")});
  G.bound.setStyle({color:v("--m-bound"), opacity:.75});
  G.stops.forEach(m => m.setStyle({color: m._stop.kind==="train station" ? v("--m-rail") : v("--m-tram"), fillColor:v("--m-land")}));
  if(youRing) youRing.setStyle({color:v("--accent"), fillColor:v("--accent")});
  if(stopRing) stopRing.setStyle({color:v("--m-tram"), fillColor:v("--m-tram")});
}
let youRing = null, youMark = null, stopRing = null;
const homeBounds = L.latLngBounds(RING).pad(.02);
map.fitBounds(homeBounds);
function zoomClasses(){ const z = map.getZoom(), c = map.getContainer(); c.classList.toggle("z13", z>=12.5); c.classList.toggle("z14", z>=13.5); c.classList.toggle("z15", z>=15); }
map.on("zoomend", zoomClasses); zoomClasses();
$("#zin").onclick = () => map.zoomIn(); $("#zout").onclick = () => map.zoomOut(); $("#zreset").onclick = () => map.flyToBounds(homeBounds, {duration:.6});

/* ---------- markers ---------- */
const cluster = L.markerClusterGroup({ showCoverageOnHover:false, maxClusterRadius:44, disableClusteringAtZoom:16, spiderfyOnMaxZoom:true,
  iconCreateFunction(c){
    const ms = c.getAllChildMarkers(), n = ms.length, cnt = {};
    for(const m of ms) cnt[m.options.k] = (cnt[m.options.k]||0) + 1;
    let a = 0; const parts = [];
    for(const k of LKEYS){ if(!cnt[k]) continue; const b = a + cnt[k]/n*360; parts.push(`var(--c-${k}) ${a}deg ${b}deg`); a = b; }
    const s = n > 50 ? 48 : n > 15 ? 42 : 36;
    return L.divIcon({className:"", iconSize:[s,s], html:`<div class="cl" style="width:${s}px;height:${s}px;background:conic-gradient(${parts.join(",")})"><b>${n}</b></div>`});
  }}).addTo(map);
const MK = {};
function pinIcon(i, num){ const k = i.k;
  return num ? L.divIcon({className:"", iconSize:[34,34], iconAnchor:[17,17], popupAnchor:[0,-14], html:`<div class="pin num" style="--c:${cvar(k)}">${num}</div>`})
             : L.divIcon({className:"", iconSize:[26,26], iconAnchor:[13,13], popupAnchor:[0,-11], html:`<div class="pin" style="--c:${cvar(k)}">${svg(k,14,2)}</div>`}); }
function marker(i){
  if(MK[i.id]) return MK[i.id];
  const m = L.marker([i.lat,i.lng], {icon:pinIcon(i), title:i.n, alt:i.n, k:i.k, riseOnHover:true});
  m._item = i;
  m.bindPopup(() => popupHTML(i), {maxWidth:320, minWidth:240, autoPanPadding:[24,24]});
  m.on("popupopen", e => wirePopup(e.popup.getElement(), i));
  m.on("mouseover", () => hlRes(i.id, true)); m.on("mouseout", () => hlRes(i.id, false));
  return MK[i.id] = m;
}
let numbered = [];
function refreshMarkers(){
  cluster.clearLayers(); numbered.forEach(m => map.removeLayer(m)); numbered = [];
  if(st.mode === "results" && st.results){
    st.results.forEach((r, n) => { const i = BYID[r.id]; if(!located(i)) return;
      const m = L.marker([i.lat,i.lng], {icon:pinIcon(i, n+1), title:`${n+1}. ${i.n}`, alt:i.n, zIndexOffset:1000, riseOnHover:true});
      m.bindPopup(() => popupHTML(i, r), {maxWidth:320, minWidth:240, autoPanPadding:[24,24]}); m.on("popupopen", e => wirePopup(e.popup.getElement(), i));
      m.on("mouseover", () => hlRes(i.id, true)); m.on("mouseout", () => hlRes(i.id, false));
      m._item = i; numbered.push(m.addTo(map)); });
  } else {
    cluster.addLayers(ITEMS.filter(i => located(i) && i.ks.some(k => st.layers.has(k))).map(marker));
  }
  stopLayer[st.tram ? "addTo" : "remove"](map);
  renderChips(); renderLegend(); if(st.tab === "explore") renderInView();
}

/* popups */
function nearText(i){
  if(!located(i)) return "";
  const p = [i.lat,i.lng], out = [];
  if(st.area && D.outcodes[st.area]){ const o = D.outcodes[st.area]; out.push(`About ${fmtDist(dist([o.lat,o.lng],p))} from the middle of ${st.area}`); }
  const ns = nearestStop(p); if(ns && ns.d < 2500) out.push(`${walkMin(ns.d)} min walk from ${ns.s.n} ${ns.s.kind}`);
  return out.join(" · ");
}
function factsHTML(i){
  const f = [];
  if(i.e) f.push(`<span><b>Who it's for:</b> ${esc(i.e)}</span>`);
  if(i.how) f.push(`<span><b>How to start:</b> ${esc(i.how)}</span>`);
  if(i.c) f.push(`<span><b>Cost:</b> ${esc(i.c)}</span>`);
  if(i.t) f.push(`<span><b>When:</b> ${esc(i.t)}</span>`);
  if(i.a || i.pc) f.push(`<span><b>Where:</b> ${esc([i.a, i.pc && !(i.a||"").includes(i.pc) ? i.pc : ""].filter(Boolean).join(", "))}</span>`);
  if(!located(i)) f.push(`<span><b>Where:</b> ${esc(i.area || "Online or by phone")}</span>`);
  if(i.pinNote) f.push(`<span>${esc(i.pinNote)}</span>`);
  return f.length ? `<div class="facts">${f.join("")}</div>` : "";
}
function actsHTML(i){
  const a = [];
  if(i.ph) a.push(`<span class="phone">${esc(i.ph)}</span><button class="btn ghost small" data-copy="${esc(i.ph)}">Copy number</button>`);
  if(i.url && /^https?:/i.test(i.url)) a.push(`<a class="btn ghost small" href="${esc(i.url)}" target="_blank" rel="noopener">Website ↗</a>`);
  if(located(i)) a.push(`<a class="btn ghost small" href="https://www.google.com/maps/dir/?api=1&destination=${i.lat},${i.lng}&travelmode=transit" target="_blank" rel="noopener">Directions ↗</a>`);
  return a.length ? `<div class="acts">${a.join("")}</div>` : "";
}
const srcHTML = i => /^https?:/i.test(i.src || "")
  ? `<a class="src" href="${esc(i.src)}" target="_blank" rel="noopener">Source: ${esc(i.from)}${i.fetched ? `, updated ${esc(i.fetched.slice(0,10))}` : ""} ↗</a>`
  : `<span class="src">Source: ${esc(i.from)}</span>`;
function popupHTML(i, r){
  const nt = nearText(i);
  return `<div class="pop" style="--c:${cvar(i.k)}"><span class="pill">${esc(LAYERS[i.k].short)}</span><h4>${esc(i.n)}</h4>
    ${r && r.why ? `<p><b>Why it fits:</b> ${esc(r.why)}</p>` : ""}${i.d ? `<p>${esc(i.d)}</p>` : ""}
    ${nt ? `<p class="near">${esc(nt)}</p>` : ""}${factsHTML(i)}${actsHTML(i)}${srcHTML(i)}</div>`;
}
function wireCopy(root){
  root.querySelectorAll("[data-copy]").forEach(b => b.onclick = () => {
    const t = b.dataset.copy, done = () => { b.textContent = "Copied"; setTimeout(() => b.textContent = "Copy number", 1600); };
    try { navigator.clipboard.writeText(t).then(done, () => selectPhone(b)); } catch(e){ selectPhone(b); }
  });
}
function selectPhone(b){ const ph = b.previousElementSibling; if(!ph) return; const r = document.createRange(); r.selectNodeContents(ph); const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = "Selected, press copy"; }
function wirePopup(el, i){ if(!el) return; wireCopy(el); }

function openStop(s, m){
  if(stopRing) map.removeLayer(stopRing);
  stopRing = L.circle([s.lat,s.lng], {renderer:rr.ring, radius:800, weight:1.5, dashArray:"4 4", fillOpacity:.07, interactive:false, color:css("--m-tram"), fillColor:css("--m-tram")}).addTo(map);
  const near = ITEMS.filter(i => located(i) && i.ks.some(k => st.layers.has(k))).map(i => ({i, d:dist([s.lat,s.lng],[i.lat,i.lng])})).filter(x => x.d < 800).sort((a,b) => a.d-b.d);
  const html = `<div class="pop"><span class="pill" style="--c:var(--muted)">${s.kind==="train station" ? "Train station" : "Metrolink"}</span><h4>${esc(s.n)}</h4>
    <p class="near">${near.length ? `${near.length} place${near.length>1?"s":""} within a 10 minute walk (the yellow circle)` : "No places on the map within a 10 minute walk with the layers you have on."}</p>
    ${near.length ? `<ul>${near.slice(0,6).map(x => `<li><button data-go="${x.i.id}">${esc(x.i.n)}</button> <small>${walkMin(x.d)} min</small></li>`).join("")}</ul>` : ""}</div>`;
  L.popup({maxWidth:300}).setLatLng([s.lat,s.lng]).setContent(html).openOn(map);
  setTimeout(() => document.querySelectorAll(".pop [data-go]").forEach(b => b.onclick = () => focusItem(b.dataset.go)), 0);
  map.flyTo([s.lat,s.lng], Math.max(map.getZoom(), 14.5), {duration:.5});
}
function focusItem(id){
  const i = BYID[id]; if(!i || !located(i)) return;
  const nm = numbered.find(m => m._item === i);
  if(nm){ map.flyTo([i.lat,i.lng], Math.max(map.getZoom(), 15), {duration:.5}); setTimeout(() => nm.openPopup(), 550); return; }
  const m = marker(i);
  if(st.mode === "results"){ st.mode = "explore"; refreshMarkers(); }
  if(!cluster.hasLayer(m)){ st.layers.add(i.k); refreshMarkers(); }
  cluster.zoomToShowLayer(m, () => m.openPopup());
}

/* layer chips + legend */
function countFor(k){ return ITEMS.filter(i => located(i) && i.ks.includes(k)).length; }
const COUNTS = Object.fromEntries(LKEYS.map(k => [k, countFor(k)]));
function renderChips(){
  const box = $("#lchips"), ban = $("#mbanner");
  if(st.mode === "results" && st.results){
    box.hidden = true; ban.hidden = false;
    const n = st.results.filter(r => located(BYID[r.id])).length;
    $("#mbannerText").textContent = n ? `Showing ${n} match${n===1?"":"es"} on the map` : "Your matches are online or by phone";
    return;
  }
  ban.hidden = true; box.hidden = false;
  box.innerHTML = LKEYS.map(k => `<button class="lchip" style="--c:${cvar(k)}" data-l="${k}" aria-pressed="${st.layers.has(k)}"><i>${svg(k,11,2.2)}</i>${esc(LAYERS[k].short)} <span style="opacity:.6">${COUNTS[k]}</span></button>`).join("")
    + `<button class="lchip tram" data-l="tram" aria-pressed="${st.tram}"><i>${svg("tram",11,2.2)}</i>Metrolink & trains</button>`;
  box.querySelectorAll("[data-l]").forEach(b => b.onclick = () => toggleLayer(b.dataset.l));
}
function toggleLayer(k){ if(k === "tram") st.tram = !st.tram; else st.layers.has(k) ? st.layers.delete(k) : st.layers.add(k); refreshMarkers(); }
$("#mbannerBtn").onclick = () => { st.mode = "explore"; refreshMarkers(); };
function renderLegend(){
  $("#legend").innerHTML = `<span><i class="lg-line"></i>Metrolink</span><span><i class="lg-rail"></i>Railway</span><span><i class="lg-park"></i>Park</span><span><i class="lg-water"></i>Water</span>${st.area ? `<span><i class="lg-you"></i>Around ${esc(st.area)}</span>` : ""}`;
}

/* search */
const SIDX = ITEMS.filter(located).map(i => ({t:i.n, k:i.k, sub:LAYERS[i.k].short, go:() => focusItem(i.id)}))
  .concat(STOPS.filter(s => inOldham([s.lat,s.lng])).map(s => ({t:s.n, k:"tram", sub:s.kind, go:() => openStop(s)})))
  .concat(D.places.filter(p => inOldham([p.lat,p.lng])).map(p => ({t:p.n, k:"place", sub:"Area", go:() => map.flyTo([p.lat,p.lng], p.r===1?14:15, {duration:.6})})));
const qEl = $("#q"), sres = $("#sres"); let sHits = [], sAct = 0;
qEl.addEventListener("input", () => {
  const q = qEl.value.trim().toLowerCase();
  if(q.length < 2){ sres.hidden = true; return; }
  sHits = SIDX.filter(x => x.t.toLowerCase().includes(q)).sort((a,b) => a.t.toLowerCase().indexOf(q) - b.t.toLowerCase().indexOf(q)).slice(0,8); sAct = 0;
  sres.innerHTML = sHits.length ? sHits.map((x,n) => `<li><button data-n="${n}" class="${n===0?"act":""}"><i style="--c:${x.k==="tram"?"var(--m-tram)":x.k==="place"?"var(--muted)":cvar(x.k)}"></i>${esc(x.t)}<small>${esc(x.sub)}</small></button></li>`).join("") : `<li style="padding:8px;color:var(--muted);font-size:14px">Nothing on the map called that.</li>`;
  sres.hidden = false;
  sres.querySelectorAll("[data-n]").forEach(b => b.onclick = () => pickSearch(+b.dataset.n));
});
qEl.addEventListener("keydown", e => {
  if(sres.hidden || !sHits.length) return;
  if(e.key === "ArrowDown" || e.key === "ArrowUp"){ e.preventDefault(); sAct = (sAct + (e.key==="ArrowDown"?1:-1) + sHits.length) % sHits.length; sres.querySelectorAll("button").forEach((b,n) => b.classList.toggle("act", n===sAct)); }
  if(e.key === "Enter"){ e.preventDefault(); pickSearch(sAct); }
  if(e.key === "Escape"){ sres.hidden = true; }
});
document.addEventListener("click", e => { if(!e.target.closest(".search")) sres.hidden = true; });
function pickSearch(n){ const x = sHits[n]; if(!x) return; sres.hidden = true; qEl.value = x.t; x.go(); }

/* you-are-around-here ring */
function setArea(a){
  st.area = a;
  if(youRing){ map.removeLayer(youRing); map.removeLayer(youMark); youRing = youMark = null; }
  const o = D.outcodes[a]; renderLegend();
  if(!o) return;
  youRing = L.circle([o.lat,o.lng], {renderer:rr.ring, radius:1609, weight:2, dashArray:"6 5", fillOpacity:.06, interactive:false, color:css("--accent"), fillColor:css("--accent")}).addTo(map);
  youMark = L.marker([o.lat,o.lng], {pane:"ring", interactive:false, keyboard:false, icon:L.divIcon({className:"youlbl", iconSize:[0,0], html:`<div class="youpin" style="transform:translate(-50%,-50%)"></div><div>Around ${esc(a)}</div>`})}).addTo(map);
}

/* ---------- panel ---------- */
const pbody = $("#pbody");
function setTab(t){
  st.tab = t; $("#tabFind").setAttribute("aria-selected", t==="find"); $("#tabExplore").setAttribute("aria-selected", t==="explore");
  if(t === "explore"){ st.mode = "explore"; refreshMarkers(); renderExplore(); } else { if(st.results && st.step === 3){ st.mode = "results"; refreshMarkers(); } render(); }
}
$("#tabFind").onclick = () => setTab("find"); $("#tabExplore").onclick = () => setTab("explore");
$("#helperToggle").onchange = e => { st.helper = e.target.checked; if(st.tab === "find") render(); };
$("#pfoot").innerHTML = `${ITEMS.length} places from Oldham Council's service directory, Give Food and OpenStreetMap, all fetched 16 Oct 2026. Every result links to where it came from. Prototype: check details with the provider.`;

const stepsBar = n => `<ol class="steps" aria-label="Step ${Math.min(n+1,4)} of 4">${[0,1,2,3].map(s => `<li class="${s<=n?"on":""}"></li>`).join("")}</ol>`;
function render(){
  const t = T();
  if(st.step === 0){
    pbody.innerHTML = `${stepsBar(0)}<p class="eyebrow">Step 1 of 3</p><h2 class="q">${t.q1}</h2><p class="sub">${t.s1}</p>
      <div class="choices">
        ${choiceBtn("who","student", t.student, t.studentD, "student", "var(--accent)", st.who==="student")}
        ${choiceBtn("who","efo", t.efo, t.efoD, "compass", "var(--accent)", st.who==="efo")}
      </div>
      <div class="example"><b>Pitching this?</b>Load an example young person and jump straight to the results. <button class="link" id="demo">Try Aisha, 17, from Hollinwood</button></div>`;
    pbody.querySelectorAll("[data-who]").forEach(b => b.onclick = () => { st.who = b.dataset.who; st.step = 1; render(); });
    $("#demo").onclick = runDemo;
  } else if(st.step === 1){
    pbody.innerHTML = `${stepsBar(1)}<p class="eyebrow">Step 2 of 3</p><h2 class="q">${t.q2}</h2><p class="sub">${t.s2}</p>
      <div class="choices">${Object.entries(WANT).map(([k,w]) => choiceBtn("want", k, w.label, w.d, w.k, cvar(w.k), st.want.has(k), true)).join("")}</div>
      <div class="nav"><button class="btn ghost" id="back">Back</button><button class="btn primary" id="next" ${st.want.size?"":"disabled"}>Next</button>
      <button class="link" id="all" style="margin-left:auto">Not sure? Show all three</button></div>`;
    pbody.querySelectorAll("[data-want]").forEach(b => b.onclick = () => { const k = b.dataset.want; st.want.has(k) ? st.want.delete(k) : st.want.add(k); render(); });
    $("#back").onclick = () => { st.step = 0; render(); };
    $("#next").onclick = () => { st.step = 2; render(); };
    $("#all").onclick = () => { st.want = new Set(Object.keys(WANT)); st.step = 2; render(); };
  } else if(st.step === 2){
    const stu = st.who === "student";
    pbody.innerHTML = `${stepsBar(2)}<p class="eyebrow">Step 3 of 3</p><h2 class="q">${t.q3}</h2><p class="sub">Type anything, or tap the ones that fit. Short answers are fine.</p>
      <form id="f3" novalidate>
      <div class="field"><label class="l" for="enjoy">${stu ? t.enjoyL : t.interestL}</label>
        <textarea id="enjoy" placeholder="${stu ? "e.g. drawing, football, helping my little brother with homework" : "e.g. cooking, fixing bikes, working with kids"}">${esc(st.enjoy)}</textarea>
        <div class="chips" role="group" aria-label="Quick picks">${ENJOY.map(c => chip("enjoyC", c)).join("")}</div></div>
      <div class="field"><label class="l" for="study">${stu ? t.studyL : t.expL}</label>
        <textarea id="study" placeholder="${stu ? "e.g. A level art and English at Oldham Sixth Form" : "e.g. 6 months at a takeaway, looked after my nan"}" style="min-height:52px">${esc(stu ? st.study : st.exp)}</textarea>
        <div class="chips" role="group" aria-label="Quick picks">${(stu ? STUDY : EXP).map(c => chip(stu ? "studyC" : "expC", c)).join("")}</div></div>
      <div class="row2">
        <div class="field"><label class="l" for="area">${t.areaL}</label>
          <select id="area"><option value="">Rather not say</option>${Object.entries(AREAS).map(([k,v]) => `<option value="${k}" ${st.area===k?"selected":""}>${k} · ${esc(v.split(",")[0])}</option>`).join("")}</select></div>
        <div class="field"><label class="l" for="lang">Explain results in</label>
          <select id="lang">${LANGS.map(l => `<option ${st.lang===l?"selected":""}>${l}</option>`).join("")}</select></div>
      </div>
      <p class="privacy">${svg("lock",14)}<span>We only ask for the first half of a postcode, like OL8. Please don't include a name, address or phone number. Personal details are removed before any AI sees the answers, and before they're saved on Pathly's own server.</span></p>
      <div class="nav"><button type="button" class="btn ghost" id="back">Back</button><button type="submit" class="btn primary" id="go">Show my options</button></div>
      </form>`;
    pbody.querySelectorAll(".chip").forEach(b => b.onclick = () => { const s = st[b.dataset.set], v = b.dataset.v; s.has(v) ? s.delete(v) : s.add(v); b.setAttribute("aria-pressed", s.has(v)); });
    const save = () => { st.enjoy = $("#enjoy").value; if(stu) st.study = $("#study").value; else st.exp = $("#study").value; st.lang = $("#lang").value; };
    $("#area").onchange = e => { setArea(e.target.value); if(e.target.value){ const o = D.outcodes[e.target.value]; map.flyTo([o.lat,o.lng], 13, {duration:.6}); } };
    $("#back").onclick = () => { save(); st.step = 1; render(); };
    $("#f3").onsubmit = e => { e.preventDefault(); save(); st.step = 3; findMatches(); };
  } else {
    renderResults();
  }
}
function choiceBtn(group, val, title, desc, icon, color, on, multi){
  return `<button class="choice" data-${group}="${val}" aria-pressed="${!!on}" style="--c:${color}"><span class="ic">${svg(icon,20,1.8)}</span><span><b>${esc(title)}</b><span class="d">${esc(desc)}</span></span></button>`;
}
const chip = (set, v) => `<button type="button" class="chip" data-set="${set}" data-v="${esc(v)}" aria-pressed="${st[set].has(v)}">${esc(v)}</button>`;

/* ---------- matching ---------- */
function wantedLayers(){ const w = st.want.size ? [...st.want] : Object.keys(WANT); return new Set(w.flatMap(k => WANT[k].layers)); }
function queryTerms(){
  const stu = st.who === "student";
  const picks = [...st.enjoyC, ...(stu ? st.studyC : st.expC)].map(s => s.toLowerCase());
  const free = (st.enjoy + " " + (stu ? st.study : st.exp)).toLowerCase().match(/[a-z]{3,}/g) || [];
  const terms = new Set();
  for(const p of picks){ (SYN[p] || p.split(/\W+/)).forEach(x => x.length > 1 && terms.add(x)); }
  for(const f of free){ if(STOP.has(f)) continue; terms.add(f.replace(/(ing|s)$/,"")); for(const [k,v] of Object.entries(SYN)) if(k.includes(f)) v.forEach(x => terms.add(x)); }
  return [...terms];
}
const NICHE = /learning disabilit|asylum|refugee|dementia|bereave|domestic abuse|substance|addiction|alcohol|drug|carers|sensory impair|autis|adhd|stroke|cancer|parkinson|veteran|armed forces|pub of fun|disco/;
function rank(){
  const wl = wantedLayers(), terms = queryTerms().filter(t => t.length > 2), o = D.outcodes[st.area];
  const said = [st.enjoy, st.study, st.exp, ...st.enjoyC, ...st.studyC, ...st.expC].join(" ").toLowerCase();
  const primary = new Set([...(st.want.size ? st.want : Object.keys(WANT))].map(k => WANT[k].k));
  const res = terms.map(t => [t, new RegExp("\\b" + t.replace(/[^a-z]/g, ""))]);
  return ITEMS.filter(i => i.ks.some(k => wl.has(k)) && !AVOID.test(i._t)).map(i => {
    let s = 0; const hit = []; const nm = i.n.toLowerCase();
    for(const [t, re] of res){ if(re.test(nm)){ s += 3; hit.push(t); } else if(re.test(i._t)){ s += 1.2; hit.push(t); } }
    if(primary.has(i.k)) s += 2.5;
    if(/\byoung|\byouth|\bteen|\bstudent|\b1[6-9]\b|\b2[0-5]\b/.test(i._t)) s += 1.5;
    const ni = i._t.match(NICHE); if(ni && !said.includes(ni[0].slice(0,5))) s -= 5;
    let d = null; if(o && located(i)){ d = dist([o.lat,o.lng],[i.lat,i.lng]); s -= Math.min(2, d/4000); }
    if(!located(i)) s -= 1.2;
    return {i, s, hit:[...new Set(hit)].slice(0,3), d};
  }).sort((a,b) => b.s - a.s);
}
function pickDiverse(ranked, n){
  const out = [], per = {}, wantK = [...new Set([...(st.want.size ? st.want : Object.keys(WANT))].map(k => WANT[k].k))];
  for(const k of wantK){ const x = ranked.find(r => r.i.k === k && !out.includes(r)); if(x){ out.push(x); per[k] = 1; } }
  for(const x of ranked){ if(out.length >= n) break; if(out.includes(x) || (per[x.i.k]||0) >= 3) continue; out.push(x); per[x.i.k] = (per[x.i.k]||0) + 1; }
  return out.sort((a,b) => b.s - a.s);
}
function profileLines(){
  const stu = st.who === "student";
  return [ `Right now: ${stu ? "a student" : "exploring options (not in education)"}`,
    `Looking for: ${[...(st.want.size ? st.want : new Set(Object.keys(WANT)))].map(k => WANT[k].label).join(", ")}`,
    `${stu ? "Enjoys" : "Interested in"}: ${[st.enjoy.trim(), ...st.enjoyC].filter(Boolean).join("; ") || "not said"}`,
    `${stu ? "Studying" : "Past work or experience"}: ${[(stu ? st.study : st.exp).trim(), ...(stu ? st.studyC : st.expC)].filter(Boolean).join("; ") || "not said"}`,
    `Area: ${st.area ? `${st.area} (${AREAS[st.area]})` : "not said"}` ].join("\n");
}
let sampleFn = null, ctl = null;
const sampleReady = (window.claude && typeof window.claude.use === "function" ? window.claude.use("sample") : Promise.resolve(null)).then(f => (sampleFn = f), () => null);

/** Ask the Pathly API once per chosen type and merge the answers. Throws if the API cannot be reached. */
async function apiMatch(){
  const stu = st.who === "student";
  const join = (txt, set) => [String(txt || "").trim(), ...set].filter(Boolean).join("; ").slice(0, 1000);
  const base = {path: stu ? "student" : "explore", district: DISTRICT_OF[st.area] || "Anywhere in Oldham"};
  const a = join(st.enjoy, st.enjoyC), b = stu ? join(st.study, st.studyC) : join(st.exp, st.expC);
  if(a) base[stu ? "hobbies" : "interests"] = a;
  if(b) base[stu ? "studies" : "experience"] = b;
  const types = [...(st.want.size ? st.want : new Set(Object.keys(WANT)))].map(k => TYPE_OF[k]);
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 45000);
  try {
    const out = await Promise.all(types.map(type => fetch(API_URL + "/api/match", {method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({...base, type}), signal:abort.signal}).then(r => { if(!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then(j => ({type, j}))));
    const lists = out.map(({type, j}) => (j.matches || []).map(m => ({type, m})));
    const merged = [];
    for(let n = 0; merged.length < 8 && lists.some(l => l[n]); n++) for(const l of lists) if(l[n] && merged.length < 8) merged.push(l[n]);
    st.results = merged.map(({type, m}) => ({id:apiItem(type, m), why:String(m.why || ""), first_step:String(m.first_step || "")}));
    st.results = [...new Map(st.results.map(r => [r.id, r])).values()];
    st.crisis = (out.find(o => o.j.crisis) || {j:{}}).j.crisis || null;
    st.how = out.some(o => o.j.used_ai) ? "api-ai" : "api";
  } finally { clearTimeout(timer); }
}
/** Turn one API match into a map item, pinned at the provider's listing when we have one. */
function apiItem(type, m){
  const id = "api:" + m.id, b = s => String(s || "").replace(/\{borough\}/g, SAFETY.borough);
  if(BYID[id]) return id;
  const at = API_PIN[m.id] && ITEMS.find(x => x.n === API_PIN[m.id] && located(x));
  const k = LAYER_OF_TYPE[type] || "support";
  const it = {id, n:b(m.name), k, ks:[k], from:`${b(m.provider)}, from Pathly's checked list`, src:m.link || "", url:m.link || "",
    ph:m.phone || "", em:m.contact || "", area: m.area && m.area !== "All Oldham" ? `${m.area} Oldham` : "Across Oldham",
    a: at ? at.a : "", lat: at ? at.lat : null, lng: at ? at.lng : null, pinNote: at ? "Pinned at the provider's Oldham base" : ""};
  it._t = it.n.toLowerCase(); BYID[id] = it; return id;
}
async function findMatches(){
  st.results = null; st.how = null; st.summary = ""; st.crisis = null; st.apiErr = false; renderResults(true);
  if(API_URL){ try { await apiMatch(); } catch(e){ st.results = null; st.apiErr = true; } }
  if(st.results && st.results.length){ st.mode = "results"; refreshMarkers(); renderResults(); fitResults(); return; }
  st.results = null;
  st.crisis = checkCrisis([st.enjoy, st.study, st.exp].join(" "));
  const ranked = rank(), wantK = [...new Set([...(st.want.size ? st.want : Object.keys(WANT))].map(k => WANT[k].k))];
  const cands = [...new Set([...ranked.slice(0, 45), ...wantK.flatMap(k => ranked.filter(r => r.i.k === k && r.d != null).sort((a,b) => a.d - b.d).slice(0, 5))])];
  const fallback = () => pickDiverse(ranked, 6).map(x => ({id:x.i.id, first_step:"",
    why: x.hit.length ? `Linked to what ${T().you} said: ${x.hit.join(", ")}.` : (x.d != null ? `One of the closest ${LAYERS[x.i.k].short.toLowerCase()} options to ${st.area}.` : "")}));
  st.skipAi = false;
  const sample = await Promise.race([sampleReady, new Promise(r => setTimeout(() => r(sampleFn), 2500))]);
  if(sample && cands.length && !st.skipAi){
    const list = cands.map(x => { const i = x.i; return [i.id, i.n, LAYERS[i.k].short, (i.d||"").slice(0,150), (i.e||"").slice(0,90), located(i) ? (x.d != null ? fmtDist(x.d) : (i.a || "").slice(0,40)) : "online/phone"].join(" | "); }).join("\n");
    const prompt = `You help young people in Oldham, Greater Manchester, find a realistic next step. Choose the 6 options from the LIST that fit this person best. Prefer a mix: something close to where they live, something they could start this month, and one stretch option.

Rules:
- Use only ids from the LIST. Never invent places, contacts, dates or details.
- "why": one or two short sentences in plain English (reading age 11), speaking to the person as "you", linked to something they said. Write it in ${st.lang}.
- "first_step": one short, concrete action, in ${st.lang}. Don't promise they are eligible.
- "summary": one warm, honest sentence in ${st.lang}.

About them:
${redact(profileLines())}

LIST (id | name | type | about | who it's for | distance):
${list}

Reply with only JSON like {"summary":"...","matches":[{"id":"i12","why":"...","first_step":"..."}]}`;
    ctl = new AbortController();
    try {
      const r = await sample.json(prompt, {modelTier:"quick", signal:ctl.signal});
      const ok = new Set(cands.map(x => x.i.id));
      const m = (r && Array.isArray(r.matches) ? r.matches : []).filter(x => x && ok.has(String(x.id))).map(x => ({id:String(x.id), why:String(x.why||"").slice(0,400), first_step:String(x.first_step||"").slice(0,200)}));
      const uniq = [...new Map(m.map(x => [x.id, x])).values()].slice(0,6);
      if(uniq.length){
        if(uniq.length < 4) for(const f of fallback()){ if(uniq.length >= 6) break; if(!uniq.some(u => u.id === f.id)) uniq.push(f); }
        st.results = uniq; st.how = "ai"; st.summary = String(r.summary||"").slice(0,300); }
    } catch(e){ st.aiErr = e && e.code; }
  }
  if(!st.results){ st.results = fallback(); st.how = "keywords"; }
  st.mode = "results"; refreshMarkers(); renderResults(); fitResults();
}
function fitResults(){
  const pts = st.results.map(r => BYID[r.id]).filter(located).map(i => [i.lat,i.lng]);
  const o = D.outcodes[st.area]; if(o) pts.push([o.lat,o.lng]);
  if(pts.length) map.flyToBounds(L.latLngBounds(pts).pad(.25), {duration:.7, maxZoom:14.5});
}
function runDemo(){
  st.helper = false; $("#helperToggle").checked = false;
  Object.assign(st, {who:"student", want:new Set(["vol","paid"]), enjoy:"drawing and painting, I help at my mosque's kids club on Saturdays", enjoyC:new Set(["Art & drawing","Helping people"]),
    study:"A level art, English and psychology at Oldham Sixth Form College", studyC:new Set(["A levels"]), lang:"English", step:3});
  setArea("OL8"); findMatches();
}

function renderResults(loading){
  const t = T();
  if(loading){
    pbody.innerHTML = `${stepsBar(3)}<h2 class="q">${t.resQ}</h2><div class="thinking"><div class="dots"><i></i><i></i><i></i></div><div><b>Finding options in Oldham…</b><br><span style="font-size:14px;color:var(--muted)">Reading ${ITEMS.length} local listings</span></div></div>
      <button class="link" id="skipAi">Skip the AI and match by keywords</button>`;
    $("#skipAi").onclick = () => { st.skipAi = true; if(ctl) ctl.abort(); };
    return;
  }
  const rs = st.results || [];
  const apiNote = st.apiErr ? " The Pathly API couldn't be reached, so the built-in matching was used." : "";
  const how = st.how === "api-ai" ? "Pathly removed personal details, then used AI to pick these from the team's checked list of Oldham opportunities. Check the details with the provider before you go."
    : st.how === "api" ? "Matched without AI from the team's checked list of Oldham opportunities. Check the details with the provider before you go."
    : (st.how === "ai"
    ? `Claude read ${T().you==="you"?"your":"their"} answers and picked these from ${ITEMS.length} Oldham listings. It can only choose real listings, and each one links to its source. Check the details with the provider before you go.`
    : `Matched by keywords from ${ITEMS.length} Oldham listings${st.aiErr==="not_granted" ? " (AI explanations are switched off for this page)" : ""}. Each one links to its source.`) + apiNote;
  pbody.innerHTML = `${stepsBar(3)}<h2 class="q">${t.resQ}</h2>
    ${st.crisis ? `<div class="crisis" role="alert"><h3>${esc(st.crisis.label)}</h3><p>${esc(st.crisis.message)}</p></div>` : ""}
    ${st.summary ? `<p class="summary">${esc(st.summary)}</p>` : ""}<p class="how">${how}</p>
    <ol class="results">${rs.map((r,n) => resHTML(r,n)).join("")}</ol>
    ${rs.length ? "" : `<p>Nothing matched yet. Try different words, or pick more options on step 2.</p>`}
    <div class="human"><h3>${st.helper ? "Refer them to a person" : "Want to talk it through with a person?"}</h3>
      <p>${st.helper ? "These services can take a referral or a call from the young person." : "These are free, and they're used to helping people who don't know where to start."}</p>
      <div class="who">
        <div><b>Positive Steps</b><span class="phone">0161 621 9400</span><button class="btn ghost small" data-copy="0161 621 9400">Copy number</button><small style="color:var(--muted)">Careers advice and support for young people. Medtia Place, 80 Union Street.</small></div>
        <div><b>Get Oldham Working</b><span class="phone">0161 770 4674</span><button class="btn ghost small" data-copy="0161 770 4674">Copy number</button><small style="color:var(--muted)">Help with jobs, training and CVs. First Place, 22 Union Street.</small></div>
      </div>
      <p class="offline">No internet at home? Every Oldham library has free computers and staff who can help. <button class="link" id="showOnline">Show libraries on the map</button></p>
    </div>
    <div class="nav"><button class="btn ghost" id="edit">Change answers</button><button class="btn ghost" id="restart">Start again</button></div>`;
  wireCopy(pbody);
  pbody.querySelectorAll("[data-show]").forEach(b => b.onclick = () => focusItem(b.dataset.show));
  pbody.querySelectorAll(".res").forEach(li => { li.onmouseenter = () => hlPin(li.dataset.id, true); li.onmouseleave = () => hlPin(li.dataset.id, false); });
  $("#edit").onclick = () => { st.step = 2; st.mode = "explore"; refreshMarkers(); render(); };
  $("#restart").onclick = () => { Object.assign(st, {step:0, who:null, want:new Set(), enjoy:"", enjoyC:new Set(), study:"", studyC:new Set(), exp:"", expC:new Set(), results:null, mode:"explore", summary:"", crisis:null}); setArea(""); refreshMarkers(); map.flyToBounds(homeBounds, {duration:.6}); render(); };
  $("#showOnline").onclick = () => { st.mode = "explore"; st.layers = new Set(["online"]); refreshMarkers(); map.flyToBounds(homeBounds, {duration:.6}); };
}
function resHTML(r, n){
  const i = BYID[r.id]; if(!i) return "";
  const nt = nearText(i);
  return `<li class="res" data-id="${i.id}" style="--c:${cvar(i.k)}"><span class="rank" aria-hidden="true">${n+1}</span><div style="min-width:0">
    <div class="res-top"><span class="pill">${esc(LAYERS[i.k].short)}</span>${located(i) ? "" : "<span>Online or by phone</span>"}</div>
    <h3>${esc(i.n)}</h3>
    ${r.why ? `<p class="why">${esc(r.why)}</p>` : (i.d ? `<p class="why">${esc(i.d)}</p>` : "")}
    ${r.first_step ? `<p class="first"><b>First step:</b> ${esc(r.first_step)}</p>` : ""}
    ${nt ? `<p class="first" style="color:var(--muted)">${esc(nt)}</p>` : ""}
    ${factsHTML(i)}
    <div class="acts">${located(i) ? `<button class="btn primary small" data-show="${i.id}">Show on map</button>` : ""}${actsHTML(i).replace(/^<div class="acts">|<\/div>$/g,"")}</div>
    ${srcHTML(i)}</div></li>`;
}
function hlRes(id, on){ const li = pbody.querySelector(`.res[data-id="${id}"]`); if(li) li.classList.toggle("hl", on); }
function hlPin(id, on){ const m = numbered.find(m => m._item.id === id); const el = m && m.getElement(); if(el) el.firstElementChild.classList.toggle("hl", on); }

/* ---------- explore tab ---------- */
function renderExplore(){
  pbody.innerHTML = `<p class="eyebrow">Explore</p><h2 class="q">What's on the map</h2><p class="sub">Turn layers on and off. Tap a yellow Metrolink stop to see what's within a 10 minute walk.</p>
    <div class="layerlist">${LKEYS.map(k => `<button class="lrow" data-l="${k}" aria-pressed="${st.layers.has(k)}" style="--c:${cvar(k)}"><span class="sw">${svg(k,14,2)}</span><span>${esc(LAYERS[k].label)}</span><span class="n">${COUNTS[k]}</span></button>`).join("")}
    <button class="lrow" data-l="tram" aria-pressed="${st.tram}" style="--c:var(--m-tram)"><span class="sw" style="color:#16202E">${svg("tram",14,2)}</span><span>Metrolink stops & train stations</span><span class="n">${STOPS.filter(s => inOldham([s.lat,s.lng])).length}</span></button></div>
    <div class="inview" id="inview"></div>
    <div class="human" style="margin-top:20px"><h3>Why the council could run this</h3>
      <p>Most of these listings come straight from Oldham Council's own service directory, which already has a public data feed. Staff keep updating the directory as they do now, and this map updates with it. No new database to maintain.</p>
      <p style="margin:0">Map data: OpenStreetMap. Food banks: Give Food. Answers are kept on Pathly's own server with personal details taken out.</p></div>`;
  pbody.querySelectorAll("[data-l]").forEach(b => b.onclick = () => { toggleLayer(b.dataset.l); renderExplore(); });
  renderInView();
}
function renderInView(){
  const box = $("#inview"); if(!box) return;
  const b = map.getBounds(), c = map.getCenter();
  const vis = ITEMS.filter(i => located(i) && i.ks.some(k => st.layers.has(k)) && b.contains([i.lat,i.lng])).map(i => ({i, d:dist([c.lat,c.lng],[i.lat,i.lng])})).sort((a,b) => a.d-b.d);
  box.innerHTML = `<h3>${vis.length} place${vis.length===1?"":"s"} in view</h3>${vis.length ? `<ul>${vis.slice(0,40).map(x => `<li><button data-go="${x.i.id}" style="--c:${cvar(x.i.k)}"><i></i><span>${esc(x.i.n)}</span><small>${esc(LAYERS[x.i.k].short)}</small></button></li>`).join("")}</ul>${vis.length > 40 ? `<p style="font-size:13px;color:var(--muted)">Zoom in to see the rest.</p>` : ""}` : `<p style="color:var(--muted)">Move the map or turn on more layers.</p>`}`;
  box.querySelectorAll("[data-go]").forEach(b => b.onclick = () => focusItem(b.dataset.go));
}
map.on("moveend", () => { if(st.tab === "explore") renderInView(); });

/* ---------- theme + boot ---------- */
restyle();
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", restyle);
new MutationObserver(restyle).observe(document.documentElement, {attributes:true, attributeFilter:["data-theme","class"]});
window.addEventListener("resize", () => map.invalidateSize());
/* ---------- hand-off from the chat on the home page ---------- */
/* The chat saves its answers and matches in sessionStorage, so this page opens on them instead of asking again. */
const OUTCODE_OF = {Central:"OL1", North:"OL2", East:"OL4", South:"OL8", West:"OL9"};
const WANT_OF = {voluntary:"vol", paid_work:"paid", social_work:"social"};
function fromChat(){
  let h = null; try { h = JSON.parse(sessionStorage.getItem("pathly:chat") || "null"); } catch(e){ /* no storage: start fresh */ }
  const a = h && h.answers; if(!a || !a.path) return false;
  const stu = a.path === "student", known = [a.studies, a.experience].filter(Boolean).join("; ");
  Object.assign(st, {who: stu ? "student" : "efo", want: new Set(WANT_OF[a.type] ? [WANT_OF[a.type]] : []),
    enjoy: a.hobbies || a.interests || "", study: stu ? known : "", exp: stu ? "" : known});
  if(OUTCODE_OF[a.district]) setArea(OUTCODE_OF[a.district]);
  const r = h.result;
  if(!(r && r.matches && r.matches.length)){ st.step = st.want.size ? 2 : 1; return false; }
  st.results = [...new Map(r.matches.map(m => { const id = apiItem(a.type, m); return [id, {id, why:String(m.why || ""), first_step:String(m.first_step || "")}]; })).values()];
  Object.assign(st, {summary: String(r.summary || "").slice(0, 300), crisis: r.crisis || null, how: r.used_ai ? "api-ai" : "api", step: 3, mode: "results"});
  refreshMarkers(); renderResults(); fitResults(); return true;
}
refreshMarkers(); if(!fromChat()) render();
})();
