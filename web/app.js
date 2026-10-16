// Pathly front end. A chat asks the team wireframe's questions one at a time (path -> type -> about -> area), with
// Claude-style option pop-ups, then shows matches from POST /api/match and keeps talking through POST /api/chat.
// FastAPI (api.py) also serves this folder.

const TYPES = { voluntary: 'Voluntary', paid_work: 'Paid work', social_work: 'Social' };
const DISTRICTS = ['Anywhere in Oldham', 'Central', 'East', 'North', 'South', 'West'];
const FIELDS = ['path', 'type', 'district', 'hobbies', 'studies', 'interests', 'experience'];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const answers = {};
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
// A random id for this visit, so the database can group one person's answers without knowing who they are.
const VISIT = { 'X-Pathly-Session': crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}` };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

// Smooth scroll to a section; Lenis when it is running, the browser otherwise.
let lenis = null;
function goTo(sel) {
  const target = $(sel);
  if (lenis) lenis.scrollTo(target, { offset: -24, duration: 1.4 });
  else target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
}

// ---- Questions ------------------------------------------------------------
// Each one: what Pathly says, optional pop-up options, and how to read a typed reply.
// Choice questions understand plain words ("college", "Royton"); free-text ones take anything, or "skip".

const UPLOAD = 'upload';
const has = (re) => (text) => re.test(text.toLowerCase());
const QUESTIONS = [
  {
    key: 'path', step: 'Where you are now', title: 'Studying, or exploring?',
    say: () => "Hi, I'm Pathly. I'll ask a few quick things, then show you places in Oldham worth trying. First up: are you studying at the moment, or working out what's next?",
    options: () => [
      { value: 'student', label: "I'm studying", desc: 'School, college, sixth form or uni' },
      { value: 'explore', label: "I'm exploring my options", desc: "Not studying right now, or working out what's next" },
    ],
    // Explore first, so "not at school" or "left college" isn't read as studying.
    read: (t) => (has(/explor|\bnot\b|\b(don|didn|aren|isn|haven|ain|can)'?t\b|\bno\b|left|finish|leav|dropped|nothing|neet|options|next|figur/)(t) ? 'explore'
      : has(/stud|school|college|uni\b|universit|sixth|gcse|a.?level|btec|t.?level|course|year \d/)(t) ? 'student' : null),
  },
  {
    key: 'type', step: 'What you want', title: 'What are you after?',
    say: () => (answers.path === 'student' ? 'Nice. Alongside studying, what are you after?' : 'Got it. What are you after?'),
    options: () => [
      { value: 'voluntary', label: 'Voluntary', desc: 'Give some time, pick up skills, get a reference' },
      { value: 'paid_work', label: 'Paid work', desc: 'Jobs, apprenticeships, help with your CV' },
      { value: 'social_work', label: 'Social', desc: 'Clubs, groups and things to do with other people' },
    ],
    read: (t) => (has(/volunt|help out|give (some )?time|charity/)(t) ? 'voluntary'
      : has(/paid|job|work|money|apprentic|earn|cv|career/)(t) ? 'paid_work'
        : has(/social|club|friend|group|meet|fun|activit|hang|people/)(t) ? 'social_work' : null),
  },
  {
    key: () => (answers.path === 'student' ? 'hobbies' : 'interests'), step: 'What you like', title: 'Pick one, or type your own',
    say: () => (answers.path === 'student' ? 'What do you get up to in your free time? Anything counts.' : "What are you into? Anything goes, even if it doesn't feel useful."),
    options: () => ['Sport and fitness', 'Art and drawing', 'Gaming and tech', 'Music', 'Cooking', 'Helping people'].map((v) => ({ value: v, label: v })),
    free: true,
  },
  {
    key: () => (answers.path === 'student' ? 'studies' : 'experience'), step: 'What you know', title: 'Pick one, or type your own',
    say: () => (answers.path === 'student' ? 'And what are you studying?' : 'Any work or experience so far? A paper round or helping family out counts.'),
    options: () => (answers.path === 'student'
      ? ['GCSEs', 'A levels', 'A BTEC', 'An apprenticeship', 'Uni']
      : ['Nothing yet', 'Part-time or weekend work', 'Helping family or neighbours', 'Volunteering']).map((v) => ({ value: v, label: v }))
      .concat({ value: UPLOAD, label: 'Upload my CV', desc: 'PDF, Word or .txt. Your name and contact details come out first' }),
    free: true,
  },
  {
    key: 'district', step: 'Where in Oldham', title: 'Which part of Oldham?',
    say: () => 'Last one. Roughly which part of Oldham are you in? A town or a postcode start like OL8 is fine.',
    options: () => DISTRICTS.slice(1).map((d) => ({ value: d, label: d, desc: AREA_HINT[d] })).concat({ value: 'Anywhere in Oldham', label: 'Anywhere is fine' }),
    read: (t) => (has(/centre|center|coldhurst|town|ol1\b|central/)(t) ? 'Central'
      : has(/royton|shaw|crompton|ol2\b|north/)(t) ? 'North'
        : has(/saddleworth|uppermill|delph|dobcross|lees|waterhead|springhead|grotton|ol3\b|ol4\b|east/)(t) ? 'East'
          : has(/hollinwood|werneth|fitton|hathershaw|failsworth|ol8\b|m35\b|south/)(t) ? 'South'
            : has(/chadderton|westwood|freehold|ol9\b|west/)(t) ? 'West'
              : has(/any|not sure|don.?t know|dunno|skip|rather not|whatever/)(t) ? 'Anywhere in Oldham' : null),
  },
];
const AREA_HINT = { Central: 'Town centre, Coldhurst', North: 'Royton, Shaw, Crompton', East: 'Saddleworth, Lees, Springhead', South: 'Hollinwood, Werneth, Failsworth', West: 'Chadderton, Westwood' };
const keyOf = (q) => (typeof q.key === 'function' ? q.key() : q.key);

// ---- Chat window ------------------------------------------------------------

const log = $('#talk-log');
const input = $('#talk-input');
const talk = { q: null, done: false, busy: false, ids: [], history: [], districtPicked: false };

// The voice agent's expressive mode writes delivery cues like [happy] or [laughs]. The voice acts them out; the
// chat should not show them. Only lowercase cues are removed, so redaction tags like [PHONE] stay visible.
const withoutCues = (text) => String(text || '').replace(/\s*\[[a-z][a-z' -]{0,30}\]\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();

function line(who, raw) {
  const text = who === 'ai' ? withoutCues(raw) : raw;
  const row = el('div', `msg ${who}`);
  if (text) row.append(el('p', null, text));
  if (who === 'ai' && text) row.append(sayButton(() => text));
  log.append(row);
  log.scrollTo({ top: log.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' });
  return row;
}

async function typing(ms = 650) {
  const dots = el('div', 'msg ai typing');
  dots.append(el('span'), el('span'), el('span'));
  log.append(dots);
  log.scrollTop = log.scrollHeight;
  await wait(reduceMotion ? 0 : ms);
  dots.remove();
}

// Ask the next question nobody has answered yet; when there are none left, find matches.
async function next() {
  sync();
  const q = QUESTIONS.find((item) => !(keyOf(item) in answers) && !(item.key === 'district' && talk.districtPicked));
  talk.q = q || null;
  if (!q) { await findMatches(); return; }
  $('#talk-step').textContent = `${QUESTIONS.indexOf(q) + 1} of ${QUESTIONS.length}: ${q.step}`;
  await typing();
  line('ai', q.say());
  pop(q.title, q.options(), (opt) => (opt.value === UPLOAD ? fileInput.click() : reply(opt.label, opt.value)));
  input.placeholder = q.free ? 'Type your answer, or "skip"...' : 'Pick above or type a reply...';
}

// Someone answered: from the pop-up (value given) or typed (read it).
async function reply(text, value) {
  const q = talk.q;
  closePop();
  line('user', text);
  if (!q) { await chat(text); return; }
  const key = keyOf(q);
  let v = value;
  if (v === undefined) v = q.free ? (/^(skip|no|nothing|none|nah|n\/a)\.?$/i.test(text.trim()) ? '' : text.trim().slice(0, 1000)) : q.read(text);
  if (v === null) {
    await typing(400);
    line('ai', "Sorry, I didn't quite get that. Could you pick one of these?");
    pop('Pick one', q.options(), (opt) => reply(opt.label, opt.value));
    return;
  }
  if (key === 'district') setDistrict(v); else answers[key] = v;
  if (key === 'type') document.dispatchEvent(new CustomEvent('pathly:type', { detail: { type: v } }));
  await next();
}

async function findMatches() {
  $('#talk-step').textContent = 'Your options';
  input.placeholder = 'Ask about these options...';
  line('ai', 'Thanks. Give me a moment while I look through what Oldham has on.');
  await typing(200);
  const dots = el('div', 'msg ai typing');
  dots.append(el('span'), el('span'), el('span'));
  log.append(dots);
  log.scrollTop = log.scrollHeight;
  const data = await loadResults();
  dots.remove();
  if (!data) { line('ai', "Something went wrong finding options. Give it a minute and press Start again."); return null; }
  showResults(data);
  return data;
}

async function loadResults() {  // returns the API reply (or null), so the voice agent can read it out too
  try {
    const res = await fetch('/api/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...VISIT },
      body: JSON.stringify(Object.fromEntries(FIELDS.filter((k) => answers[k]).map((k) => [k, answers[k]]))),
    });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (err) {
    return null;
  }
}

function showResults(data) {
  talk.done = true;
  if (data.crisis) {
    const row = line('ai alert', data.crisis.message);
    row.setAttribute('role', 'alert');
  }
  if (data.summary) line('ai', data.summary);
  if ((data.possible_directions || []).length) {
    const row = line('ai wide');
    const dirs = el('div', 'directions');
    dirs.append(el('p', 'eyebrow', 'Directions you could explore'));
    data.possible_directions.forEach((d) => { const item = el('div', 'direction'); item.append(el('strong', null, d.title), el('span', null, d.why)); dirs.append(item); });
    row.append(dirs);
  }
  if (data.matches.length) {
    const row = line('ai wide');
    const list = el('div', 'results');
    list.append(...data.matches.map(matchCard));
    row.append(list, el('p', 'hint', data.used_ai
      ? `${data.matches.length} options picked for you. Real Oldham services, checked on 16 October 2026; check details before you go.`
      : 'A simple match, because the AI is not available right now. Check details before you go.'));
    if (!reduceMotion && window.gsap) gsap.from(row.querySelectorAll('.match'), { y: 24, opacity: 0, stagger: 0.09, duration: 0.8, ease: 'expo.out' });
    showJobs(line('ai wide'));
  }
  document.dispatchEvent(new CustomEvent('pathly:results', { detail: { matches: data.matches } }));
  talk.ids = data.matches.map((m) => m.id).slice(0, 5);
  talk.result = data;
  sync();
  talk.history = [];
  if (talk.ids.length) {
    line('ai', 'Want to know more about any of these? Ask me anything, like what to say when you ring or which to try first.');
    suggest(STARTERS);
  }
  log.scrollTo({ top: log.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' });
}

// Jobs on the open market, filled into a row placed under the matches. Only a fixed keyword leaves our server.
async function showJobs(row) {
  let data;
  try {
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(FIELDS.filter((k) => answers[k]).map((k) => [k, answers[k]]))),
    });
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
  } catch (err) {
    row.remove();
    return;
  }
  const box = el('div', 'jobs');
  box.append(el('p', 'eyebrow', data.live ? 'Jobs going near Oldham right now' : 'Jobs on the market'));
  data.jobs.forEach((j) => {
    const a = el('a', 'job');
    a.href = j.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.append(el('strong', null, j.title), el('span', null, [j.company, j.area].filter(Boolean).join(', ')));
    if (j.salary) a.append(el('span', 'job-pay', j.salary));
    box.append(a);
  });
  const links = el('p', 'job-links', data.live ? 'More on ' : `Search "${data.keyword}" jobs in Oldham on `);
  data.search_links.forEach((l, i) => {
    const a = el('a', null, l.site);
    a.href = l.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    links.append(a, i < data.search_links.length - 1 ? ', ' : '.');
  });
  box.append(links);
  row.append(box);
  if (!reduceMotion && window.gsap) gsap.from(box.children, { y: 16, opacity: 0, stagger: 0.06, duration: 0.7, ease: 'expo.out' });
}

// Things a young person would ask next. The AI's follow_up_questions are questions for them, so they don't fit here.
const STARTERS = ['Which one should I try first?', 'What should I say when I ring?', 'What do I need to know before I go?'];

function suggest(questions) {
  const list = (questions || []).slice(0, 3).map((q) => ({ value: q, label: q }));
  if (list.length) pop('Ask about your options', list, (opt) => reply(opt.label));
}

// After the matches: free chat about them through /api/chat (DeepSeek, grounded in the matched ids).
async function chat(text) {
  if (!talk.ids.length || talk.busy) return;
  talk.busy = true;
  const dots = el('div', 'msg ai typing');
  dots.append(el('span'), el('span'), el('span'));
  log.append(dots);
  log.scrollTop = log.scrollHeight;
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...VISIT },
      body: JSON.stringify({
        answers: Object.fromEntries(FIELDS.filter((k) => answers[k]).map((k) => [k, answers[k]])),
        matched_opportunity_ids: talk.ids, history: talk.history.slice(-8), message: text,
      }),
    });
    if (res.status === 429) throw new Error('busy');
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    let answer = data.reply;
    if (data.needs_human_support) answer += ' It would help to talk this through with a trusted adult or an adviser at the Youth Hub today.';
    dots.remove();
    line('ai', answer);
    if ((data.referenced_opportunity_ids || []).length) document.dispatchEvent(new CustomEvent('pathly:mentioned', { detail: { ids: data.referenced_opportunity_ids } }));
    talk.history.push({ role: 'user', content: text.slice(0, 1000) }, { role: 'assistant', content: answer.slice(0, 1000) });
    suggest(data.suggested_questions);
  } catch (err) {
    dots.remove();
    line('ai', err.message === 'busy'
      ? "You've asked a lot in a short time. Give it a few minutes and try again."
      : "Sorry, I can't answer right now. You can still use the contact details on each option.");
  } finally {
    talk.busy = false;
  }
}

$('#talk-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  if (!talk.q && !talk.done) return; // still typing the first question
  reply(text);
});

function restart() {
  if (conversation) conversation.endSession();
  Object.keys(answers).forEach((k) => delete answers[k]);
  Object.assign(talk, { q: null, done: false, busy: false, ids: [], history: [], districtPicked: false });
  closePop();
  log.replaceChildren();
  talk.result = null;
  document.dispatchEvent(new CustomEvent('pathly:reset'));
  next();
}
$('#talk-restart').addEventListener('click', restart);

// ---- Documents: a CV or any doc, read on the server with personal details taken out ----

const fileInput = $('#doc-input');
const DOC_TYPES = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', txt: 'text/plain' };
$('#attach').addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  fileInput.value = '';
  if (!file || talk.busy) return;
  const ext = file.name.split('.').pop().toLowerCase();
  closePop();
  line('user', `Uploaded a ${ext.toUpperCase()} file`); // not the file name: it often has the person's name in it
  if (!DOC_TYPES[ext]) { line('ai', "I can read PDF, Word (.docx) or .txt files. Could you save it as one of those?"); return reAsk(); }
  talk.busy = true;
  let read = false;
  const dots = el('div', 'msg ai typing');
  dots.append(el('span'), el('span'), el('span'));
  log.append(dots);
  log.scrollTop = log.scrollHeight;
  try {
    const res = await fetch('/api/read-doc', { method: 'POST', headers: { 'Content-Type': DOC_TYPES[ext], ...VISIT }, body: file });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || "I couldn't read that file.");
    dots.remove();
    const answerField = !talk.done && talk.q && keyOf(talk.q) === 'studies' ? 'studies' : 'experience';
    answers[answerField] = [answers[answerField], data.text].filter(Boolean).join('\n').slice(0, 1000);
    const removed = data.removed.length ? ` I took out your ${listOf(data.removed)} first.` : '';
    line('ai', `Got it, I've read it.${removed} It's saved on our own server with those details removed.`);
    read = true;
  } catch (err) {
    dots.remove();
    line('ai', err.message);
  } finally {
    talk.busy = false;
  }
  if (read && talk.done) { line('ai', "I'll look again with that in mind."); await findMatches(); } else reAsk();
});

const listOf = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

// Carry on after an upload: skip the question the CV answered, or ask the current one again.
function reAsk() {
  if (talk.done) return suggest(STARTERS);
  if (!talk.q || keyOf(talk.q) in answers) return next();
  pop(talk.q.title, talk.q.options(), (opt) => (opt.value === UPLOAD ? fileInput.click() : reply(opt.label, opt.value)));
}

// ---- Option pop-up (like Claude's question card) -----------------------------
// Numbered options above the bar. Click, press the number, or move with the arrows and press Enter.
// "Something else" (and Esc) closes it and puts the cursor in the bar.

const popEl = $('#pop');
let popPick = null;

function pop(question, options, onPick) {
  popPick = onPick;
  $('#pop-q').textContent = question;
  const all = options.concat({ value: undefined, label: 'Something else', desc: 'Type your own answer', other: true });
  $('#pop-options').replaceChildren(...all.map((opt, i) => {
    const b = el('button', `pop-opt${opt.other ? ' other' : ''}`);
    b.type = 'button';
    b.setAttribute('role', 'option');
    b.append(el('span', 'pop-n', String(i + 1)), el('strong', null, opt.label));
    if (opt.desc) b.append(el('span', 'pop-desc', opt.desc));
    b.addEventListener('click', () => (opt.other ? closePop(true) : onPick(opt)));
    return b;
  }));
  popEl.hidden = false;
  if (!reduceMotion && window.gsap) gsap.fromTo(popEl, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'expo.out' });
}

function closePop(focusBar) {
  popEl.hidden = true;
  popPick = null;
  if (focusBar) input.focus();
}

document.addEventListener('keydown', (e) => {
  if (popEl.hidden) return;
  const opts = $$('.pop-opt', popEl);
  const at = opts.indexOf(document.activeElement);
  const typingInBar = document.activeElement === input && input.value;
  if (e.key === 'Escape') { closePop(true); return; }
  if (typingInBar) return;
  if (/^[1-9]$/.test(e.key) && opts[e.key - 1] && (document.activeElement === input || at > -1)) { e.preventDefault(); opts[e.key - 1].click(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (at === -1 && document.activeElement !== input) return;
    e.preventDefault();
    const n = e.key === 'ArrowDown' ? (at + 1) % opts.length : (at - 1 + opts.length) % opts.length;
    opts[at === -1 ? 0 : n].focus();
  }
});

// ---- Results cards ----------------------------------------------------------

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

// ---- Listen buttons (ElevenLabs text to speech through /api/speak) -----------
// They only show when the server has a key (body.voice-on). Without one the site is text only.

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
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: withoutCues(getText()).slice(0, 800) }),
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

fetch('/api/voice').then((r) => (r.ok ? r.json() : {})).then((v) => {
  if (v.enabled) { voice.on = true; document.body.classList.add('voice-on'); }
}).catch(() => {});

// ---- The mic beside the bar ---------------------------------------------------
// 1. With an ElevenLabs agent set up: a spoken conversation, shown in the same chat (agent setup in web/README.md).
// 2. Otherwise dictation into the bar: the server's ElevenLabs speech to text (it removes personal details),
//    or the browser's own speech recognition when the server has no key.

const ELEVENLABS_SDK = 'https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.26.0/+esm';
const mic = $('#mic');
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let conversation = null;
let dictation = null; // { stop() } while listening
let micBusy = false;

function setMic(state, text) {
  mic.className = state ? `mic is-${state}` : 'mic';
  mic.setAttribute('aria-pressed', String(state === 'listening' || state === 'speaking'));
  $('#mic-label').textContent = state ? 'Stop the mic' : 'Talk instead of typing';
  if (text) $('#voice-status').textContent = text;
}

// The agent calls this client tool once it has heard enough. Same checks as typing, same /api/match guarantees.
async function findOpportunities(params = {}) {
  const pick = (key, allowed) => (allowed.includes(params[key]) ? params[key] : undefined);
  Object.keys(answers).forEach((k) => delete answers[k]);
  answers.path = pick('path', ['student', 'explore']) || 'explore';
  answers.type = pick('type', Object.keys(TYPES)) || 'voluntary';
  ['hobbies', 'studies', 'interests', 'experience'].forEach((k) => {
    if (typeof params[k] === 'string' && params[k].trim()) answers[k] = params[k].trim().slice(0, 1000);
  });
  setDistrict(pick('district', DISTRICTS) || 'Anywhere in Oldham');
  closePop();
  talk.q = null;
  const data = await findMatches();
  if (!data) return 'The opportunity search is not working right now. Suggest they type in the chat instead.';
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

async function startAgent() {
  const res = await fetch('/api/voice/session');
  if (res.status === 503) return false; // no agent set up: use dictation instead
  if (!res.ok) throw new Error('voice chat is unavailable right now');
  const { signed_url: signedUrl } = await res.json();
  await navigator.mediaDevices.getUserMedia({ audio: true });
  const { Conversation } = await import(ELEVENLABS_SDK);
  closePop();
  conversation = await Conversation.startSession({
    signedUrl,
    clientTools: { find_opportunities: findOpportunities },
    onConnect: () => setMic('listening', "You're talking to Pathly. Tap the mic again to stop."),
    onDisconnect: () => { conversation = null; setMic('', 'Voice chat ended. You can keep typing.'); },
    onModeChange: ({ mode }) => setMic(mode === 'speaking' ? 'speaking' : 'listening'),
    onMessage: ({ source, message }) => line(source === 'user' ? 'user' : 'ai', message),
    onError: (message) => console.warn('Voice error:', message),
  });
  if (!reduceMotion) requestAnimationFrame(meter);
  return true;
}

function addToBar(text) {
  if (!text) return;
  input.value = [input.value.trim(), text.trim()].filter(Boolean).join(' ').slice(0, 800);
  input.focus();
}

async function startServerDictation() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const type = ['audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
  const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks = [];
  const timer = setTimeout(() => recorder.state === 'recording' && recorder.stop(), 60000);
  recorder.addEventListener('dataavailable', (e) => chunks.push(e.data));
  recorder.addEventListener('stop', async () => {
    clearTimeout(timer);
    stream.getTracks().forEach((t) => t.stop());
    dictation = null;
    setMic('connecting', 'Writing that down...');
    try {
      const blob = new Blob(chunks, { type: (type || 'audio/webm').split(';')[0] });
      const res = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      addToBar(data.text);
      setMic('', data.removed.length ? `We took out your ${data.removed.join(' and ')} so it stays private. Check it, then send.`
        : (data.text ? 'Check it reads right, then send.' : "Sorry, we didn't catch that. Try again."));
    } catch (err) {
      setMic('', "Voice isn't working right now. You can type instead.");
    }
  });
  recorder.start();
  dictation = { stop: () => recorder.stop() };
  setMic('listening', 'Listening. Tap the mic again when you are done.');
}

function startBrowserDictation() {
  const rec = new Recognition();
  rec.lang = 'en-GB';
  rec.interimResults = false;
  rec.addEventListener('result', (e) => addToBar([...e.results].map((r) => r[0].transcript).join(' ')));
  rec.addEventListener('error', (e) => setMic('', e.error === 'not-allowed' ? 'The microphone is blocked. You can type instead.' : "Sorry, we didn't catch that. Try again."));
  rec.addEventListener('end', () => { dictation = null; if (mic.classList.contains('is-listening')) setMic('', 'Check it reads right, then send.'); });
  rec.start();
  dictation = { stop: () => rec.stop() };
  setMic('listening', "Listening. Your browser's speech service turns it into text.");
}

mic.addEventListener('click', async () => {
  if (micBusy) return;
  if (conversation) { conversation.endSession(); return; }
  if (dictation) { dictation.stop(); return; }
  micBusy = true;
  setMic('connecting', 'Starting the mic...');
  try {
    if (!navigator.mediaDevices) throw new Error('the page needs to be opened over https'); // browsers only allow the mic on https or localhost
    if (voice.on && await startAgent()) return;
    if (voice.on && window.MediaRecorder) await startServerDictation();
    else if (Recognition) startBrowserDictation();
    else throw new Error("this browser can't turn speech into text");
  } catch (err) {
    conversation = null;
    const reason = err.name === 'NotAllowedError' ? 'the microphone is blocked' : err.message;
    setMic('', `The mic isn't available (${reason}). You can type instead.`);
  } finally {
    micBusy = false;
  }
});
if (!Recognition && !window.MediaRecorder) mic.hidden = true;

