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
  stopSpeaking();
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

async function loadResults() {
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
    if (data.crisis) {
      crisis.textContent = data.crisis.message;
      crisis.append(sayButton(() => data.crisis.message));
      crisis.hidden = false;
    }
    list.replaceChildren(...data.matches.map(matchCard));
    document.dispatchEvent(new CustomEvent('pathly:results', { detail: { matches: data.matches } }));
    status.textContent = data.used_ai
      ? `${data.matches.length} options picked for you.`
      : 'Showing a simple match because the AI is not available right now.';
    if (!reduceMotion && window.gsap) gsap.from('.match', { y: 24, opacity: 0, stagger: 0.08, duration: 0.45, ease: 'power2.out' });
  } catch (err) {
    list.replaceChildren();
    status.textContent = 'Something went wrong loading options. Check the server is running (uvicorn api:app) and try again.';
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
  const actions = el('div', 'match-actions');
  if (/^https?:\/\//.test(m.link || '')) {
    const a = el('a', 'more', 'Find out more ↗');
    a.href = m.link; a.target = '_blank'; a.rel = 'noopener noreferrer';
    actions.append(a);
  }
  if (window.PathlyMap && window.PathlyMap.canShow(m.id)) {
    const onMap = el('button', 'mini', 'See it on the map');
    onMap.type = 'button';
    onMap.addEventListener('click', () => window.PathlyMap.show(m.id));
    actions.append(onMap);
  }
  actions.append(sayButton(() => [m.name, m.why, m.first_step && `First step: ${m.first_step}`, m.phone && `Phone ${m.phone}`].filter(Boolean).join('. ')));
  body.append(actions);
  card.append(body);
  return card;
}

// ---- Voice (ElevenLabs, through /api/speak and /api/transcribe) ----------
// Buttons only appear when the server has a key. Without one the site is text only.

const voice = { on: false, audio: null, button: null };

function stopSpeaking() {
  if (voice.audio) { voice.audio.pause(); URL.revokeObjectURL(voice.audio.src); }
  if (voice.button) voice.button.textContent = 'Listen';
  voice.audio = null; voice.button = null;
}

function sayButton(getText) {
  const btn = el('button', 'mini say', 'Listen');
  btn.type = 'button';
  btn.addEventListener('click', async () => {
    if (voice.button === btn) { stopSpeaking(); return; }
    stopSpeaking();
    voice.button = btn;
    btn.textContent = 'Loading...';
    try {
      const res = await fetch('/api/speak', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: getText().slice(0, 800) }),
      });
      if (!res.ok) throw new Error(res.status);
      if (voice.button !== btn) return; // another button was pressed while this loaded
      const audio = new Audio(URL.createObjectURL(await res.blob()));
      voice.audio = audio;
      audio.addEventListener('ended', stopSpeaking);
      await audio.play();
      btn.textContent = 'Stop';
    } catch (err) {
      stopSpeaking();
      btn.textContent = 'Not available';
      setTimeout(() => { btn.textContent = 'Listen'; }, 2500);
    }
  });
  return btn;
}

function micButton(field) {
  const btn = el('button', 'mini mic', 'Speak');
  const note = el('span', 'mic-note');
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Speak your answer instead of typing');
  let recorder = null;
  let timer = null;
  btn.addEventListener('click', async () => {
    if (recorder) { recorder.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ['audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
      recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks = [];
      recorder.addEventListener('dataavailable', (e) => chunks.push(e.data));
      recorder.addEventListener('stop', async () => {
        clearTimeout(timer);
        stream.getTracks().forEach((t) => t.stop());
        recorder = null;
        btn.textContent = 'Speak'; btn.classList.remove('is-live');
        note.textContent = 'Writing that down...';
        const blob = new Blob(chunks, { type: (type || 'audio/webm').split(';')[0] });
        try {
          const res = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
          if (!res.ok) throw new Error(res.status);
          const data = await res.json();
          field.value = [field.value.trim(), data.text].filter(Boolean).join(' ').slice(0, Number(field.maxLength) > 0 ? field.maxLength : 1000);
          note.textContent = data.removed.length
            ? `Added. We took out your ${data.removed.join(' and ')} so it stays private.`
            : (data.text ? 'Added. Check it reads right.' : "Sorry, we didn't catch that. Try again.");
        } catch (err) {
          note.textContent = "Voice isn't working right now. You can type instead.";
        }
      });
      recorder.start();
      timer = setTimeout(() => recorder && recorder.stop(), 60000);
      btn.textContent = 'Stop'; btn.classList.add('is-live');
      note.textContent = 'Listening. Press stop when you are done.';
    } catch (err) {
      note.textContent = "We couldn't use your microphone. You can type instead.";
    }
  });
  const wrap = el('span', 'mic-row');
  wrap.append(btn, note);
  return wrap;
}

function setUpVoice() {
  document.body.classList.add('voice-on');
  // Read each question and its options aloud.
  $$('.step').forEach((step) => {
    const heading = $('h3', step);
    if (!heading || step.dataset.step === 'results') return;
    heading.after(sayButton(() => {
      const options = $$('.choice', step).map((b) => b.textContent.trim());
      const labels = $$('.fields:not([hidden]) label, label:not(.fields label)', step).map((l) => l.firstChild.textContent.trim());
      return [heading.textContent, options.length ? options.join(', or ') : labels.join(' ')].join('. ');
    }));
  });
  // Speak an answer instead of typing it.
  if (navigator.mediaDevices && window.MediaRecorder) {
    $$('#about-form textarea, #about-form input').forEach((field) => field.after(micButton(field)));
  }
}

fetch('/api/voice').then((r) => (r.ok ? r.json() : {})).then((v) => { if (v.enabled) { voice.on = true; setUpVoice(); } }).catch(() => {});

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
