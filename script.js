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
let step = 0;
let recognition = null;
let recognitionState = 'ready';
let sessionActive = false;
let discardRecognitionResult = false;
let stopRequested = false;

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
  if (recognition && sessionActive) {
    discardRecognitionResult = true;
    recognition.abort();
  }
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

function setMicState(state, message) {
  recognitionState = state;
  micStatus.textContent = message;
  micStatus.dataset.state = state;
  mic.classList.toggle('listening', state === 'listening');
  mic.setAttribute('aria-pressed', String(state === 'listening'));
  const label = state === 'listening' ? 'إيقاف الاستماع' : 'بدء التحدث بالألمانية';
  mic.setAttribute('aria-label', label);
  mic.title = label;
  console.debug('[DeutschBot speech] state:', state);
}

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = 'de-DE';
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => {
    if (!discardRecognitionResult && !stopRequested) {
      setMicState('listening', 'يستمع الميكروفون الآن... تحدّث بالألمانية.');
    }
  };
  recognition.onspeechend = () => {
    if (!discardRecognitionResult && recognitionState !== 'error') {
      setMicState('processing', 'جارٍ معالجة الكلام...');
    }
  };
  recognition.onresult = event => {
    if (discardRecognitionResult) return;
    answer.value = event.results[0][0].transcript;
    setMicState('processing', 'تم التقاط كلامك. راجع النص وعدّله قبل إرساله.');
    console.debug('[DeutschBot speech] result received');
    answer.focus();
  };
  recognition.onerror = event => {
    if (discardRecognitionResult && event.error === 'aborted') return;
    const errors = { 'not-allowed': 'لم يُسمح باستخدام الميكروفون. تحقّق من أذونات المتصفح.', 'service-not-allowed': 'خدمة التعرّف على الكلام غير متاحة.', 'audio-capture': 'لم يتم العثور على ميكروفون.', 'no-speech': 'لم نسمع صوتاً. حاول مرة أخرى.', 'network': 'تعذّر الاتصال بخدمة التعرّف على الكلام في المتصفح.' };
    console.warn('[DeutschBot speech] recognition error:', event.error);
    setMicState('error', `خطأ: ${errors[event.error] || 'تعذّر التعرّف على الكلام. يمكنك الكتابة بدلاً من ذلك.'}`);
  };
  recognition.onend = () => {
    sessionActive = false;
    console.debug('[DeutschBot speech] session ended');
    if (discardRecognitionResult) {
      discardRecognitionResult = false;
      setMicState('ready', 'الميكروفون جاهز.');
    } else if (recognitionState !== 'error') {
      setMicState('ready', answer.value ? 'الميكروفون جاهز. راجع إجابتك قبل إرسالها.' : 'الميكروفون جاهز.');
    }
  };
  mic.addEventListener('click', () => {
    if (sessionActive) {
      if (recognitionState === 'listening') {
        stopRequested = true;
        setMicState('processing', 'جارٍ إيقاف الاستماع ومعالجة الكلام...');
        recognition.stop();
      }
      return;
    }
    try {
      // Mark the session active before start() so rapid clicks cannot start twice.
      sessionActive = true;
      discardRecognitionResult = false;
      stopRequested = false;
      setMicState('processing', 'جارٍ تشغيل الميكروفون؛ اسمح بالوصول إذا طلب المتصفح ذلك.');
      console.debug('[DeutschBot speech] starting recognition (de-DE)');
      recognition.start();
    } catch (error) {
      sessionActive = false;
      console.warn('[DeutschBot speech] could not start:', error.name, error.message);
      setMicState('error', 'خطأ: تعذّر تشغيل الميكروفون. حاول مجدداً أو اكتب إجابتك.');
    }
  });
  setMicState('ready', 'الميكروفون جاهز. اضغط للتحدث بالألمانية.');
} else {
  mic.disabled = true;
  mic.title = 'التعرّف على الكلام غير مدعوم في هذا المتصفح';
  mic.setAttribute('aria-label', mic.title);
  micStatus.dataset.state = 'error';
  micStatus.textContent = 'التعرّف على الكلام غير مدعوم في هذا المتصفح؛ يمكنك كتابة إجابتك أو تجربة متصفح يدعمه.';
  console.warn('[DeutschBot speech] SpeechRecognition is not supported by this browser');
}

loadProgress();
updateProgress();
showCurrentStep();
