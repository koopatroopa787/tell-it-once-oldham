// Pathly front end. Flow: path -> type -> about -> results (team wireframe). Talks to POST /api/match in api.py (FastAPI, which also serves this folder).

const TYPES = {
  voluntary: { label: 'Voluntary', color: 'c-peach' },
  paid_work: { label: 'Paid work', color: 'c-blue' },
  social_work: { label: 'Social', color: 'c-sand' },
};
const STEPS = ['path', 'type', 'about', 'results'];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const answers = {};
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---- Flow -----------------------------------------------------------------

function show(step) {
  $$('.step').forEach((el) => { el.hidden = el.dataset.step !== step; });
  $$('.progress li').forEach((li, i) => li.classList.toggle('is-on', i <= STEPS.indexOf(step)));
  if (step === 'about') {
    $$('.fields').forEach((el) => { el.hidden = el.dataset.for !== answers.path; });
  }
  const heading = $(`.step[data-step="${step}"] h3`);
  if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
}

$$('[data-path]').forEach((btn) => btn.addEventListener('click', () => {
  answers.path = btn.dataset.path;
  show(answers.type ? 'about' : 'type'); // a lane pick from "Paths" already chose the type
}));

$$('[data-type]').forEach((btn) => btn.addEventListener('click', () => {
  answers.type = btn.dataset.type;
  show('about');
}));

$$('[data-go]').forEach((btn) => btn.addEventListener('click', () => {
  if (btn.dataset.go === 'restart') {
    Object.keys(answers).forEach((k) => delete answers[k]);
    $('#about-form').reset();
    setDistrict('Anywhere in Oldham');
    show('path');
  } else {
    show(btn.dataset.go);
  }
}));

$('#about-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const fields = answers.path === 'student' ? ['hobbies', 'studies'] : ['interests', 'experience'];
  fields.concat('district').forEach((k) => { answers[k] = String(form.get(k) || '').trim(); });
  show('results');
  await loadResults();
});

