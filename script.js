'use strict';

// Each step accepts a few beginner-friendly answers and offers a helpful retry.
const lesson = [
  { prompt: 'Hallo! Ich bin DeutschBot. Wie heißt du?', translation: 'مرحباً! أنا دويتش بوت. ما اسمك؟', hint: 'يمكنك الإجابة مثلاً: Ich heiße Sara.', matches: [/\bich\s+(hei(?:ß|ss)e|bin)\s+\S+/i, /^mein name ist\s+\S+/i], reply: 'Schön, dich kennenzulernen!', replyAr: 'سعيد بالتعرّف عليك!' },
  { prompt: 'Wie geht es dir?', translation: 'كيف حالك؟', hint: 'جرّب: Mir geht es gut. أو: Es geht mir gut.', matches: [/\b(gut|super|prima|toll|schlecht|müde|muede|okay|ok)\b/i, /es geht/i], reply: 'Danke für deine Antwort!', replyAr: 'شكراً لإجابتك!' },
  { prompt: 'Woher kommst du?', translation: 'من أين أنت؟', hint: 'جرّب: Ich komme aus Ägypten.', matches: [/\b(ich\s+komme|komme)\s+aus\s+\S+/i, /^aus\s+\S+/i], reply: 'Das ist interessant!', replyAr: 'هذا مثير للاهتمام!' },
  { prompt: 'Sprichst du Deutsch?', translation: 'هل تتحدث الألمانية؟', hint: 'جرّب: Ja, ein bisschen. أو: Nein.', matches: [/\b(ja|nein|bisschen|wenig|deutsch)\b/i], reply: 'Super gemacht! Du hast die erste Unterhaltung geschafft. Auf Wiedersehen!', replyAr: 'أحسنت! لقد أكملت محادثتك الأولى. إلى اللقاء!' }
];

const storageKey = 'deutschbot-v1-progress';
const messages = document.getElementById('messages');
const form = document.getElementById('chat-form');
const answer = document.getElementById('answer');
const status = document.getElementById('status');
const translationToggle = document.getElementById('translations');
const mic = document.getElementById('mic');
const practiceAnswer = document.getElementById('practice-answer');
const practiceMic = document.getElementById('practice-mic');
const practiceMicStatus = document.getElementById('practice-mic-status');
let voiceAnswer = answer;
let voiceMic = mic;
let voiceStatus;
let step = 0;
let recognition = null;
let recognitionState = 'ready';
let sessionActive = false;
let discardRecognitionResult = false;
let stopRequested = false;
let sessionTimer = null;
let recoveryTimer = null;
let sessionId = 0;
let inputChanged = false;
let updatingTranscript = false;
let initialAnswer = '';
let receivedResult = false;

[answer, practiceAnswer].forEach(input => input.addEventListener('input', () => {
  if (sessionActive && input === voiceAnswer && !updatingTranscript) inputChanged = true;
}));

function cancelRecognition() {
  if (!recognition || !sessionActive) return;
  discardRecognitionResult = true;
  setMicState('processing', 'جارٍ إيقاف الميكروفون...');
  abortSession();
}

function saveProgress() {
  try { localStorage.setItem(storageKey, JSON.stringify({ step })); }
  catch (_) { status.textContent = 'تعذّر حفظ التقدّم في هذا المتصفح.'; }
}

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && Number.isInteger(saved.step)) step = Math.max(0, Math.min(lesson.length, saved.step));
  } catch (_) { /* Storage may be unavailable or contain invalid data. */ }
}

function updateProgress() {
  const percent = Math.round(step / lesson.length * 100);
  document.getElementById('progress-percent').textContent = `${percent}%`;
  document.getElementById('progress-count').textContent = `${step} من ${lesson.length} خطوات`;
  document.getElementById('progress-fill').style.width = `${percent}%`;
  document.querySelector('.progress-track').setAttribute('aria-valuenow', String(percent));
}