// ---- What's out there accordion ------------------------------------------------

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
// "Start with ..." answers the type question for them, then carries on in the chat.
$$('[data-pick]').forEach((btn) => btn.addEventListener('click', () => {
  goTo('#start');
  if (talk.done || conversation) return;
  answers.type = btn.dataset.pick;
  document.dispatchEvent(new CustomEvent('pathly:type', { detail: { type: btn.dataset.pick } }));
  line('user', `I'm after ${TYPES[btn.dataset.pick].toLowerCase()} things`);
  if (talk.q && talk.q.key === 'type') { closePop(); next(); }
}));

// ---- Map hook (map.js draws Akshita's Oldham data; see web/README.md) ---------

function setDistrict(name, fromMap) {
  if (!DISTRICTS.includes(name)) return;
  answers.district = name;
  if (fromMap) talk.districtPicked = true;
  $$('.district-picker button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.district === name)));
  document.dispatchEvent(new CustomEvent('pathly:district', { detail: { district: name } }));
  sync();
}
// The map follows the chat: a status line here, and a hand-off so /map/ opens on the same answers and results.
// sessionStorage, not localStorage: it goes when the tab closes, which matters on shared library computers.
function sync() {
  const { type, district } = answers;
  const n = talk.result ? talk.result.matches.length : 0;
  $('#map-picked').textContent = `Showing: ${type ? `${TYPES[type]} places` : 'Everything'} in ${!district || district === 'Anywhere in Oldham' ? 'all of Oldham' : district}${n ? `, your ${n} matches numbered` : ''}`;
  $('#full-map').textContent = n ? 'See your matches on the full map' : 'Open the full map';
  try {
    sessionStorage.setItem('pathly:chat', JSON.stringify({ answers, result: talk.result ? {
      matches: talk.result.matches, summary: talk.result.summary, crisis: talk.result.crisis, used_ai: talk.result.used_ai } : null }));
  } catch (err) { /* private mode: the full map just starts fresh */ }
}

window.Pathly = { setDistrict: (name) => setDistrict(name, true), answers };
$$('.district-picker button').forEach((b) => b.addEventListener('click', () => setDistrict(b.dataset.district, true)));

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
    .from('.hero-copy .eyebrow, .hero-side', { y: 24, opacity: 0, duration: 1, stagger: 0.08 }, 0.25)
    .from('.talk', { y: 40, opacity: 0, duration: 1.2 }, 0.35)
    .from('.marquee', { opacity: 0, duration: 1.2 }, 0.6);

  ScrollTrigger.batch('.reveal', {
    start: 'top 85%',
    onEnter: (els) => gsap.from(els, { y: 40, opacity: 0, duration: 1.1, stagger: 0.1, ease: 'expo.out', overwrite: true }),
    once: true,
  });
}

next();
