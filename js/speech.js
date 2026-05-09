// ============================================================
// QuickText Voice Pro - Module Vocal Premium
// Correction bugs mobile : dictée fragments + pause/reprise lecture
// ============================================================

const SpeechModule = (function() {
    'use strict';

    const CONFIG = {
        MIN_CONFIDENCE: 0.6,
        MAX_INTERIM_LENGTH: 500,
        MIN_FINAL_LENGTH: 2,
        RECOGNITION_TIMEOUT: 60000,
        RESTART_DELAY: 500,
        MAX_RESTARTS: 3,
        ECHO_CANCELLATION: true,
        NOISE_SUPPRESSION: true,
        AUTO_GAIN_CONTROL: true
    };

    let state = {
        // Reconnaissance
        recognition: null,
        isRecording: false,
        restartCount: 0,
        silenceTimer: null,
        lastResultTime: 0,
        manualStop: false,

        // Synthèse vocale
        isSpeaking: false,
        isPaused: false,
        textSegments: [],
        currentSegmentIndex: 0,
        currentSegmentCharOffset: 0,
        currentLang: '',
        currentRate: 1.0,
        availableVoices: [],
        voicesLoaded: false,
        visibilityHandler: null,

        // Buffer anti‑fragments mobile
        finalSegments: []   // liste des segments formatés (avec ponctuation)
    };

    // ============================================================
    // INIT VOIX
    // ============================================================
    function loadVoices() {
        if (typeof speechSynthesis === 'undefined') return;
        state.availableVoices = speechSynthesis.getVoices();
        state.voicesLoaded = state.availableVoices.length > 0;
        if (!state.voicesLoaded) {
            speechSynthesis.onvoiceschanged = () => {
                state.availableVoices = speechSynthesis.getVoices();
                state.voicesLoaded = true;
            };
        }
    }
    loadVoices();

    // ============================================================
    // ANTI‑DOUBLONS (fragmentation mobile)
    // ============================================================
    function normalizeForDuplicateCheck(text) {
        if (!text) return '';
        return text
            .toLowerCase()
            .replace(/[.,!?;:](\s|$)/g, ' ')   // ponctuation de fin
            .replace(/[^a-zà-ÿ0-9\s'-]/g, '') // lettres, chiffres, apostrophes
            .replace(/\s+/g, ' ')
            .trim();
    }

    function isExtensionOf(newSegment, existingSegment) {
        const normNew = normalizeForDuplicateCheck(newSegment);
        const normExist = normalizeForDuplicateCheck(existingSegment);
        return normNew.startsWith(normExist + ' ') || normNew.startsWith(normExist + '-');
    }

    function isDuplicate(newText, existingTexts) {
        if (!newText || newText.length < CONFIG.MIN_FINAL_LENGTH) return true;
        const cleanNew = normalizeForDuplicateCheck(newText);
        if (!cleanNew) return true;
        for (const existing of existingTexts) {
            const cleanExist = normalizeForDuplicateCheck(existing);
            if (cleanNew === cleanExist) return true;
            if (cleanExist.includes(cleanNew)) return true;
            if (cleanNew.includes(cleanExist) && cleanNew.length <= cleanExist.length * 1.5) return true;
            const newWords = cleanNew.split(/\s+/).filter(w => w.length > 0);
            const existWords = cleanExist.split(/\s+/).filter(w => w.length > 0);
            if (newWords.length >= 2 && existWords.length >= 2) {
                const matchCount = newWords.filter(w => existWords.includes(w)).length;
                const similarity = matchCount / Math.max(newWords.length, existWords.length);
                if (similarity > 0.8 && Math.abs(newWords.length - existWords.length) <= 3) {
                    return true;
                }
            }
        }
        return false;
    }

    function cleanInterim(text) {
        if (!text) return '';
        let cleaned = text.trim();
        const words = cleaned.split(/\s+/);
        if (words.length > 3) {
            const cleanedWords = [];
            let lastWord = '';
            let repeatCount = 0;
            for (const word of words) {
                const w = word.toLowerCase();
                if (w === lastWord) {
                    repeatCount++;
                    if (repeatCount <= 2) cleanedWords.push(word);
                } else {
                    repeatCount = 0;
                    cleanedWords.push(word);
                }
                lastWord = w;
            }
            let result = cleanedWords.join(' ');
            const resultWords = result.split(/\s+/);
            if (resultWords.length > 6) {
                let hasPattern = true;
                while (hasPattern && resultWords.length > 3) {
                    hasPattern = false;
                    for (let i = 0; i < resultWords.length - 3; i++) {
                        const seq1 = resultWords.slice(i, i + 3).join(' ').toLowerCase();
                        const seq2 = resultWords.slice(i + 3, i + 6).join(' ').toLowerCase();
                        if (seq1 === seq2 && seq1.length > 5) {
                            resultWords.splice(i + 3, 3);
                            hasPattern = true;
                            break;
                        }
                    }
                }
            }
            return resultWords.join(' ');
        }
        return cleaned;
    }

    function formatFinal(text) {
        if (!text) return '';
        let formatted = text.trim();
        if (formatted.length > 0) {
            formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
        }
        if (!/[.!?]$/.test(formatted.trim())) {
            formatted = formatted.trim() + '.';
        }
        if (!formatted.endsWith(' ')) {
            formatted += ' ';
        }
        return formatted;
    }

    /**
     * Ajoute un segment final formaté au buffer :
     * - si extension du dernier segment, le remplace
     * - sinon, ajout si pas doublon
     * Retourne true si le buffer a changé.
     */
    function addFinalSegment(formatted) {
        // Cherche si ce nouveau segment est une extension d'un existant (du plus récent au plus ancien)
        for (let i = state.finalSegments.length - 1; i >= 0; i--) {
            if (isExtensionOf(formatted, state.finalSegments[i])) {
                state.finalSegments[i] = formatted;
                return true;
            }
        }
        // Pas une extension : vérifie que ce n'est pas un doublon pur
        if (!isDuplicate(formatted, state.finalSegments)) {
            state.finalSegments.push(formatted);
            return true;
        }
        return false;
    }

    function getFullTranscript() {
        return state.finalSegments.join('');
    }

    // ============================================================
    // RECONNAISSANCE VOCALE
    // ============================================================
    function createRecognition(lang) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return null;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = lang;
        recognition.maxAlternatives = 1;
        return recognition;
    }

    function setupRecognitionEvents(recognition, onResult, onError) {
        recognition.onstart = () => {
            state.isRecording = true;
            state.restartCount = 0;
            state.lastResultTime = Date.now();
            state.manualStop = false;
        };

        recognition.onresult = (event) => {
            state.lastResultTime = Date.now();
            resetSilenceTimer(recognition, onResult, onError);
            let bufferChanged = false;
            let interimText = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                const transcript = result[0].transcript;
                const confidence = result[0].confidence || 1.0;

                if (result.isFinal) {
                    if (confidence >= CONFIG.MIN_CONFIDENCE) {
                        const formatted = formatFinal(transcript);
                        if (addFinalSegment(formatted)) {
                            bufferChanged = true;
                        }
                    }
                } else {
                    const cleaned = cleanInterim(transcript);
                    interimText = cleaned.length <= CONFIG.MAX_INTERIM_LENGTH ? cleaned : cleaned.substring(0, CONFIG.MAX_INTERIM_LENGTH);
                }
            }

            if (bufferChanged || interimText) {
                const fullText = getFullTranscript();
                if (onResult) onResult(fullText, interimText);
            }
        };

        recognition.onerror = (event) => {
            clearSilenceTimer();
            if (event.error === 'aborted') return;
            if (event.error === 'no-speech') {
                if (!state.manualStop && state.restartCount < CONFIG.MAX_RESTARTS) {
                    state.restartCount++;
                    setTimeout(() => {
                        if (state.isRecording && !state.manualStop) {
                            try { recognition.start(); } catch(e) {}
                        }
                    }, CONFIG.RESTART_DELAY);
                }
                return;
            }
            if (event.error === 'not-allowed' || event.error === 'audio-capture' || event.error === 'network') {
                if (onError) onError(event.error === 'not-allowed' ? 'Microphone non autorisé' : 'Microphone indisponible');
                state.isRecording = false;
                return;
            }
            // autres erreurs → tentative de redémarrage
            if (!state.manualStop && state.restartCount < CONFIG.MAX_RESTARTS) {
                state.restartCount++;
                setTimeout(() => {
                    if (state.isRecording && !state.manualStop) {
                        try { recognition.start(); } catch(e) {}
                    }
                }, CONFIG.RESTART_DELAY * 2);
            }
        };

        recognition.onend = () => {
            clearSilenceTimer();
            if (state.manualStop) {
                state.isRecording = false;
                return;
            }
            if (state.restartCount < CONFIG.MAX_RESTARTS) {
                state.restartCount++;
                setTimeout(() => {
                    if (state.isRecording && !state.manualStop) {
                        try { recognition.start(); } catch(e) {
                            state.isRecording = false;
                        }
                    }
                }, CONFIG.RESTART_DELAY);
            } else {
                state.isRecording = false;
                if (onError) onError('Reconnaissance arrêtée après plusieurs tentatives');
            }
        };
    }

    function resetSilenceTimer(recognition, onResult, onError) {
        clearSilenceTimer();
        state.silenceTimer = setTimeout(() => {
            const silenceDuration = Date.now() - state.lastResultTime;
            if (silenceDuration >= CONFIG.RECOGNITION_TIMEOUT) {
                if (state.isRecording) {
                    try { recognition.stop(); } catch(e) {}
                    setTimeout(() => {
                        if (state.isRecording && !state.manualStop) {
                            try {
                                recognition.start();
                                state.lastResultTime = Date.now();
                            } catch(e) {
                                state.isRecording = false;
                                if (onError) onError('Reconnaissance interrompue');
                            }
                        }
                    }, CONFIG.RESTART_DELAY);
                }
            }
        }, CONFIG.RECOGNITION_TIMEOUT);
    }

    function clearSilenceTimer() {
        if (state.silenceTimer) {
            clearTimeout(state.silenceTimer);
            state.silenceTimer = null;
        }
    }

    function handleVisibilityChange() {
        if (document.hidden && state.isRecording) {
            console.log('Arrière‑plan → arrêt reconnaissance');
            stopRecognition();
            if (SpeechModule.onError) SpeechModule.onError('Enregistrement interrompu (onglet caché)');
        }
    }

    // ============================================================
    // API PERMISSION ET START/STOP
    // ============================================================
    async function checkMicrophonePermission() {
        if (navigator.permissions && navigator.permissions.query) {
            try {
                const result = await navigator.permissions.query({ name: 'microphone' });
                if (result.state === 'denied') {
                    throw new Error('Permission microphone bloquée. Veuillez l\'autoriser.');
                }
            } catch(e) {}
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: CONFIG.ECHO_CANCELLATION,
                    noiseSuppression: CONFIG.NOISE_SUPPRESSION,
                    autoGainControl: CONFIG.AUTO_GAIN_CONTROL
                }
            });
            stream.getTracks().forEach(t => t.stop());
            return true;
        } catch(e) {
            if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
                throw new Error('Permission microphone refusée');
            } else if (e.name === 'NotFoundError') {
                throw new Error('Aucun microphone détecté');
            }
            throw e;
        }
    }

    async function startRecognition(lang, onResult, onError) {
        await checkMicrophonePermission();
        const recognition = createRecognition(lang);
        if (!recognition) throw new Error('Reconnaissance vocale non supportée');

        state.finalSegments = [];
        state.restartCount = 0;
        state.manualStop = false;

        setupRecognitionEvents(recognition, onResult, onError);

        if (state.visibilityHandler) {
            document.removeEventListener('visibilitychange', state.visibilityHandler);
        }
        state.visibilityHandler = handleVisibilityChange;
        document.addEventListener('visibilitychange', state.visibilityHandler);

        try {
            recognition.start();
            state.recognition = recognition;
            state.isRecording = true;
        } catch(e) {
            document.removeEventListener('visibilitychange', state.visibilityHandler);
            state.visibilityHandler = null;
            throw new Error('Impossible de démarrer la reconnaissance');
        }
    }

    function stopRecognition() {
        clearSilenceTimer();
        state.manualStop = true;
        if (state.recognition) {
            try { state.recognition.abort(); } catch(e) {}
            state.recognition = null;
        }
        state.isRecording = false;
        state.restartCount = 0;
        if (state.visibilityHandler) {
            document.removeEventListener('visibilitychange', state.visibilityHandler);
            state.visibilityHandler = null;
        }
    }

    function isRecognitionActive() {
        return state.isRecording && state.recognition !== null;
    }

    // ============================================================
    // SYNTHÈSE VOCALE (pause/reprise par annulation + reprise)
    // ============================================================
    function getBestVoice(lang) {
        if (!state.availableVoices.length) loadVoices();
        const voices = state.availableVoices;
        if (!voices.length) return null;
        const langPrefix = lang.split('-')[0];
        const prefs = {
            'fr': ['Google français', 'Microsoft Hortense', 'Amélie', 'Thomas', 'French'],
            'en': ['Google US English', 'Microsoft David', 'Samantha', 'Alex', 'English'],
            'es': ['Google español', 'Microsoft Helena', 'Spanish'],
            'de': ['Google Deutsch', 'Microsoft Hedda', 'German'],
            'it': ['Google italiano', 'Microsoft Elsa', 'Italian'],
            'pt': ['Google português', 'Microsoft Maria', 'Portuguese'],
            'ru': ['Google русский', 'Russian'],
            'ja': ['Google 日本語', 'Microsoft Ayumi', 'Japanese'],
            'zh': ['Google 中文', 'Microsoft Huihui', 'Chinese']
        };
        const preferred = prefs[langPrefix] || [];
        for (const p of preferred) {
            const voice = voices.find(v => v.lang.indexOf(langPrefix) === 0 && v.name.includes(p));
            if (voice) return voice;
        }
        const fallback = voices.find(v => v.lang.indexOf(langPrefix) === 0);
        return fallback || voices[0];
    }

    function speak(text, lang, rate) {
        stopSpeaking();
        if (!text || !text.trim()) return;
        const clean = text.replace(/\s+/g, ' ').replace(/\n+/g, ' ').trim();
        const segments = clean.split(/(?<=[.!?;:])\s+/).filter(s => s.trim().length > 0);
        if (!segments.length) segments.push(clean);
        state.textSegments = segments;
        state.currentSegmentIndex = 0;
        state.currentSegmentCharOffset = 0;
        state.currentLang = lang;
        state.currentRate = parseFloat(rate) || 1.0;
        state.isPaused = false;
        state.isSpeaking = false;
        speakNextSegment();
    }

    function speakNextSegment() {
        if (state.isPaused) return;
        if (state.currentSegmentIndex >= state.textSegments.length) {
            state.isSpeaking = false;
            if (SpeechModule.onFinish) SpeechModule.onFinish();
            return;
        }
        let segment = state.textSegments[state.currentSegmentIndex];
        if (state.currentSegmentCharOffset > 0) {
            segment = segment.substring(state.currentSegmentCharOffset);
        }
        if (!segment.trim()) {
            state.currentSegmentIndex++;
            state.currentSegmentCharOffset = 0;
            speakNextSegment();
            return;
        }

        const utterance = new SpeechSynthesisUtterance(segment);
        utterance.lang = state.currentLang;
        utterance.rate = Math.min(state.currentRate, 0.95);
        utterance.pitch = 0.9;
        utterance.volume = 1.0;
        const voice = getBestVoice(state.currentLang);
        if (voice) utterance.voice = voice;

        utterance.onboundary = (event) => {
            if (event.name === 'word' || event.name === 'sentence') {
                state.currentSegmentCharOffset = (state.currentSegmentCharOffset || 0) + event.charIndex;
            }
        };
        utterance.onstart = () => {
            state.isSpeaking = true;
            state.isPaused = false;
            if (SpeechModule.onStart) SpeechModule.onStart();
        };
        utterance.onend = () => {
            if (state.isPaused) return;
            state.currentSegmentIndex++;
            state.currentSegmentCharOffset = 0;
            speakNextSegment();
        };
        utterance.onerror = (e) => {
            if (state.isPaused) return;
            if (e.error === 'interrupted' || e.error === 'canceled') return;
            state.currentSegmentIndex++;
            state.currentSegmentCharOffset = 0;
            speakNextSegment();
        };

        speechSynthesis.speak(utterance);
    }

    function pauseSpeaking() {
        if (!state.isSpeaking || state.isPaused) return;
        speechSynthesis.cancel();       // Annule et mémorise la position grâce à onboundary
        state.isPaused = true;
        state.isSpeaking = false;
        if (SpeechModule.onPause) SpeechModule.onPause();
    }

    function resumeSpeaking() {
        if (!state.isPaused) return;
        state.isPaused = false;
        // Repart au segment courant avec l'offset sauvegardé
        speakNextSegment();
        if (SpeechModule.onResume) SpeechModule.onResume();
    }

    function stopSpeaking() {
        speechSynthesis.cancel();
        state.isSpeaking = false;
        state.isPaused = false;
        state.textSegments = [];
        state.currentSegmentIndex = 0;
        state.currentSegmentCharOffset = 0;
        if (SpeechModule.onStop) SpeechModule.onStop();
    }

    // ============================================================
    // EXPORT
    // ============================================================
    return {
        startRecognition,
        stopRecognition,
        isRecognitionActive,
        get isRecording() { return state.isRecording; },
        speak,
        pauseSpeaking,
        resumeSpeaking,
        stopSpeaking,
        get isSpeaking() { return state.isSpeaking; },
        get isPaused() { return state.isPaused; },
        onStart: null,
        onPause: null,
        onResume: null,
        onStop: null,
        onFinish: null,
        onError: null
    };
})();