// All message content is inserted as text, never interpreted as HTML.
function addMessage(text, translation = '', user = false) {
  const row = document.createElement('div');
  row.className = `message${user ? ' user' : ''}`;
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = user ? 'م' : '✦';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  const german = document.createElement('div');
  german.className = 'german';
  german.lang = 'de';
  german.textContent = text;
  bubble.appendChild(german);
  if (translation) {
    const arabic = document.createElement('div');
    arabic.className = 'arabic';
    arabic.textContent = translation;
    bubble.appendChild(arabic);
  }
  if (!user && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window) {
    const speak = document.createElement('button');
    speak.type = 'button';
    speak.className = 'speak';
    speak.textContent = '◖)) استمع';
    speak.setAttribute('aria-label', 'الاستماع إلى النص الألماني');
    speak.addEventListener('click', () => {
      cancelRecognition();
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'de-DE';
      const voice = window.speechSynthesis.getVoices().find(item => /^de([_-]|$)/i.test(item.lang));
      if (voice) utterance.voice = voice;
      window.speechSynthesis.speak(utterance);
    });
    bubble.appendChild(speak);
  }
  row.append(avatar, bubble);
  messages.appendChild(row);
  messages.scrollTop = messages.scrollHeight;
}

function showCurrentStep() {
  if (step < lesson.length) addMessage(lesson[step].prompt, lesson[step].translation);
  else addMessage('Du hast diese Lektion abgeschlossen. Gut gemacht!', 'لقد أكملت هذا الدرس. أحسنت! يمكنك إعادة الدرس في أي وقت.');
}

form.addEventListener('submit', event => {
  event.preventDefault();
  cancelRecognition();
  const value = answer.value.trim();
  if (!value) { answer.focus(); return; }
  if (step >= lesson.length) {
    status.textContent = 'اكتمل الدرس. اضغط زر إعادة البدء للممارسة مجدداً.';
    return;
  }
  addMessage(value, '', true);
  answer.value = '';
  const current = lesson[step];
  if (!current.matches.some(pattern => pattern.test(value))) {
    addMessage('Versuch es noch einmal!', current.hint);
    return;
  }
  addMessage(current.reply, current.replyAr);
  step += 1;
  saveProgress();
  updateProgress();
  if (step < lesson.length) showCurrentStep();
  else status.textContent = 'أحسنت! اكتمل الدرس. يمكنك إعادة المحاولة في أي وقت.';
  answer.focus();
});

document.getElementById('restart').addEventListener('click', () => {
  if (step > 0 && !window.confirm('إعادة بدء الدرس ستعيد تقدّم هذا الدرس إلى الصفر. هل تريد المتابعة؟')) return;
  cancelRecognition();
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  step = 0;
  saveProgress();
  updateProgress();
  messages.replaceChildren();
  answer.value = '';
  status.textContent = 'بدأ الدرس من جديد.';
  showCurrentStep();
  answer.focus();
});

translationToggle.addEventListener('change', () => {
  messages.classList.toggle('hide-translations', !translationToggle.checked);
});

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const micStatus = document.getElementById('mic-status');
voiceStatus = micStatus;

function setMicState(state, message) {
  recognitionState = state;
  voiceStatus.textContent = message;
  voiceStatus.dataset.state = state;
  voiceMic.classList.toggle('listening', state === 'listening');
  voiceMic.setAttribute('aria-pressed', String(state === 'listening'));
  const label = state === 'listening' ? 'إيقاف الاستماع' : 'بدء التحدث بالألمانية';
  voiceMic.setAttribute('aria-label', label);
  voiceMic.title = label;
  console.debug('[DeutschBot speech] state:', state);
}

// Recover even if a browser fails to emit end after aborting. Old callbacks are ignored.
function abortSession() {
  const id = sessionId;
  clearTimeout(sessionTimer);
  try { recognition.abort(); } catch (error) { console.warn('[DeutschBot speech] abort failed:', error.name); }
  clearTimeout(recoveryTimer);
  recoveryTimer = setTimeout(() => {
    if (!sessionActive || id !== sessionId) return;
    console.warn('[DeutschBot speech] no end event after abort; releasing session');
    sessionId += 1;
    sessionActive = false;
    recognition = null;
    if (recognitionState !== 'error') setMicState('ready', 'توقّف الميكروفون. يمكنك المحاولة مجدداً.');
  }, 2000);
}

