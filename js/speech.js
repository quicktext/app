
// ============================================================
// QuickText Voice Pro - Module Vocal Premium
// Optimisé pour mobile - Anti-doublons - Haute performance
// ============================================================

const SpeechModule = (function() {
    'use strict';
    
    // ============================================================
    // CONFIGURATION
    // ============================================================
    const CONFIG = {
        // Seuils de détection
        MIN_CONFIDENCE: 0.6,
        MAX_INTERIM_LENGTH: 500,
        DUPLICATE_WINDOW: 100,
        MIN_FINAL_LENGTH: 2,
        
        // Reconnaissance
        RECOGNITION_TIMEOUT: 60000, // 60 secondes max
        RESTART_DELAY: 500,
        MAX_RESTARTS: 3,
        
        // Audio
        ECHO_CANCELLATION: true,
        NOISE_SUPPRESSION: true,
        AUTO_GAIN_CONTROL: true
    };
    
    // ============================================================
    // ÉTAT INTERNE
    // ============================================================
    let state = {
        recognition: null,
        isRecording: false,
        isSpeaking: false,
        isPaused: false,
        
        // Buffer anti-doublons
        history: [],           // Historique des phrases finales
        lastFinals: [],        // Derniers textes finaux pour comparaison
        phraseBuffer: '',      // Buffer de la phrase en cours
        restartCount: 0,       // Compteur de redémarrages
        silenceTimer: null,    // Timer de silence
        lastResultTime: 0,     // Timestamp du dernier résultat
        
        // Synthèse vocale
        currentUtterance: null,
        textSegments: [],
        currentPlayIndex: 0,
        voicesLoaded: false,
        availableVoices: []
    };
    
    // ============================================================
    // INITIALISATION DES VOIX
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
    
    // Initialiser les voix au chargement
    loadVoices();
    
    // ============================================================
    // FONCTIONS ANTI-DOUBLONS
    // ============================================================
    
    /**
     * Vérifie si un texte est un doublon d'un texte existant
     */
    function isDuplicate(newText, existingTexts) {
        if (!newText || newText.length < CONFIG.MIN_FINAL_LENGTH) return true;
        
        const cleanNew = cleanText(newText);
        if (!cleanNew) return true;
        
        // Vérifier dans les derniers textes
        for (let i = 0; i < existingTexts.length; i++) {
            const cleanExisting = cleanText(existingTexts[i]);
            
            // Correspondance exacte
            if (cleanNew === cleanExisting) return true;
            
            // Le nouveau texte est inclus dans l'existant (doublon partiel)
            if (cleanExisting.includes(cleanNew)) return true;
            
            // L'existant est inclus dans le nouveau (répétition avec ajout)
            if (cleanNew.includes(cleanExisting) && 
                cleanNew.length <= cleanExisting.length * 1.5) {
                return true;
            }
            
            // Vérification par mots (80% de similarité)
            const newWords = cleanNew.split(/\s+/);
            const existingWords = cleanExisting.split(/\s+/);
            
            if (newWords.length >= 2 && existingWords.length >= 2) {
                const matchCount = newWords.filter(w => existingWords.includes(w)).length;
                const similarity = matchCount / Math.max(newWords.length, existingWords.length);
                
                if (similarity > 0.8 && 
                    Math.abs(newWords.length - existingWords.length) <= 3) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    /**
     * Vérifie si un texte intermédiaire contient des répétitions de mots
     */
    function cleanInterim(text) {
        if (!text) return '';
        
        // Nettoyer le texte
        let cleaned = text.trim();
        
        // Détecter les répétitions de mots consécutifs
        const words = cleaned.split(/\s+/);
        if (words.length > 3) {
            const cleanedWords = [];
            let lastWord = '';
            let repeatCount = 0;
            
            for (let i = 0; i < words.length; i++) {
                const word = words[i].toLowerCase();
                
                if (word === lastWord) {
                    repeatCount++;
                    // Si le mot est répété plus de 2 fois, l'ignorer
                    if (repeatCount <= 2) {
                        cleanedWords.push(words[i]);
                    }
                } else {
                    repeatCount = 0;
                    cleanedWords.push(words[i]);
                }
                
                lastWord = word;
            }
            
            // Détecter les motifs répétitifs (groupes de mots)
            let result = cleanedWords.join(' ');
            
            // Chercher des séquences de 2-3 mots qui se répètent
            const resultWords = result.split(/\s+/);
            if (resultWords.length > 6) {
                let hasPattern = true;
                while (hasPattern && resultWords.length > 3) {
                    hasPattern = false;
                    
                    for (let i = 0; i < resultWords.length - 3; i++) {
                        const seq1 = resultWords.slice(i, i + 3).join(' ').toLowerCase();
                        const seq2 = resultWords.slice(i + 3, i + 6).join(' ').toLowerCase();
                        
                        if (seq1 === seq2 && seq1.length > 5) {
                            // Supprimer la répétition
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
    
    /**
     * Nettoie le texte final (ponctuation, espaces)
     */
    function cleanText(text) {
        if (!text) return '';
        
        return text
            .trim()
            .replace(/\s+/g, ' ')
            .replace(/\s+([.,!?;:])/g, '$1')
            .replace(/([.,!?;:])([^\s\d])/g, '$1 $2')
            .toLowerCase()
            .replace(/[^a-zà-ÿ0-9\s.,!?;:'-]/g, '');
    }
    
    /**
     * Formate le texte final pour l'affichage
     */
    function formatFinal(text) {
        if (!text) return '';
        
        let formatted = text.trim();
        
        // Mettre une majuscule en début de phrase
        if (formatted.length > 0) {
            formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
        }
        
        // Ajouter un point si pas de ponctuation finale
        if (!/[.!?]$/.test(formatted.trim())) {
            formatted = formatted.trim() + '.';
        }
        
        // Ajouter un espace après
        if (!formatted.endsWith(' ')) {
            formatted += ' ';
        }
        
        return formatted;
    }
    
    // ============================================================
    // GESTION DE LA RECONNAISSANCE
    // ============================================================
    
    /**
     * Crée l'instance de reconnaissance vocale
     */
    function createRecognition(lang) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return null;
        
        const recognition = new SpeechRecognition();
        
        // Configuration optimale pour mobile
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = lang;
        recognition.maxAlternatives = 1;
        
        return recognition;
    }
    
    /**
     * Configure les événements de la reconnaissance
     */
    function setupRecognitionEvents(recognition, lang, onResult, onError) {
        
        recognition.onstart = () => {
            console.log('🎤 Reconnaissance démarrée');
            state.isRecording = true;
            state.restartCount = 0;
            state.lastResultTime = Date.now();
            state.phraseBuffer = '';
        };
        
        recognition.onresult = (event) => {
            state.lastResultTime = Date.now();
            
            // Réinitialiser le timer de silence
            resetSilenceTimer(recognition, lang, onResult, onError);
            
            let finalText = '';
            let interimText = '';
            
            // Traiter chaque résultat
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                const transcript = result[0].transcript;
                const confidence = result[0].confidence || 1.0;
                
                if (result.isFinal) {
                    // Vérifier la confiance minimale
                    if (confidence >= CONFIG.MIN_CONFIDENCE) {
                        // Nettoyer et formater
                        const formatted = formatFinal(transcript);
                        
                        // Vérifier les doublons
                        if (!isDuplicate(formatted, state.lastFinals)) {
                            finalText += formatted;
                            
                            // Ajouter à l'historique
                            state.lastFinals.push(formatted);
                            
                            // Limiter la taille de l'historique
                            if (state.lastFinals.length > 20) {
                                state.lastFinals = state.lastFinals.slice(-10);
                            }
                        }
                    }
                } else {
                    // Texte intermédiaire
                    const cleaned = cleanInterim(transcript);
                    
                    // Limiter la longueur de l'interim
                    if (cleaned.length <= CONFIG.MAX_INTERIM_LENGTH) {
                        interimText = cleaned;
                    } else {
                        interimText = cleaned.substring(0, CONFIG.MAX_INTERIM_LENGTH);
                    }
                }
            }
            
            // Appeler le callback
            if (onResult && (finalText || interimText)) {
                onResult(finalText, interimText);
            }
        };
        
        recognition.onerror = (event) => {
            console.error('❌ Erreur reconnaissance:', event.error);
            clearSilenceTimer();
            
            switch (event.error) {
                case 'no-speech':
                    // Redémarrer automatiquement
                    if (state.isRecording && state.restartCount < CONFIG.MAX_RESTARTS) {
                        state.restartCount++;
                        console.log('🔄 Redémarrage automatique (' + state.restartCount + '/' + CONFIG.MAX_RESTARTS + ')');
                        
                        setTimeout(() => {
                            if (state.isRecording) {
                                try {
                                    recognition.start();
                                } catch (e) {
                                    console.warn('Impossible de redémarrer');
                                }
                            }
                        }, CONFIG.RESTART_DELAY);
                    }
                    break;
                    
                case 'aborted':
                    // Arrêt normal ou redémarrage
                    break;
                    
                case 'not-allowed':
                    if (onError) onError('Microphone non autorisé');
                    state.isRecording = false;
                    break;
                    
                case 'audio-capture':
                    if (onError) onError('Microphone indisponible');
                    break;
                    
                case 'network':
                    if (onError) onError('Erreur réseau');
                    break;
                    
                default:
                    // Tenter un redémarrage pour les autres erreurs
                    if (state.isRecording && state.restartCount < CONFIG.MAX_RESTARTS) {
                        state.restartCount++;
                        setTimeout(() => {
                            if (state.isRecording) {
                                try {
                                    recognition.start();
                                } catch (e) {}
                            }
                        }, CONFIG.RESTART_DELAY * 2);
                    }
            }
        };
        
        recognition.onend = () => {
            console.log('Reconnaissance terminée');
            clearSilenceTimer();
            
            // Redémarrer si toujours en enregistrement
            if (state.isRecording && state.restartCount < CONFIG.MAX_RESTARTS) {
                state.restartCount++;
                console.log('🔄 Redémarrage après fin (' + state.restartCount + ')');
                
                setTimeout(() => {
                    if (state.isRecording) {
                        try {
                            recognition.start();
                        } catch (e) {
                            state.isRecording = false;
                        }
                    }
                }, CONFIG.RESTART_DELAY);
            } else if (state.isRecording) {
                state.isRecording = false;
                if (onError) onError('Reconnaissance arrêtée après plusieurs tentatives');
            }
        };
        
        return recognition;
    }
    
    /**
     * Gestion du timer de silence
     */
    function resetSilenceTimer(recognition, lang, onResult, onError) {
        clearSilenceTimer();
        
        state.silenceTimer = setTimeout(() => {
            const silenceDuration = Date.now() - state.lastResultTime;
            
            if (silenceDuration >= CONFIG.RECOGNITION_TIMEOUT) {
                console.log('⏰ Timeout de silence atteint');
                
                // Redémarrer la reconnaissance
                if (state.isRecording) {
                    try {
                        recognition.stop();
                    } catch (e) {}
                    
                    setTimeout(() => {
                        if (state.isRecording) {
                            try {
                                recognition.start();
                                state.lastResultTime = Date.now();
                            } catch (e) {
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
    
    // ============================================================
    // API PUBLIQUE - RECONNAISSANCE
    // ============================================================
    
    /**
     * Vérifie la permission microphone
     */
    async function checkMicrophonePermission() {
        // Vérifier avec l'API Permissions
        if (navigator.permissions && navigator.permissions.query) {
            try {
                const result = await navigator.permissions.query({ name: 'microphone' });
                
                if (result.state === 'denied') {
                    throw new Error(
                        'Permission microphone bloquée.\n\n' +
                        'Pour autoriser :\n' +
                        '• iPhone : Réglages > Safari > Microphone\n' +
                        '• Android : Paramètres > Applications > Chrome > Microphone'
                    );
                }
            } catch (e) {
                // API Permissions non supportée, on continue
            }
        }
        
        // Tester l'accès au microphone
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: CONFIG.ECHO_CANCELLATION,
                    noiseSuppression: CONFIG.NOISE_SUPPRESSION,
                    autoGainControl: CONFIG.AUTO_GAIN_CONTROL
                }
            });
            
            // Arrêter le stream de test
            stream.getTracks().forEach(track => track.stop());
            
            return true;
            
        } catch (e) {
            if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
                throw new Error('Permission microphone refusée');
            } else if (e.name === 'NotFoundError') {
                throw new Error('Aucun microphone détecté');
            }
            throw e;
        }
    }
    
    /**
     * Démarre la reconnaissance vocale
     */
    async function startRecognition(lang, onResult, onError) {
        // Vérifier la permission
        await checkMicrophonePermission();
        
        // Créer la reconnaissance
        const recognition = createRecognition(lang);
        if (!recognition) {
            throw new Error('Reconnaissance vocale non supportée');
        }
        
        // Réinitialiser l'état
        state.lastFinals = [];
        state.history = [];
        state.phraseBuffer = '';
        state.restartCount = 0;
        
        // Configurer les événements
        setupRecognitionEvents(recognition, lang, onResult, onError);
        
        // Démarrer
        try {
            recognition.start();
            state.recognition = recognition;
            state.isRecording = true;
            console.log('✅ Reconnaissance démarrée avec succès');
        } catch (e) {
            console.error('Erreur démarrage:', e);
            throw new Error('Impossible de démarrer la reconnaissance');
        }
    }
    
    /**
     * Arrête la reconnaissance vocale
     */
    function stopRecognition() {
        clearSilenceTimer();
        
        if (state.recognition) {
            try {
                state.recognition.stop();
            } catch (e) {
                // Ignorer les erreurs d'arrêt
            }
            state.recognition = null;
        }
        
        state.isRecording = false;
        state.restartCount = 0;
        state.lastFinals = [];
        console.log('⏹ Reconnaissance arrêtée');
    }
    
    /**
     * Vérifie si la reconnaissance est en cours
     */
    function isRecognitionActive() {
        return state.isRecording && state.recognition !== null;
    }
    
    // ============================================================
    // API PUBLIQUE - SYNTHÈSE VOCALE
    // ============================================================
    
    /**
     * Trouve la meilleure voix pour une langue
     */
    function getBestVoice(lang) {
        if (!state.availableVoices || state.availableVoices.length === 0) {
            loadVoices();
        }
        
        const voices = state.availableVoices;
        if (!voices.length) return null;
        
        const langPrefix = lang.split('-')[0];
        
        // Voix préférées par langue
        const preferredVoices = {
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
        
        const prefs = preferredVoices[langPrefix] || [];
        
        // Chercher une voix préférée
        for (const pref of prefs) {
            const voice = voices.find(v => 
                v.lang.indexOf(langPrefix) === 0 && v.name.includes(pref)
            );
            if (voice) return voice;
        }
        
        // Fallback : première voix de la langue
        const fallback = voices.find(v => v.lang.indexOf(langPrefix) === 0);
        if (fallback) return fallback;
        
        // Dernier recours : voix par défaut
        return voices[0];
    }
    
    /**
     * Lit un texte à voix haute
     */
    function speak(text, lang, rate) {
        stopSpeaking();
        
        if (!text || !text.trim()) {
            console.warn('Aucun texte à lire');
            return;
        }
        
        // Nettoyer le texte pour la lecture
        const cleanText = text
            .replace(/\s+/g, ' ')
            .replace(/\n+/g, ' ')
            .trim();
        
        // Découper en phrases
        const segments = cleanText.split(/(?<=[.!?;:])\s+/)
            .filter(s => s.trim().length > 0);
        
        if (segments.length === 0) {
            segments.push(cleanText);
        }
        
        state.textSegments = segments;
        state.currentPlayIndex = 0;
        state.isPaused = false;
        state.isSpeaking = false;
        
        // Démarrer la lecture
        speakNextSegment(lang, parseFloat(rate) || 1.0);
    }
    
    /**
     * Lit le segment suivant
     */
    function speakNextSegment(lang, rate) {
        if (!state.isSpeaking && !state.isPaused && state.currentPlayIndex > 0) {
            return;
        }
        
        if (state.currentPlayIndex >= state.textSegments.length) {
            state.isSpeaking = false;
            state.currentUtterance = null;
            if (SpeechModule.onFinish) SpeechModule.onFinish();
            return;
        }
        
        if (state.isPaused) return;
        
        const segment = state.textSegments[state.currentPlayIndex];
        if (!segment || !segment.trim()) {
            state.currentPlayIndex++;
            speakNextSegment(lang, rate);
            return;
        }
        
        // Nettoyer l'utterance précédente
        if (state.currentUtterance) {
            state.currentUtterance.onend = null;
            state.currentUtterance.onerror = null;
        }
        
        const utterance = new SpeechSynthesisUtterance(segment);
        utterance.lang = lang;
        utterance.rate = rate;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        
        // Chercher la meilleure voix
        const voice = getBestVoice(lang);
        if (voice) {
            utterance.voice = voice;
        }
        
        let hasEnded = false;
        
        utterance.onstart = () => {
            state.isSpeaking = true;
            state.isPaused = false;
            if (SpeechModule.onStart) SpeechModule.onStart();
        };
        
        utterance.onend = () => {
            if (hasEnded) return;
            hasEnded = true;
            state.currentPlayIndex++;
            if (!state.isPaused) {
                speakNextSegment(lang, rate);
            }
        };
        
        utterance.onerror = (e) => {
            if (hasEnded) return;
            hasEnded = true;
            
            if (e.error === 'interrupted' || e.error === 'canceled') {
                return;
            }
            
            // Continuer malgré l'erreur
            if (!state.isPaused) {
                state.currentPlayIndex++;
                speakNextSegment(lang, rate);
            }
        };
        
        state.currentUtterance = utterance;
        
        try {
            speechSynthesis.speak(utterance);
        } catch (e) {
            console.warn('Erreur synthèse:', e);
            state.currentPlayIndex++;
            speakNextSegment(lang, rate);
        }
    }
    
    /**
     * Met en pause la lecture
     */
    function pauseSpeaking() {
        if (state.isSpeaking && !state.isPaused) {
            speechSynthesis.pause();
            state.isPaused = true;
            state.isSpeaking = false;
            if (SpeechModule.onPause) SpeechModule.onPause();
        }
    }
    
    /**
     * Reprend la lecture
     */
    function resumeSpeaking() {
        if (state.isPaused) {
            speechSynthesis.resume();
            state.isPaused = false;
            state.isSpeaking = true;
            if (SpeechModule.onResume) SpeechModule.onResume();
        }
    }
    
    /**
     * Arrête la lecture
     */
    function stopSpeaking() {
        if (state.currentUtterance) {
            state.currentUtterance.onend = null;
            state.currentUtterance.onerror = null;
        }
        
        speechSynthesis.cancel();
        
        state.currentUtterance = null;
        state.isSpeaking = false;
        state.isPaused = false;
        state.textSegments = [];
        state.currentPlayIndex = 0;
        
        if (SpeechModule.onStop) SpeechModule.onStop();
    }
    
    // ============================================================
    // API PUBLIQUE
    // ============================================================
    
    return {
        // Reconnaissance
        startRecognition,
        stopRecognition,
        isRecognitionActive,
        get isRecording() { return state.isRecording; },
        
        // Synthèse
        speak,
        pauseSpeaking,
        resumeSpeaking,
        stopSpeaking,
        get isSpeaking() { return state.isSpeaking; },
        get isPaused() { return state.isPaused; },
        
        // Callbacks
        onStart: null,
        onPause: null,
        onResume: null,
        onStop: null,
        onFinish: null
    };
    
})();