async function loadResults() {  // returns the API reply (or null), so the voice agent can read it out
  const list = $('#results');
  const status = $('#status');
  const crisis = $('#crisis');
  list.replaceChildren(...[1, 2, 3].map(() => el('div', 'skeleton')));
  status.textContent = 'Finding options near you...';
  crisis.hidden = true;
  try {
    const res = await fetch('/api/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(answers),
    });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    if (data.crisis) { crisis.textContent = data.crisis.message; crisis.hidden = false; }
    list.replaceChildren(...data.matches.map(matchCard));
    status.textContent = data.used_ai
      ? `${data.matches.length} options picked for you.`
      : 'Showing a simple match because the AI is not available right now.';
    if (!reduceMotion && window.gsap) gsap.from('.match', { y: 24, opacity: 0, stagger: 0.08, duration: 0.45, ease: 'power2.out' });
    return data;
  } catch (err) {
    list.replaceChildren();
    status.textContent = 'Something went wrong loading options. Check the server is running (uvicorn api:app) and try again.';
    return null;
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function matchCard(m) {
  const type = TYPES[m.category] || { label: m.category, color: 'c-orange' };
  const card = el('article', `match ${type.color}`);
  const body = el('div', 'match-body');
  body.append(el('span', 'match-tag', type.label), el('h4', null, m.name), el('p', 'meta', [m.provider, m.area].filter(Boolean).join(' / ')));
  body.append(el('p', null, m.why));
  if (m.first_step) {
    const p = el('p');
    p.append(el('strong', null, 'First step: '), document.createTextNode(m.first_step));
    body.append(p);
  }
  const contact = [m.phone && `Phone: ${m.phone}`, m.contact && `Contact: ${m.contact}`].filter(Boolean).join('  /  ');
  if (contact) body.append(el('p', 'contact', contact));
  if (/^https?:\/\//.test(m.link || '')) {
    const a = el('a', 'more', 'Find out more ↗');
    a.href = m.link; a.target = '_blank'; a.rel = 'noopener noreferrer';
    body.append(a);
  }
  card.append(body);
  return card;
}

// ---- Paths accordion ------------------------------------------------------

const lanes = $$('.lane');
function openLane(lane) {
  lanes.forEach((l) => {
    l.classList.toggle('is-open', l === lane);
    $('.lane-head', l).setAttribute('aria-expanded', String(l === lane));
  });
}
lanes.forEach((lane) => {
  $('.lane-head', lane).addEventListener('click', () => openLane(lane));
  lane.addEventListener('pointerenter', () => { if (matchMedia('(hover: hover) and (min-width: 761px)').matches) openLane(lane); });
});
$$('[data-pick]').forEach((btn) => btn.addEventListener('click', () => {
  answers.type = btn.dataset.pick;
  show(answers.path ? 'about' : 'path');
  $('#start').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
}));

// ---- Map hook (Akshita's Oldham map plugs in here; see web/README.md) -----

function setDistrict(name) {
  const select = $('#district');
  if (![...select.options].some((o) => o.value === name)) return;
  select.value = name;
  answers.district = name;
  $('#map-picked').textContent = `Showing: ${name}`;
  $$('.district-picker button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.district === name)));
  document.dispatchEvent(new CustomEvent('pathly:district', { detail: { district: name } }));
}
window.Pathly = { setDistrict, answers };
$$('.district-picker button').forEach((b) => b.addEventListener('click', () => setDistrict(b.dataset.district)));
$('#district').addEventListener('change', (e) => setDistrict(e.target.value));

// ---- Voice (ElevenLabs Agents; agent setup in web/README.md) --------------

const ELEVENLABS_SDK = 'https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.26.0/+esm';
const DISTRICTS = [...$('#district').options].map((o) => o.value);
const mic = $('#mic');
const chat = $('#chat');
let conversation = null;
let connecting = false;

function setMic(state, text) {
  mic.className = state ? `mic is-${state}` : 'mic';
  mic.setAttribute('aria-pressed', String(Boolean(state)));
  $('#mic-label').textContent = state ? 'Stop talking to Pathly' : 'Start talking to Pathly';
  if (text) $('#voice-status').textContent = text;
}

function addBubble(who, text) {
  chat.hidden = false;
  chat.append(el('p', `bubble ${who}`, text));
  chat.scrollTop = chat.scrollHeight;
}

// The agent calls this client tool once it has heard enough. Same checks as the form, same /api/match guarantees.
async function findOpportunities(params = {}) {
  const pick = (key, allowed) => (allowed.includes(params[key]) ? params[key] : undefined);
  Object.keys(answers).forEach((k) => delete answers[k]);
  answers.path = pick('path', ['student', 'explore']) || 'explore';
  answers.type = pick('type', Object.keys(TYPES)) || 'voluntary';
  ['hobbies', 'studies', 'interests', 'experience'].forEach((k) => {
    if (typeof params[k] === 'string' && params[k].trim()) answers[k] = params[k].trim().slice(0, 1000);
  });
  setDistrict(pick('district', DISTRICTS) || 'Anywhere in Oldham');
  show('results');
  $('#start').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  const data = await loadResults();
  if (!data) return 'The opportunity search is not working right now. Suggest they use the form on the page instead.';
  return {
    crisis: data.crisis ? data.crisis.message : null,
    matches: data.matches.map(({ name, provider, area, why, first_step }) => ({ name, provider, area, why, first_step })),
  };
}

// The ring around the mic follows the live volume: theirs while listening, Pathly's while speaking.
function meter() {
  if (!conversation) { mic.style.setProperty('--level', 0); return; }
  const speaking = mic.classList.contains('is-speaking');
  const level = (speaking ? conversation.getOutputVolume?.() : conversation.getInputVolume?.()) || 0;
  mic.style.setProperty('--level', Math.min(1, level * 2).toFixed(2));
  requestAnimationFrame(meter);
}

async function startVoice() {
  connecting = true;
  setMic('connecting', 'Connecting...');
  try {
    const res = await fetch('/api/voice/session');
    if (!res.ok) throw new Error(res.status === 503 ? 'not set up yet' : 'service unavailable');
    const { signed_url: signedUrl } = await res.json();
    if (!navigator.mediaDevices) throw new Error('the page needs to be opened over https'); // browsers only allow the mic on https or localhost
    await navigator.mediaDevices.getUserMedia({ audio: true });
    const { Conversation } = await import(ELEVENLABS_SDK);
    conversation = await Conversation.startSession({
      signedUrl,
      clientTools: { find_opportunities: findOpportunities },
      onConnect: () => setMic('listening', "I'm listening. Tap the mic again to stop."),
      onDisconnect: () => { conversation = null; setMic('', 'Chat ended. Tap the mic to talk again.'); },
      onModeChange: ({ mode }) => setMic(mode === 'speaking' ? 'speaking' : 'listening'),
      onMessage: ({ source, message }) => addBubble(source === 'user' ? 'user' : 'ai', message),
      onError: (message) => console.warn('Voice error:', message),
    });
    if (!reduceMotion) requestAnimationFrame(meter);
  } catch (err) {
    conversation = null;
    const reason = err.name === 'NotAllowedError' ? 'the microphone is blocked' : err.message;
    setMic('', `Voice chat isn't available (${reason}). You can type instead, just below.`);
  } finally {
    connecting = false;
  }
}

mic.addEventListener('click', () => {
  if (connecting) return;
  if (conversation) conversation.endSession();
  else startVoice();
});

// ---- Motion ---------------------------------------------------------------

const words = [
  ['volunteer role', 'var(--peach)'], ['first job', 'var(--blue)'], ['apprenticeship', 'var(--sand)'],
  ['youth club', 'var(--orange)'], ['taster day', 'var(--sky)'],
];
const rotator = $('#rotator');
let wordIndex = 0;
function nextWord() {
  wordIndex = (wordIndex + 1) % words.length;
  const [text, color] = words[wordIndex];
  const swap = () => { rotator.textContent = text; rotator.style.background = color; rotator.style.color = color.includes('blue') ? '#fff' : ''; };
  if (window.gsap) {
    gsap.timeline().to(rotator, { yPercent: -60, opacity: 0, duration: 0.25, ease: 'power2.in', onComplete: swap })
      .fromTo(rotator, { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.4, ease: 'power2.out' });
  } else {
    swap();
  }
}

if (reduceMotion) {
  $('.trail').pauseAnimations();
} else {
  setInterval(nextWord, 3200);
}

if (window.gsap && window.ScrollTrigger && !reduceMotion) {
  gsap.registerPlugin(ScrollTrigger);
  const trail = $('#trail-path');
  const length = trail.getTotalLength();

  gsap.timeline({ defaults: { ease: 'power3.out' } })
    .from('.wordmark span', { yPercent: 110, opacity: 0, stagger: 0.06, duration: 0.8 })
    .fromTo(trail, { strokeDashoffset: length, strokeDasharray: `${length} ${length}` }, { strokeDashoffset: 0, duration: 1.6, ease: 'power2.inOut',
      onComplete: () => { trail.style.strokeDasharray = ''; trail.style.strokeDashoffset = ''; } }, 0.2)
    .from('.stop', { scale: 0, transformOrigin: 'center', stagger: 0.15, duration: 0.5, ease: 'power2.out' }, 0.9)
    .from('.hero-line, .hero-actions', { y: 30, opacity: 0, stagger: 0.12, duration: 0.7 }, 0.5)
    .from('.ticker, .index a', { y: 20, opacity: 0, stagger: 0.05, duration: 0.5 }, 0.9);


  gsap.from('.how-card', { x: 60, opacity: 0, stagger: 0.12, duration: 0.6, scrollTrigger: { trigger: '.how-cards', start: 'top 80%' } });
  gsap.fromTo('.statement span', { opacity: 0.15 }, { opacity: 1, stagger: 0.1, ease: 'none',
    scrollTrigger: { trigger: '.statement', start: 'top 85%', end: 'bottom 45%', scrub: 1 } });
  gsap.from('.choice', { y: 30, opacity: 0, stagger: 0.08, duration: 0.5, scrollTrigger: { trigger: '#guide', start: 'top 80%' } });

  gsap.matchMedia().add('(min-width: 901px)', () => {
    ScrollTrigger.create({ trigger: '.how-grid', pin: '.how-intro', start: 'top top+=60', endTrigger: '.how-cards', end: 'bottom bottom-=60', pinSpacing: false });
  });
}