if (SpeechRecognition) {
  function toggleRecognition(targetAnswer, targetMic, targetStatus) {
    if (sessionActive) {
      if (targetMic !== voiceMic) {
        cancelRecognition();
        targetStatus.textContent = 'أُوقفت الجلسة السابقة. اضغط مجدداً لبدء التحدث.';
        return;
      }
      if (!stopRequested && !discardRecognitionResult) {
        stopRequested = true;
        setMicState('processing', 'جارٍ إيقاف الاستماع ومعالجة الكلام...');
        try { recognition.stop(); } catch (error) {
          console.warn('[DeutschBot speech] stop failed:', error.name);
          discardRecognitionResult = true;
          setMicState('error', 'تعذّر إيقاف الاستماع. حاول مجدداً.');
          abortSession();
        }
      }
      return;
    }
    voiceAnswer = targetAnswer;
    voiceMic = targetMic;
    voiceStatus = targetStatus;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (window.isSecureContext === false) {
      setMicState('error', 'يتطلب الميكروفون اتصالاً آمناً. افتح التطبيق عبر localhost أو HTTPS.');
      console.warn('[DeutschBot speech] insecure context');
      return;
    }
    const id = ++sessionId;
    const current = new SpeechRecognition();
    recognition = current;
    current.lang = 'de-DE';
    current.interimResults = true;
    current.continuous = false;
    current.maxAlternatives = 1;
    sessionActive = true;
    discardRecognitionResult = false;
    stopRequested = false;
    inputChanged = false;
    receivedResult = false;
    initialAnswer = voiceAnswer.value;
    const active = () => sessionActive && id === sessionId;
    const logEvent = name => console.debug(`[DeutschBot speech] ${name}`, { session: id });
    current.onstart = () => {
      logEvent('start');
      if (active() && !discardRecognitionResult && !stopRequested) setMicState('listening', 'بدأت جلسة التعرّف. تحدّث بالألمانية وانتظر ظهور النص.');
    };
    current.onaudiostart = () => logEvent('audiostart');
    current.onsoundstart = () => logEvent('soundstart');
    current.onspeechstart = () => logEvent('speechstart');
    current.onaudioend = () => logEvent('audioend');
    current.onspeechend = () => {
      logEvent('speechend');
      if (active() && !discardRecognitionResult && recognitionState !== 'error') setMicState('processing', 'جارٍ معالجة الكلام...');
    };
    current.onresult = event => {
      const parts = [];
      let finalCount = 0;
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result[0]) parts.push(result[0].transcript);
        if (result.isFinal) finalCount += 1;
      }
      // Do not log the spoken text; event counts help diagnose the pipeline.
      console.debug('[DeutschBot speech] result', { session: id, resultIndex: event.resultIndex, results: event.results.length, final: finalCount });
      if (!active() || discardRecognitionResult) return;
      if (inputChanged) {
        setMicState('processing', 'لم نستبدل النص لأنك عدّلته أثناء الاستماع. يمكنك المحاولة مجدداً.');
        return;
      }
      const transcript = parts.join('').trim();
      if (!transcript) return;
      receivedResult = true;
      updatingTranscript = true;
      try {
        voiceAnswer.value = initialAnswer ? `${initialAnswer.trimEnd()} ${transcript}` : transcript;
        voiceAnswer.dispatchEvent(new Event('input', { bubbles: true }));
      } finally { updatingTranscript = false; }
      if (finalCount === event.results.length) setMicState('processing', 'تم التقاط كلامك. راجع النص وعدّله قبل إرساله.');
    };
    current.onnomatch = () => {
      logEvent('nomatch');
      if (active() && !discardRecognitionResult && recognitionState !== 'error') setMicState('error', 'لم نتمكن من مطابقة الكلام. حاول مجدداً أو اكتب إجابتك.');
    };
    current.onerror = event => {
      console.warn('[DeutschBot speech] error', { session: id, error: event.error, message: event.message });
      if (!active() || discardRecognitionResult) return;
      const errors = { 'not-allowed': 'لم يُسمح باستخدام الميكروفون. تحقّق من إذن الموقع في Chrome وإعدادات الجهاز.', 'service-not-allowed': 'خدمة التعرّف على الكلام غير متاحة أو غير مسموحة في المتصفح.', 'audio-capture': 'تعذّر التقاط الصوت. تحقّق من الميكروفون وإعدادات الجهاز.', 'no-speech': 'لم يُكتشف كلام. تحقّق من الميكروفون وحاول مجدداً.', 'network': 'تعذّر الاتصال بخدمة التعرّف على الكلام. تحقّق من اتصال الإنترنت.' };
      setMicState('error', errors[event.error] || 'تعذّر التعرّف على الكلام. حاول مجدداً أو اكتب إجابتك.');
      // Some implementations do not reliably follow an error with end.
      abortSession();
    };
    current.onend = () => {
      logEvent('end');
      if (!active()) return;
      clearTimeout(sessionTimer);
      clearTimeout(recoveryTimer);
      sessionActive = false;
      recognition = null;
      if (recognitionState === 'error') return;
      if (discardRecognitionResult) setMicState('ready', 'الميكروفون جاهز.');
      else if (inputChanged) setMicState('ready', 'لم نستبدل النص لأنك عدّلته أثناء الاستماع. يمكنك المحاولة مجدداً.');
      else if (receivedResult) setMicState('ready', 'راجع النص وعدّله قبل إرساله.');
      else setMicState('ready', 'لم تظهر نتيجة. تحقّق من الميكروفون والاتصال، ثم حاول مجدداً.');
    };
    setMicState('processing', 'جارٍ تشغيل الميكروفون؛ اسمح بالوصول إذا طلب المتصفح ذلك.');
    console.debug('[DeutschBot speech] requesting start', { session: id, lang: current.lang, secureContext: window.isSecureContext });
    sessionTimer = setTimeout(() => {
      if (!active()) return;
      console.warn('[DeutschBot speech] recognition timeout', { session: id });
      discardRecognitionResult = true;
      setMicState('error', 'انتهت مهلة التعرّف على الكلام. تحقّق من الميكروفون والاتصال ثم حاول مجدداً.');
      abortSession();
    }, 20000);
    try { current.start(); } catch (error) {
      clearTimeout(sessionTimer);
      sessionActive = false;
      recognition = null;
      console.warn('[DeutschBot speech] start failed:', error.name, error.message);
      setMicState('error', 'تعذّر تشغيل الميكروفون. تحقّق من الأذونات وحاول مجدداً.');
    }
  }
  mic.addEventListener('click', () => toggleRecognition(answer, mic, micStatus));
  practiceMic.addEventListener('click', () => toggleRecognition(practiceAnswer, practiceMic, practiceMicStatus));
  setMicState('ready', 'الميكروفون جاهز. اضغط للتحدث بالألمانية.');
} else {
  mic.disabled = true;
  mic.title = 'التعرّف على الكلام غير مدعوم في هذا المتصفح';
  mic.setAttribute('aria-label', mic.title);
  micStatus.dataset.state = 'error';
  micStatus.textContent = 'التعرّف على الكلام غير مدعوم في هذا المتصفح؛ يمكنك كتابة إجابتك أو تجربة متصفح يدعمه.';
  practiceMic.disabled = true;
  practiceMicStatus.textContent = micStatus.textContent;
  console.warn('[DeutschBot speech] SpeechRecognition is not supported by this browser');
}

