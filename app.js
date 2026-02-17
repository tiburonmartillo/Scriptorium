(function () {
  'use strict';

  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
  }

  var inputSection = document.getElementById('inputSection');
  var readerSection = document.getElementById('readerSection');
  var textInput = document.getElementById('textInput');
  var wordsPerChunkInput = document.getElementById('wordsPerChunk');
  var wordsPerChunkValue = document.getElementById('wordsPerChunkValue');
  var speedInput = document.getElementById('speed');
  var speedValue = document.getElementById('speedValue');
  var btnStart = document.getElementById('btnStart');
  var readerWord = document.getElementById('readerWord');
  var btnPause = document.getElementById('btnPause');
  var btnResume = document.getElementById('btnResume');
  var btnStop = document.getElementById('btnStop');
  var btnContinue = document.getElementById('btnContinue');
  var progressBarFill = document.getElementById('progressBarFill');
  var progressText = document.getElementById('progressText');
  var readerBarProgressFill = document.getElementById('readerBarProgressFill');
  var wordsPerChunkReaderInput = document.getElementById('wordsPerChunkReader');
  var wordsPerChunkValueReader = document.getElementById('wordsPerChunkValueReader');
  var speedReaderInput = document.getElementById('speedReader');
  var speedValueReader = document.getElementById('speedValueReader');
  var fontSizeInput = document.getElementById('fontSize');
  var fontSizeValue = document.getElementById('fontSizeValue');
  var fontSizeReaderInput = document.getElementById('fontSizeReader');
  var fontSizeValueReader = document.getElementById('fontSizeValueReader');
  var fontFamilySelect = document.getElementById('fontFamily');
  var fontFamilyReaderSelect = document.getElementById('fontFamilyReader');
  var fontPreview = document.getElementById('fontPreview');
  var readerTextPreview = document.getElementById('readerTextPreview');
  var readerPreviewWrap = document.getElementById('readerPreviewWrap');
  var btnTogglePreview = document.getElementById('btnTogglePreview');

  var fontSizeClasses = ['text-xl', 'text-2xl', 'text-3xl', 'text-4xl', 'text-5xl'];
  var defaultFontFamily = "'Kumbh Sans', sans-serif";

  function getSelectedFontFamily() {
    return (fontFamilySelect && fontFamilySelect.value) ? fontFamilySelect.value : defaultFontFamily;
  }

  function applyReaderFontFamily(value) {
    var font = value || defaultFontFamily;
    readerWord.style.fontFamily = font;
    if (readerTextPreview) readerTextPreview.style.fontFamily = font;
  }

  function updateFontPreview() {
    if (fontPreview && fontFamilySelect) {
      fontPreview.style.fontFamily = fontFamilySelect.value || defaultFontFamily;
    }
  }

  function applyReaderFontSize(value) {
    var idx = Math.max(0, Math.min(4, parseInt(value, 10) - 1));
    fontSizeClasses.forEach(function (c) { readerWord.classList.remove(c); });
    readerWord.classList.add(fontSizeClasses[idx]);
  }

  var PROGRESS_KEY = 'reader-progress';
  var DRAFT_KEY = 'scriptorium-draft';
  var draftSaveTimeout = null;

  function saveDraft() {
    if (!textInput) return;
    try {
      var val = textInput.value;
      if (val) localStorage.setItem(DRAFT_KEY, val);
      else localStorage.removeItem(DRAFT_KEY);
    } catch (err) {}
  }

  function loadDraft() {
    if (!textInput) return;
    try {
      var saved = localStorage.getItem(DRAFT_KEY);
      if (saved != null) textInput.value = saved;
    } catch (err) {}
  }

  var chunks = [];
  var words = [];
  var currentChunkSize = 1;
  var currentIndex = 0;
  var timerId = null;
  var saveProgressIntervalId = null;
  var isPaused = false;

  function getActiveWordsPerChunk() {
    return readerSection.classList.contains('hidden')
      ? parseInt(wordsPerChunkInput.value, 10)
      : parseInt(wordsPerChunkReaderInput.value, 10);
  }

  function getActiveSpeed() {
    return readerSection.classList.contains('hidden')
      ? parseInt(speedInput.value, 10)
      : parseInt(speedReaderInput.value, 10);
  }

  function getWords(str) {
    return str.trim().split(/\s+/).filter(Boolean);
  }

  /**
   * Normaliza texto con espacios entre letras (p. ej. OCR o escaneos):
   * une "l a" -> "la", "d i e c i - s é i s" -> "dieciséis", etc.
   */
  function normalizeSpacedText(str) {
    if (!str || typeof str !== 'string') return str;
    var tokens = str.trim().split(/\s+/);
    if (tokens.length === 0) return str.trim();
    var singleLetter = /^[\p{L}\p{M}]$/u;
    function isSingleLetter(t) { return t.length === 1 && singleLetter.test(t); }
    var result = [];
    var i = 0;
    while (i < tokens.length) {
      var t = tokens[i];
      if (t.length > 1 || !singleLetter.test(t)) {
        result.push(t);
        i++;
        continue;
      }
      var word = '';
      while (i < tokens.length) {
        var tok = tokens[i];
        if (tok === '-' && word.length > 0 && i + 1 < tokens.length && isSingleLetter(tokens[i + 1])) {
          i++;
          continue;
        }
        if (isSingleLetter(tok)) {
          word += tok;
          i++;
        } else {
          break;
        }
      }
      if (word) result.push(word);
    }
    return result.join(' ');
  }

  function buildChunks(words, size) {
    var result = [];
    for (var i = 0; i < words.length; i += size) {
      result.push(words.slice(i, i + size).join(' '));
    }
    return result;
  }

  function extractTextFromPdf(arrayBuffer) {
    return pdfjsLib.getDocument({ data: arrayBuffer }).then(function (pdf) {
      var numPages = pdf.numPages;
      var promises = [];
      for (var i = 1; i <= numPages; i++) {
        promises.push(
          pdf.getPage(i).then(function (page) {
            return page.getTextContent().then(function (content) {
              return content.items.map(function (item) { return item.str; }).join(' ');
            });
          })
        );
      }
      return Promise.all(promises).then(function (pageTexts) {
        return pageTexts.join('\n');
      });
    });
  }

  function showError(message) {
    readerWord.textContent = message;
    readerWord.classList.add('text-amber-600', 'dark:text-amber-400');
  }

  function getSourceText(cb) {
    var raw = textInput.value.replace(/\s+/g, ' ').trim();
    if (!raw) {
      cb('Escribe o pega algo de texto.');
      return;
    }
    cb(null, normalizeSpacedText(raw));
  }

  function startReading() {
    getSourceText(function (err, text) {
      if (err) {
        alert(err);
        return;
      }
      var size = parseInt(wordsPerChunkInput.value, 10);
      currentChunkSize = size;
      words = getWords(text);
      chunks = buildChunks(words, size);
      if (chunks.length === 0) {
        alert('No hay texto para mostrar.');
        return;
      }
      currentIndex = 0;
      isPaused = false;
      btnPause.classList.remove('hidden');
      btnResume.classList.add('hidden');
      wordsPerChunkReaderInput.value = wordsPerChunkInput.value;
      wordsPerChunkValueReader.textContent = wordsPerChunkInput.value;
      speedReaderInput.value = speedInput.value;
      speedValueReader.textContent = speedInput.value;
      fontSizeReaderInput.value = fontSizeInput.value;
      fontSizeValueReader.textContent = fontSizeInput.value;
      fontFamilyReaderSelect.value = fontFamilySelect.value;
      applyReaderFontSize(fontSizeInput.value);
      applyReaderFontFamily(fontFamilySelect.value);
      readerWord.classList.remove('text-amber-600', 'dark:text-amber-400');
      buildTextPreview();

      function showReaderAndStartCountdown() {
        inputSection.classList.add('hidden');
        inputSection.style.opacity = '';
        readerSection.classList.remove('hidden');
        if (typeof gsap !== 'undefined') {
          gsap.fromTo(readerSection, { opacity: 0 }, { opacity: 1, duration: 0.75, ease: 'power2.out' });
        }
        var countdownEl = document.getElementById('readerCountdown');
        var countdownNumber = document.getElementById('readerCountdownNumber');
        if (countdownEl && countdownNumber) {
          countdownEl.classList.remove('hidden');
          var step = 3;
          function countdownTick() {
            countdownNumber.textContent = step;
            if (step === 0) {
              countdownEl.classList.add('hidden');
              runTick();
              startTimer();
              startAutoSaveProgress();
              updateTextPreviewHighlight();
              return;
            }
            step--;
            setTimeout(countdownTick, 1000);
          }
          countdownTick();
        } else {
          runTick();
          startTimer();
          startAutoSaveProgress();
          updateTextPreviewHighlight();
        }
      }

      if (typeof gsap !== 'undefined') {
        gsap.to(inputSection, {
          opacity: 0,
          duration: 0.55,
          ease: 'power2.in',
          onComplete: showReaderAndStartCountdown
        });
      } else {
        showReaderAndStartCountdown();
      }
    });
  }

  function runTick() {
    if (currentIndex >= chunks.length) {
      clearInterval(timerId);
      timerId = null;
      readerWord.textContent = '— Fin —';
      progressBarFill.style.width = '100%';
      if (readerBarProgressFill) readerBarProgressFill.style.width = '100%';
      progressText.textContent = chunks.length + ' / ' + chunks.length;
      return;
    }
    readerWord.textContent = chunks[currentIndex];
    var pct = chunks.length > 1 ? (currentIndex / (chunks.length - 1)) * 100 : 100;
    progressBarFill.style.width = pct + '%';
    if (readerBarProgressFill) readerBarProgressFill.style.width = pct + '%';
    progressText.textContent = (currentIndex + 1) + ' / ' + chunks.length;
    updateTextPreviewHighlight();
    currentIndex++;
  }

  function startTimer() {
    if (timerId) clearInterval(timerId);
    var wordsPerMin = getActiveSpeed();
    var chunkSize = getActiveWordsPerChunk();
    var chunkPerMin = wordsPerMin / chunkSize;
    var intervalMs = Math.round(60000 / chunkPerMin);
    timerId = setInterval(runTick, intervalMs);
  }

  function applyWordsPerChunkChange() {
    if (words.length === 0) return;
    var wordsRead = currentIndex * currentChunkSize;
    var newSize = parseInt(wordsPerChunkReaderInput.value, 10);
    currentChunkSize = newSize;
    chunks = buildChunks(words, newSize);
    currentIndex = Math.min(Math.floor(wordsRead / newSize), Math.max(0, chunks.length - 1));
    buildTextPreview();
    refreshReaderDisplay();
    if (!isPaused && timerId) startTimer();
  }

  function applySpeedChange() {
    speedValueReader.textContent = speedReaderInput.value;
    if (!isPaused && timerId) startTimer();
  }

  function buildTextPreview() {
    if (!readerTextPreview || chunks.length === 0) return;
    readerTextPreview.textContent = '';
    for (var i = 0; i < chunks.length; i++) {
      var span = document.createElement('span');
      span.setAttribute('data-chunk-index', i);
      span.textContent = chunks[i];
      span.className = 'reader-preview-chunk';
      if (i === currentIndex) span.classList.add('reader-preview-current');
      span.addEventListener('click', (function (idx) {
        return function () {
          if (idx >= 0 && idx < chunks.length) {
            currentIndex = idx;
            refreshReaderDisplay();
            updateTextPreviewHighlight();
          }
        };
      })(i));
      readerTextPreview.appendChild(span);
      if (i < chunks.length - 1) readerTextPreview.appendChild(document.createTextNode(' '));
    }
  }

  function updateTextPreviewHighlight() {
    if (!readerTextPreview) return;
    var spans = readerTextPreview.querySelectorAll('.reader-preview-chunk');
    var highlightIdx = currentIndex >= chunks.length ? chunks.length - 1 : currentIndex;
    for (var i = 0; i < spans.length; i++) {
      var idx = parseInt(spans[i].getAttribute('data-chunk-index'), 10);
      if (idx === highlightIdx) {
        spans[i].classList.add('reader-preview-current');
        spans[i].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        spans[i].classList.remove('reader-preview-current');
      }
    }
  }

  function refreshReaderDisplay() {
    if (currentIndex >= chunks.length) {
      readerWord.textContent = '— Fin —';
      progressBarFill.style.width = '100%';
      if (readerBarProgressFill) readerBarProgressFill.style.width = '100%';
      progressText.textContent = chunks.length + ' / ' + chunks.length;
      if (readerTextPreview) updateTextPreviewHighlight();
      return;
    }
    readerWord.textContent = chunks[currentIndex];
    var pct = chunks.length > 1 ? (currentIndex / (chunks.length - 1)) * 100 : 100;
    progressBarFill.style.width = pct + '%';
    if (readerBarProgressFill) readerBarProgressFill.style.width = pct + '%';
    progressText.textContent = (currentIndex + 1) + ' / ' + chunks.length;
    updateTextPreviewHighlight();
  }

  function pauseReading() {
    if (!timerId) return;
    clearInterval(timerId);
    timerId = null;
    isPaused = true;
    btnPause.classList.add('hidden');
    btnResume.classList.remove('hidden');
  }

  function resumeReading() {
    if (!isPaused || currentIndex >= chunks.length) return;
    isPaused = false;
    btnPause.classList.remove('hidden');
    btnResume.classList.add('hidden');
    startTimer();
    startAutoSaveProgress();
  }

  function stopReading() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    stopAutoSaveProgress();
    isPaused = false;
    chunks = [];
    words = [];
    currentIndex = 0;
    readerWord.textContent = '';
    progressBarFill.style.width = '0%';
    if (readerBarProgressFill) readerBarProgressFill.style.width = '0%';
    progressText.textContent = '0 / 0';
    updateContinueButtonVisibility();

    function showInputSection() {
      readerSection.classList.add('hidden');
      readerSection.style.opacity = '';
      inputSection.classList.remove('hidden');
      inputSection.style.opacity = '';
    }
    if (typeof gsap !== 'undefined') {
      gsap.to(readerSection, {
        opacity: 0,
        duration: 0.55,
        ease: 'power2.in',
        onComplete: function () {
          showInputSection();
          gsap.fromTo(inputSection, { opacity: 0 }, { opacity: 1, duration: 0.65, ease: 'power2.out' });
        }
      });
    } else {
      showInputSection();
    }
  }

  function saveProgress() {
    if (words.length === 0 || readerSection.classList.contains('hidden')) return;
    try {
      var progress = {
        text: words.join(' '),
        currentIndex: currentIndex,
        wordsPerChunk: getActiveWordsPerChunk(),
        speed: getActiveSpeed(),
        fontSize: parseInt(fontSizeReaderInput.value, 10),
        fontFamily: fontFamilyReaderSelect.value || defaultFontFamily,
        savedAt: Date.now()
      };
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    } catch (err) {}
  }

  function startAutoSaveProgress() {
    stopAutoSaveProgress();
    saveProgressIntervalId = setInterval(saveProgress, 5000);
  }

  function stopAutoSaveProgress() {
    if (saveProgressIntervalId) {
      clearInterval(saveProgressIntervalId);
      saveProgressIntervalId = null;
    }
  }

  function loadProgress() {
    try {
      var raw = localStorage.getItem(PROGRESS_KEY);
      if (!raw) return null;
      var progress = JSON.parse(raw);
      if (!progress || typeof progress.currentIndex !== 'number' || !progress.text) return null;
      return progress;
    } catch (err) {
      return null;
    }
  }

  function updateContinueButtonVisibility() {
    if (!btnContinue) return;
    btnContinue.classList.toggle('hidden', !loadProgress());
  }

  function startFromSavedProgress() {
    var progress = loadProgress();
    if (!progress) return;
    var size = Math.max(1, Math.min(5, progress.wordsPerChunk || 5));
    var spd = Math.max(60, Math.min(600, progress.speed || 280));
    var fs = Math.max(1, Math.min(5, progress.fontSize || 5));
    words = getWords(progress.text);
    currentChunkSize = size;
    chunks = buildChunks(words, size);
    currentIndex = Math.min(progress.currentIndex, Math.max(0, chunks.length - 1));
    if (chunks.length === 0) {
      alert('No hay texto guardado para continuar.');
      return;
    }
    isPaused = true;
    btnPause.classList.add('hidden');
    btnResume.classList.remove('hidden');
    wordsPerChunkReaderInput.value = size;
    wordsPerChunkValueReader.textContent = size;
    speedReaderInput.value = spd;
    speedValueReader.textContent = spd;
    fontSizeReaderInput.value = fs;
    fontSizeValueReader.textContent = fs;
    fontFamilyReaderSelect.value = progress.fontFamily || defaultFontFamily;
    applyReaderFontSize(String(fs));
    applyReaderFontFamily(progress.fontFamily || defaultFontFamily);
    readerWord.classList.remove('text-amber-600', 'dark:text-amber-400');
    buildTextPreview();
    refreshReaderDisplay();
    updateContinueButtonVisibility();
    function showReaderForContinue() {
      inputSection.classList.add('hidden');
      inputSection.style.opacity = '';
      readerSection.classList.remove('hidden');
      if (typeof gsap !== 'undefined') {
        gsap.fromTo(readerSection, { opacity: 0 }, { opacity: 1, duration: 0.75, ease: 'power2.out' });
      }
    }
    if (typeof gsap !== 'undefined') {
      gsap.to(inputSection, {
        opacity: 0,
        duration: 0.55,
        ease: 'power2.in',
        onComplete: showReaderForContinue
      });
    } else {
      showReaderForContinue();
    }
  }

  wordsPerChunkInput.addEventListener('input', function () {
    wordsPerChunkValue.textContent = wordsPerChunkInput.value;
  });

  speedInput.addEventListener('input', function () {
    speedValue.textContent = speedInput.value;
  });

  textInput.addEventListener('paste', function (e) {
    var pasted = (e.clipboardData || window.clipboardData).getData('text');
    if (pasted) {
      var normalized = normalizeSpacedText(pasted);
      if (normalized !== pasted) {
        e.preventDefault();
        var ta = textInput;
        var start = ta.selectionStart;
        var end = ta.selectionEnd;
        var val = ta.value;
        ta.value = val.slice(0, start) + normalized + val.slice(end);
        ta.selectionStart = ta.selectionEnd = start + normalized.length;
      }
    }
  });

  if (textInput) {
    textInput.addEventListener('input', function () {
      if (draftSaveTimeout) clearTimeout(draftSaveTimeout);
      draftSaveTimeout = setTimeout(saveDraft, 500);
    });
  }

  var btnClearText = document.getElementById('btnClearText');
  if (btnClearText && textInput) {
    btnClearText.addEventListener('click', function () {
      textInput.value = '';
      saveDraft();
      textInput.focus();
    });
  }

  fontSizeInput.addEventListener('input', function () {
    fontSizeValue.textContent = fontSizeInput.value;
    if (!readerSection.classList.contains('hidden')) {
      fontSizeReaderInput.value = fontSizeInput.value;
      fontSizeValueReader.textContent = fontSizeInput.value;
      applyReaderFontSize(fontSizeInput.value);
    }
  });

  fontSizeReaderInput.addEventListener('input', function () {
    fontSizeValueReader.textContent = fontSizeReaderInput.value;
    if (readerSection.classList.contains('hidden')) return;
    applyReaderFontSize(fontSizeReaderInput.value);
  });

  fontFamilySelect.addEventListener('change', function () {
    updateFontPreview();
    if (!readerSection.classList.contains('hidden')) {
      fontFamilyReaderSelect.value = fontFamilySelect.value;
      applyReaderFontFamily(fontFamilySelect.value);
    }
  });

  if (fontPreview) updateFontPreview();

  fontFamilyReaderSelect.addEventListener('change', function () {
    if (readerSection.classList.contains('hidden')) return;
    applyReaderFontFamily(fontFamilyReaderSelect.value);
  });

  wordsPerChunkReaderInput.addEventListener('input', function () {
    wordsPerChunkValueReader.textContent = wordsPerChunkReaderInput.value;
    if (readerSection.classList.contains('hidden') || words.length === 0) return;
    applyWordsPerChunkChange();
  });

  speedReaderInput.addEventListener('input', function () {
    speedValueReader.textContent = speedReaderInput.value;
    if (readerSection.classList.contains('hidden')) return;
    applySpeedChange();
  });

  btnStart.addEventListener('click', startReading);
  btnPause.addEventListener('click', pauseReading);
  btnResume.addEventListener('click', resumeReading);
  btnStop.addEventListener('click', stopReading);
  if (btnTogglePreview && readerPreviewWrap) {
    btnTogglePreview.addEventListener('click', function () {
      var collapsed = readerPreviewWrap.classList.toggle('reader-preview-collapsed');
      btnTogglePreview.setAttribute('aria-expanded', !collapsed);
      btnTogglePreview.setAttribute('title', collapsed ? 'Mostrar vista previa' : 'Ocultar vista previa');
    });
  }
  if (btnContinue) btnContinue.addEventListener('click', startFromSavedProgress);
  updateContinueButtonVisibility();

  document.addEventListener('keydown', function (e) {
    if (e.code !== 'Space' && e.key !== ' ') return;
    if (readerSection.classList.contains('hidden')) return;
    if (chunks.length === 0) return;
    e.preventDefault();
    if (isPaused) {
      resumeReading();
    } else {
      pauseReading();
    }
  });

  var themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    function syncSunlitTheme() {
      var isDark = document.documentElement.classList.contains('dark');
      document.body.classList.toggle('dark', isDark);
    }
    function applyTheme(isDark, enableAnimation) {
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      if (enableAnimation) document.body.classList.add('animation-ready');
      syncSunlitTheme();
      try { localStorage.setItem('reader-theme', isDark ? 'dark' : 'light'); } catch (err) {}
    }
    function isDarkTheme() {
      return document.documentElement.classList.contains('dark');
    }
    themeToggle.addEventListener('click', function () {
      document.body.classList.add('animation-ready');
      applyTheme(!isDarkTheme(), true);
    });
    var themeToggleReader = document.getElementById('themeToggleReader');
    if (themeToggleReader) {
      themeToggleReader.addEventListener('click', function () {
        themeToggle.click();
      });
    }
    (function initTheme() {
      try {
        var saved = localStorage.getItem('reader-theme');
        if (saved === 'light') applyTheme(false, false);
        else if (saved === 'dark') applyTheme(true, false);
      } catch (err) {}
      syncSunlitTheme();
    })();
  }

  (function initStartScreen() {
    var startScreen = document.getElementById('startScreen');
    var mainApp = document.getElementById('mainApp');
    var enterBtn = document.getElementById('startScreenEnter');
    var headerLogo = document.getElementById('appHeaderLogo');
    if (!startScreen || !mainApp) return;
    try {
      if (sessionStorage.getItem('reader-start-seen')) {
        startScreen.style.display = 'none';
        mainApp.classList.remove('main-app-hidden');
      }
    } catch (err) {}
    function enter() {
      if (typeof gsap !== 'undefined') {
        gsap.to(startScreen, {
          opacity: 0,
          duration: 0.65,
          ease: 'power2.in',
          onComplete: function () {
            startScreen.style.display = 'none';
            startScreen.style.opacity = '';
            mainApp.classList.remove('main-app-hidden');
            mainApp.style.opacity = '0';
            gsap.to(mainApp, { opacity: 1, duration: 0.75, ease: 'power2.out' });
            try { sessionStorage.setItem('reader-start-seen', '1'); } catch (e) {}
          }
        });
      } else {
        startScreen.style.display = 'none';
        mainApp.classList.remove('main-app-hidden');
        try { sessionStorage.setItem('reader-start-seen', '1'); } catch (e) {}
      }
    }
    function goToStartScreen() {
      if (typeof gsap !== 'undefined') {
        gsap.to(mainApp, {
          opacity: 0,
          duration: 0.55,
          ease: 'power2.in',
          onComplete: function () {
            mainApp.classList.add('main-app-hidden');
            mainApp.style.opacity = '';
            startScreen.style.display = 'flex';
            startScreen.style.opacity = '0';
            gsap.to(startScreen, { opacity: 1, duration: 0.65, ease: 'power2.out' });
          }
        });
      } else {
        startScreen.style.display = 'flex';
        mainApp.classList.add('main-app-hidden');
      }
    }
    if (enterBtn) enterBtn.addEventListener('click', enter);
    if (headerLogo) {
      headerLogo.addEventListener('click', goToStartScreen);
      headerLogo.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          goToStartScreen();
        }
      });
    }
    var readerHomeBtn = document.getElementById('readerHomeBtn');
    if (readerHomeBtn) {
      readerHomeBtn.addEventListener('click', function () {
        stopReading();
        goToStartScreen();
      });
    }
  })();

  loadDraft();
})();
