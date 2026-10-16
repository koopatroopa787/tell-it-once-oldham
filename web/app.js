// Pathly front end. Flow: path -> type -> about -> results (team wireframe). Talks to POST /api/match in api.py (FastAPI, which also serves this folder).

const TYPES = { voluntary: 'Voluntary', paid_work: 'Paid work', social_work: 'Social' };
const STEPS = ['path', 'type', 'about', 'results'];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const answers = {};
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---- Flow -----------------------------------------------------------------

function show(step) {
  $$('.step').forEach((el) => { el.hidden = el.dataset.step !== step; });
  $('#progress-bar').style.transform = `scaleX(${(STEPS.indexOf(step) + 1) / STEPS.length})`;
  if (step === 'about') {
    $$('.fields').forEach((el) => { el.hidden = el.dataset.for !== answers.path; });
  }
  stopSpeaking();
  const heading = $(`.step[data-step="${step}"] h3`);
  if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  if (window.gsap && !reduceMotion) gsap.fromTo(`.step[data-step="${step}"]`, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.6, ease: 'expo.out' });
}

// Smooth scroll to a section; Lenis when it is running, the browser otherwise.
let lenis = null;
function goTo(sel) {
  const target = $(sel);
  if (lenis) lenis.scrollTo(target, { offset: -24, duration: 1.4 });
  else target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
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
    if (data.crisis) {
      crisis.textContent = data.crisis.message;
      crisis.append(sayButton(() => data.crisis.message));
      crisis.hidden = false;
    }
    const summary = $('#summary');
    summary.textContent = data.summary || '';
    summary.hidden = !data.summary;
    const directions = $('#directions');
    directions.replaceChildren(...(data.possible_directions || []).map((d) => {
      const item = el('div', 'direction');
      item.append(el('strong', null, d.title), el('span', null, d.why));
      return item;
    }));
    if (directions.children.length) directions.prepend(el('p', 'eyebrow', 'Directions you could explore'));
    directions.hidden = !directions.children.length;
    list.replaceChildren(...data.matches.map(matchCard));
    startChat(data);
    document.dispatchEvent(new CustomEvent('pathly:results', { detail: { matches: data.matches } }));
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
  const body = el('article', 'match');
  body.append(el('span', 'match-tag', TYPES[m.category] || m.category), el('h4', null, m.name), el('p', 'meta', [m.provider, m.area].filter(Boolean).join(' / ')));
  body.append(el('p', null, m.why));
  if (m.first_step) {
    const p = el('p');
    p.append(el('em', null, 'First step '), document.createTextNode(m.first_step));
    body.append(p);
  }
  if (m.barrier_tip) {
    const p = el('p', 'tip');
    p.append(el('em', null, 'Tip '), document.createTextNode(m.barrier_tip));
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
  return body;
}

// ---- Ask Pathly (DeepSeek chat about the matches shown, via /api/chat) ----

const askState = { ids: [], history: [], busy: false };

function startChat(data) {
  askState.ids = data.matches.map((m) => m.id).slice(0, 5);
  askState.history = [];
  $('#ask-log').replaceChildren();
  suggest(data.follow_up_questions || []);
  $('#ask').hidden = !askState.ids.length; // nothing to ask about when there are no matches (for example a crisis)
}

function suggest(questions) {
  $('#ask-suggest').replaceChildren(...questions.slice(0, 3).map((q) => {
    const b = el('button', 'chip', q);
    b.type = 'button';
    b.addEventListener('click', () => ask(q));
    return b;
  }));
}

function chatLine(role, text) {
  const line = el('div', `ask-line ${role}`);
  line.append(el('p', null, text));
  if (role === 'assistant') line.append(sayButton(() => text));
  $('#ask-log').append(line);
  line.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  return line;
}

async function ask(message) {
  const text = message.trim();
  if (!text || askState.busy) return;
  askState.busy = true;
  $('#ask-input').value = '';
  chatLine('user', text);
  const waiting = chatLine('assistant pending', 'Thinking...');
  const fields = ['path', 'type', 'district', 'hobbies', 'studies', 'interests', 'experience'];
  const sentAnswers = Object.fromEntries(fields.filter((k) => answers[k]).map((k) => [k, answers[k]]));
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: sentAnswers, matched_opportunity_ids: askState.ids, history: askState.history.slice(-8), message: text }),
    });
    if (res.status === 429) throw new Error('busy');
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    waiting.remove();
    let reply = data.reply;
    if (data.needs_human_support) reply += ' It would help to talk this through with a trusted adult or an adviser at the Youth Hub today.';
    chatLine('assistant', reply);
    askState.history.push({ role: 'user', content: text }, { role: 'assistant', content: reply.slice(0, 1000) });
    suggest(data.suggested_questions || []);
  } catch (err) {
    waiting.remove();
    chatLine('assistant', err.message === 'busy'
      ? "You've asked a lot in a short time. Give it a few minutes and try again."
      : "Sorry, I can't answer right now. You can still use the contact details on each option.");
  } finally {
    askState.busy = false;
  }
}

$('#ask-form').addEventListener('submit', (event) => { event.preventDefault(); ask($('#ask-input').value); });

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

function recordButton(field) {
  const btn = el('button', 'mini rec', 'Speak');
  const note = el('span', 'rec-note');
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
  const wrap = el('span', 'rec-row');
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
    $$('#about-form textarea, #about-form input').forEach((field) => field.after(recordButton(field)));
    $('#ask-form').after(recordButton($('#ask-input')));
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
  goTo('#start');
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
  goTo('#start');
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

// The dot field behind the hero (React Bits DotField, ported in dotfield.js). Ink-printed so it stays crisp on paper.
if (window.DotField) {
  DotField($('#hero-dots'), {
    lightMode: true, gradientFrom: '#F26B1D', gradientTo: '#1A120B', gradientAngle: 160, glowColor: '#F26B1D',
    dotRadius: 1.4, dotSpacing: 16, baseOpacity: 0.28, cursorRadius: 220, bulgeStrength: 0.5, glowRadius: 150,
    waveAmplitude: reduceMotion ? 0 : 3, speed: 0.5,
  });
}

if (window.gsap && window.ScrollTrigger && !reduceMotion) {
  gsap.registerPlugin(ScrollTrigger);

  if (window.Lenis) {
    lenis = new Lenis({ lerp: 0.09 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
      if (a.getAttribute('href').length < 2) return;
      e.preventDefault();
      goTo(a.getAttribute('href'));
    }));
  }

  gsap.timeline({ defaults: { ease: 'expo.out' } })
    .from('.headline .line > span', { yPercent: 105, duration: 1.3, stagger: 0.09 })
    .from('.voice, .hero-main .eyebrow, .hero-side', { y: 24, opacity: 0, duration: 1, stagger: 0.08 }, 0.25)
    .from('.marquee', { opacity: 0, duration: 1.2 }, 0.6);

  // The headline drifts up and fades a little as you scroll off the hero.
  gsap.to('.hero-main', { yPercent: -12, opacity: 0.4, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });

  ScrollTrigger.batch('.reveal', {
    start: 'top 85%',
    onEnter: (els) => gsap.from(els, { y: 40, opacity: 0, duration: 1.1, stagger: 0.1, ease: 'expo.out', overwrite: true }),
    once: true,
  });
  gsap.from('.choice', { y: 20, opacity: 0, stagger: 0.07, duration: 0.9, ease: 'expo.out', scrollTrigger: { trigger: '#guide', start: 'top 80%' } });
}