if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
  document.getElementById('speech-support').textContent = 'الاستماع إلى النطق غير مدعوم في هذا المتصفح؛ يمكنك متابعة الدرس بالقراءة والكتابة.';
}

loadProgress();
updateProgress();
showCurrentStep();

// Conversation content and transparent A1 matching rules.
const scenarios = {
  greetings: [
    { de: 'Hallo! Wie heißt du?', ar: 'مرحباً! ما اسمك؟', example: 'Ich heiße Sara.', rule: /(?:ich\s+(?:heiße|heisse|bin)|mein name ist)\s+\S+/i },
    { de: 'Schön, dich kennenzulernen! Wie geht es dir?', ar: 'سعيد بلقائك! كيف حالك؟', example: 'Mir geht es gut.', rule: /(?:gut|super|prima|schlecht|müde|muede|okay|nicht so gut)/i },
    { de: 'Woher kommst du?', ar: 'من أين أنت؟', example: 'Ich komme aus Syrien.', rule: /(?:komme\s+aus|^aus)\s+\S+/i },
    { de: 'Auf Wiedersehen! Bis bald!', ar: 'إلى اللقاء! أراك قريباً!', example: 'Tschüss, bis bald!', rule: /(?:tschüss|tschuess|auf wiedersehen|bis bald|ciao)/i }
  ],
  cafe: [
    { de: 'Guten Tag! Was möchten Sie trinken?', ar: 'مرحباً! ماذا تود أن تشرب؟', example: 'Einen Kaffee, bitte.', rule: /(?:kaffee|tee|wasser|saft|milch|schokolade)/i },
    { de: 'Möchten Sie auch etwas essen?', ar: 'هل تود شيئاً لتأكله أيضاً؟', example: 'Ja, ein Stück Kuchen, bitte.', rule: /(?:ja|nein|kuchen|brot|brötchen|broetchen|croissant|sandwich)/i },
    { de: 'Hier oder zum Mitnehmen?', ar: 'هنا أم للوجبات الجاهزة؟', example: 'Hier, bitte.', rule: /(?:hier|mitnehmen|zum mitnehmen)/i },
    { de: 'Das macht fünf Euro. Wie möchten Sie bezahlen?', ar: 'الحساب خمسة يورو. كيف تود الدفع؟', example: 'Mit Karte, bitte.', rule: /(?:karte|bar|bargeld)/i }
  ],
  directions: [
    { de: 'Guten Tag! Kann ich Ihnen helfen?', ar: 'مرحباً! هل يمكنني مساعدتك؟', example: 'Ja, wo ist der Bahnhof?', rule: /(?:wo\s+(?:ist|finde)|suche|bahnhof|straße|strasse|weg)/i },
    { de: 'Der Bahnhof? Gehen Sie geradeaus. Ist das klar?', ar: 'المحطة؟ سر مباشرة. هل هذا واضح؟', example: 'Ja, danke.', rule: /(?:ja|danke|verstanden|nein|nicht verstanden)/i },
    { de: 'Dann links. Haben Sie noch eine Frage?', ar: 'ثم إلى اليسار. هل لديك سؤال آخر؟', example: 'Ist es weit?', rule: /(?:ja|nein|weit|wie lange|danke|wo)/i },
    { de: 'Es ist ganz nah. Auf Wiedersehen!', ar: 'إنه قريب جداً. إلى اللقاء!', example: 'Danke, auf Wiedersehen!', rule: /(?:danke|tschüss|tschuess|auf wiedersehen|bis bald)/i }
  ]
};

// Engine contract: evaluate({scenarioId, turn, reply}) resolves to {accepted, feedback, suggestion}.
// A future local engine can implement this interface without changing the UI or storage.
const conversationEngine = {
  async evaluate({ turn, reply }) {
    const accepted = turn.rule.test(reply.trim());
    return { accepted, feedback: accepted ? 'أحسنت! تطابق إجابتك إحدى العبارات المتوقعة.' : 'لم نجد عبارة متوقعة. جرّب إجابة أخرى؛ قد تكون إجابتك صحيحة أيضاً.', suggestion: turn.example };
  }
};

const practiceStorageKey = 'deutschbot-listening-speaking-v1';
const practiceProgress = {
  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(practiceStorageKey));
      return Object.fromEntries(Object.keys(scenarios).map(id => [id, Number.isInteger(saved?.[id]) ? Math.max(0, Math.min(scenarios[id].length, saved[id])) : 0]));
    } catch (_) { return Object.fromEntries(Object.keys(scenarios).map(id => [id, 0])); }
  },
  save(value) {
    try { localStorage.setItem(practiceStorageKey, JSON.stringify(value)); return true; }
    catch (_) { return false; }
  }
};
const practiceUI = {
  scenario: document.getElementById('practice-scenario'),
  progress: document.getElementById('practice-progress'),
  prompt: document.getElementById('practice-prompt'),
  translation: document.getElementById('practice-translation'),
  translations: document.getElementById('practice-translations'),
  feedback: document.getElementById('practice-feedback'),
  form: document.getElementById('practice-form'),
  retry: document.getElementById('practice-retry'),
  skip: document.getElementById('practice-skip'),
  next: document.getElementById('practice-next')
};
let practiceSaved = practiceProgress.load();
let practiceIndex = practiceSaved[practiceUI.scenario.value];
let practiceRevision = 0;
let practiceBusy = false;
let practicePassed = false;

function stopVoice() {
  cancelRecognition();
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}
function speakPractice(rate) {
  const turn = scenarios[practiceUI.scenario.value][practiceIndex];
  if (!turn) return;
  stopVoice();
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
    practiceUI.feedback.textContent = 'النطق غير مدعوم في هذا المتصفح. يمكنك قراءة النص.';
    return;
  }
  const utterance = new SpeechSynthesisUtterance(turn.de);
  utterance.lang = 'de-DE';
  utterance.rate = rate;
  const voice = window.speechSynthesis.getVoices().find(item => /^de([_-]|$)/i.test(item.lang));
  if (voice) utterance.voice = voice;
  const revision = practiceRevision;
  utterance.onerror = event => {
    if (revision === practiceRevision && event.error !== 'canceled' && event.error !== 'interrupted') practiceUI.feedback.textContent = 'تعذّر تشغيل الصوت. تحقّق من إعدادات الصوت في المتصفح والجهاز.';
  };
  window.speechSynthesis.speak(utterance);
}
function renderPractice() {
  practiceRevision += 1;
  practiceBusy = false;
  practicePassed = false;
  const turns = scenarios[practiceUI.scenario.value];
  const turn = turns[practiceIndex];
  practiceUI.progress.textContent = turn ? `الجولة ${practiceIndex + 1} من ${turns.length}` : `اكتمل الموقف: ${turns.length} من ${turns.length}`;
  practiceUI.prompt.textContent = turn ? turn.de : 'Gut gemacht!';
  practiceUI.translation.textContent = turn ? turn.ar : 'أكملت هذا الموقف! يمكنك إعادة ممارسته.';
  practiceUI.translation.hidden = !practiceUI.translations.checked;
  practiceUI.feedback.textContent = '';
  practiceAnswer.value = '';
  practiceAnswer.disabled = !turn;
  practiceMic.disabled = !turn || !SpeechRecognition;
  practiceUI.form.querySelector('[type="submit"]').disabled = !turn;
  practiceUI.skip.disabled = !turn;
  practiceUI.retry.textContent = turn ? 'حاول مجدداً' : 'أعد ممارسة الموقف';
  practiceUI.next.hidden = true;
}
function advancePractice() {
  stopVoice();
  const id = practiceUI.scenario.value;
  practiceIndex = Math.min(practiceIndex + 1, scenarios[id].length);
  practiceSaved[id] = Math.max(practiceSaved[id], practiceIndex);
  const saved = practiceProgress.save(practiceSaved);
  renderPractice();
  if (!saved) practiceUI.feedback.textContent = 'تعذّر حفظ تقدّم هذا الموقف في المتصفح.';
}
practiceUI.scenario.addEventListener('change', () => {
  stopVoice();
  practiceIndex = practiceSaved[practiceUI.scenario.value];
  renderPractice();
});
practiceUI.translations.addEventListener('change', () => { practiceUI.translation.hidden = !practiceUI.translations.checked; });
document.getElementById('practice-replay').addEventListener('click', () => speakPractice(1));
document.getElementById('practice-slow').addEventListener('click', () => speakPractice(0.7));
practiceUI.retry.addEventListener('click', () => {
  stopVoice();
  if (practiceIndex >= scenarios[practiceUI.scenario.value].length) practiceIndex = 0;
  renderPractice();
  practiceAnswer.focus();
});
practiceUI.skip.addEventListener('click', advancePractice);
practiceUI.next.addEventListener('click', advancePractice);
practiceUI.form.addEventListener('submit', async event => {
  event.preventDefault();
  stopVoice();
  const reply = practiceAnswer.value.trim();
  const id = practiceUI.scenario.value;
  const turn = scenarios[id][practiceIndex];
  if (!reply || !turn || practiceBusy || practicePassed) { if (!reply) practiceAnswer.focus(); return; }
  const revision = practiceRevision;
  practiceBusy = true;
  try {
    const result = await conversationEngine.evaluate({ scenarioId: id, turn, reply });
    if (revision !== practiceRevision) return;
    practiceUI.feedback.replaceChildren(document.createTextNode(`${result.feedback} مثال مقترح: `));
    const suggestion = document.createElement('span');
    suggestion.lang = 'de';
    suggestion.dir = 'ltr';
    suggestion.textContent = result.suggestion;
    practiceUI.feedback.appendChild(suggestion);
    practicePassed = result.accepted;
    practiceUI.next.hidden = !result.accepted;
  } catch (_) {
    if (revision === practiceRevision) practiceUI.feedback.textContent = 'تعذّر التحقق من الإجابة. حاول مجدداً.';
  } finally { if (revision === practiceRevision) practiceBusy = false; }
});

// Leaving either activity by navigation or focus stops playback and the active session.
document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', stopVoice));
document.getElementById('lesson').addEventListener('focusin', event => {
  if (voiceMic === practiceMic && sessionActive) cancelRecognition();
  if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget) && 'speechSynthesis' in window) window.speechSynthesis.cancel();
});
document.getElementById('practice').addEventListener('focusin', event => {
  if (voiceMic === mic && sessionActive) cancelRecognition();
  if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget) && 'speechSynthesis' in window) window.speechSynthesis.cancel();
});
renderPractice();
