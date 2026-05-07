// QuickText Voice Pro - Application Principale
// Version finale - Export PDF+TXT avec titre personnalisable

(function() {
    'use strict';
    
    const state = {
        fullTranscript: '',
        translatedText: '',
        isProcessingIA: false,
        currentLang: 'fr-FR',
        speechRate: '1.0',
        selectedAction: 'formatting',
        _lastInterimText: ''
    };
    
    const DOM = {};
    
    async function init() {
        cacheDOM();
        loadPreferences();
        setupEvents();
        setupPWA();
        loadVoices();
        
        // Initialiser le module de crédits
        await CreditModule.init();

        // Initialiser le module de crédits
        if (typeof CreditModule !== 'undefined') {
            await CreditModule.init();
            updateCreditsDisplay();
        }

        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) loadingScreen.classList.add('hidden');
        
        const app = document.getElementById('app');
        if (app) app.style.display = 'flex';
        
        console.log('QuickText Voice Pro - Prêt');
    }
    
    function cacheDOM() {
        const ids = [
            'output', 'recordBtn', 'translateBtn', 'playBtn', 'iaBtn',
            'copyBtn', 'clearBtn', 'exportBtn', 'importPdfBtn', 'pdfFileInput',
            'langSelect', 'speedSelect', 'actionSelect',
            'apiKeyInput', 'apiKeyToggle',
            'modeIndicator', 'progressBar', 'progressFill',
            'formatInfo', 'installBtn',
            'creditsBadge', 'creditsCount', 'rechargeBtn' 
        ];
        
        ids.forEach(id => { DOM[id] = document.getElementById(id); });
    }

        /**
     * Met à jour l'affichage des crédits
     */
    function updateCreditsDisplay() {
        if (!DOM.creditsCount || typeof CreditModule === 'undefined') return;
        
        const credits = CreditModule.currentCredits;
        DOM.creditsCount.textContent = credits;
        
        if (credits <= 5) {
            DOM.creditsBadge?.classList.add('low');
        } else {
            DOM.creditsBadge?.classList.remove('low');
        }
        
        // Clic sur le badge → résumé
        if (DOM.creditsBadge) {
            DOM.creditsBadge.onclick = () => {
                showToast(
                    credits + ' crédits disponibles\n\n' +
                    'Services :\n' +
                    '• Dictée : 1 crédit/min\n' +
                    '• Traduction : 3 crédits/1000 car.\n' +
                    '• IA : 5 crédits/requête\n' +
                    '• PDF : 2 crédits/export\n' +
                    '• Lecture : 1 crédit/1000 car.',
                    'info',
                    5000
                );
            };
        }

    }

    function showRechargePopup() {
        if (document.querySelector('.popup-overlay')) return;

        const overlay = document.createElement('div');
        overlay.className = 'popup-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');

        // Cloner la section recharge et la rendre visible
        const rechargeSection = document.getElementById('rechargeSection').cloneNode(true);
        rechargeSection.style.display = 'block';

        // Mettre à jour l'affichage des crédits
        const creditDisplay = rechargeSection.querySelector('#creditDisplay');
        if (creditDisplay) {
            creditDisplay.textContent = CreditModule.currentCredits;
        }

        // Insérer dans un dialogue
        const dialog = document.createElement('div');
        dialog.className = 'popup-dialog';
        dialog.appendChild(rechargeSection);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        // --- Gestion des événements ---
        function close() {
            if (overlay.parentNode) overlay.remove();
        }

        overlay.querySelector('#closeRechargePopup')?.addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        // Bouton Recharger
        overlay.querySelector('#confirmRecharge')?.addEventListener('click', async () => {
            const phoneInput = overlay.querySelector('#phoneNumber');
            const amountInput = overlay.querySelector('#amountInput');
            const phone = phoneInput?.value.trim();
            const amountStr = amountInput?.value.trim();

            if (!/^[67]\d{8}$/.test(phone)) {
                showToast('Numéro invalide. Exemple : 69xxxxxxx (9 chiffres)');
                phoneInput?.focus();
                return;
            }

            const amount = parseInt(amountStr, 10);
            if (isNaN(amount) || amount < 1 || amount > 1000000) {
                showToast('Montant invalide (1 à 1 000 000 XAF)');
                amountInput?.focus();
                return;
            }

            // Désactiver le bouton pour éviter double clic
            const confirmBtn = overlay.querySelector('#confirmRecharge');
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Patientez...';

            try {
                const response = await fetch(
                    'https://zhvdyjpevrqteirqeztb.supabase.co/functions/v1/handle-recharge',
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + CreditModule.config.anonKey,
                            'apikey': CreditModule.config.anonKey
                        },
                        body: JSON.stringify({
                            user_id: CreditModule.userID,
                            phone: phone,
                            amount: amount
                        })
                    }
                );

                const result = await response.json();

                if (result.success) {
                    showToast(`Recharge réussie ! ${result.credits_added} crédits ajoutés.`);
                    await CreditModule.syncCredits();
                    updateCreditsDisplay();
                    close();
                } else {
                    // Afficher le vrai message d’erreur
                    const errorMsg = result.message || result.error || JSON.stringify(result);
                    showToast(errorMsg);
                    console.log('Réponse MeSomb complète :', JSON.stringify(result, null, 2));
                }
            } catch (e) {
                showToast('Erreur réseau lors de la recharge.');
            } finally {
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Recharger';
            }
        });
    }

    function loadPreferences() {
        state.currentLang = window.storage.get('selectedLang', 'fr-FR');
        state.speechRate = window.storage.get('speechRate', '1.0');
        state.selectedAction = window.storage.get('selectedAction', 'formatting');
        
        if (DOM.langSelect) DOM.langSelect.value = state.currentLang;
        if (DOM.speedSelect) DOM.speedSelect.value = state.speechRate;
        if (DOM.actionSelect) DOM.actionSelect.value = state.selectedAction;
        
        const apiKey = window.storage.get('api_key', '');
        if (apiKey && DOM.apiKeyInput) {
            DOM.apiKeyInput.value = apiKey;
            if (DOM.apiKeyToggle) DOM.apiKeyToggle.checked = true;
            DOM.apiKeyInput.readOnly = true;
            DOM.apiKeyInput.type = 'password';
        }
        
        const savedText = window.storage.getSession('currentText', '');
        if (savedText && DOM.output) {
            DOM.output.value = savedText;
            state.fullTranscript = savedText;
        }
    }
    
    function setupEvents() {
        if (DOM.recordBtn) DOM.recordBtn.addEventListener('click', toggleRecording);
        if (DOM.translateBtn) DOM.translateBtn.addEventListener('click', handleTranslation);
        if (DOM.rechargeBtn) {
            DOM.rechargeBtn.addEventListener('click', showRechargePopup);
        }
        if (DOM.playBtn) {
            let clickTimer = null;
            DOM.playBtn.addEventListener('click', (e) => {
                // Empêche le simple clic d’interférer avec le double‑clic
                if (clickTimer) {
                    clearTimeout(clickTimer);
                    clickTimer = null;
                    return;                       // laisse le dblclick agir seul
                }
                clickTimer = setTimeout(() => {
                    clickTimer = null;
                    toggleSpeech();               // simple clic = lecture / pause / reprise
                }, 250);
            });
            DOM.playBtn.addEventListener('dblclick', (e) => {
                if (clickTimer) {
                    clearTimeout(clickTimer);
                    clickTimer = null;
                }
                stopSpeech();                     // double‑clic = arrêt total
            });
        }
        if (DOM.iaBtn) {
            DOM.iaBtn.addEventListener('click', handleIA);
            DOM.iaBtn.addEventListener('dblclick', handleIAAbort);
        }
        if (DOM.copyBtn) DOM.copyBtn.addEventListener('click', copyText);
        if (DOM.clearBtn) DOM.clearBtn.addEventListener('click', handleClearText);
        if (DOM.exportBtn) DOM.exportBtn.addEventListener('click', handleExport);
        if (DOM.importPdfBtn) DOM.importPdfBtn.addEventListener('click', () => { if (DOM.pdfFileInput) DOM.pdfFileInput.click(); });
        if (DOM.pdfFileInput) DOM.pdfFileInput.addEventListener('change', handlePdfImport);
        
        if (DOM.langSelect) {
            DOM.langSelect.addEventListener('change', (e) => {
                state.currentLang = e.target.value;
                window.storage.set('selectedLang', state.currentLang);
                if (SpeechModule.isSpeaking || SpeechModule.isPaused) {
                    SpeechModule.stopSpeaking();
                    resetPlayButton();
                }
            });
        }
        
        if (DOM.speedSelect) {
            DOM.speedSelect.addEventListener('change', (e) => {
                state.speechRate = e.target.value;
                window.storage.set('speechRate', state.speechRate);
            });
        }
        
        if (DOM.actionSelect) {
            DOM.actionSelect.addEventListener('change', (e) => {
                state.selectedAction = e.target.value;
                window.storage.set('selectedAction', state.selectedAction);
            });
        }
        
        if (DOM.apiKeyToggle) {
            DOM.apiKeyToggle.addEventListener('change', (e) => {
                if (e.target.checked) {
                    const key = DOM.apiKeyInput ? DOM.apiKeyInput.value.trim() : '';
                    if (key) {
                        AIModule.setApiKey(key);
                        if (DOM.apiKeyInput) {
                            DOM.apiKeyInput.readOnly = true;
                            DOM.apiKeyInput.type = 'password';
                        }
                        showToast('Clé API verrouillée');
                    } else {
                        e.target.checked = false;
                        showToast('Veuillez entrer une clé API');
                    }
                } else {
                    if (DOM.apiKeyInput) {
                        DOM.apiKeyInput.readOnly = false;
                        DOM.apiKeyInput.type = 'text';
                    }
                    window.storage.remove('api_key');
                }
            });
        }
        
        if (DOM.output) {
            DOM.output.addEventListener('input', () => {
                state.fullTranscript = DOM.output.value;
                window.storage.setSession('currentText', DOM.output.value);
            });
        }
        
        window.addEventListener('beforeunload', () => {
            if (DOM.output) window.storage.setSession('currentText', DOM.output.value);
            window.storage.set('speechRate', state.speechRate);
            window.storage.set('selectedLang', state.currentLang);
            window.storage.set('selectedAction', state.selectedAction);
        });
    }
    
    // ============================================================
    // POP-UP DE CONFIRMATION GÉNÉRIQUE
    // ============================================================
    
    function showConfirmPopup(title, message, iconSVG, confirmText, onConfirm) {
        const existing = document.querySelector('.popup-overlay');
        if (existing) existing.remove();
        
        if (window._popupEscHandler) {
            document.removeEventListener('keydown', window._popupEscHandler);
            window._popupEscHandler = null;
        }
        
        const overlay = document.createElement('div');
        overlay.className = 'popup-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        
        overlay.innerHTML = `
            <div class="popup-dialog">
                <div class="popup-icon">${iconSVG}</div>
                <div class="popup-title">${escapeHTML(title)}</div>
                <div class="popup-message">${escapeHTML(message)}</div>
                <div class="popup-buttons">
                    <button class="popup-btn popup-btn-cancel">Annuler</button>
                    <button class="popup-btn popup-btn-confirm">${escapeHTML(confirmText)}</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        const cancelBtn = overlay.querySelector('.popup-btn-cancel');
        const confirmBtn = overlay.querySelector('.popup-btn-confirm');
        let resolved = false;
        
        function close() {
            if (resolved) return;
            resolved = true;
            if (window._popupEscHandler) {
                document.removeEventListener('keydown', window._popupEscHandler);
                window._popupEscHandler = null;
            }
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.2s ease';
            setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 200);
        }
        
        function confirm() {
            if (resolved) return;
            close();
            setTimeout(() => { if (typeof onConfirm === 'function') onConfirm(); }, 250);
        }
        
        cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); close(); });
        confirmBtn.addEventListener('click', (e) => { e.stopPropagation(); confirm(); });
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        
        const dialog = overlay.querySelector('.popup-dialog');
        if (dialog) dialog.addEventListener('click', (e) => e.stopPropagation());
        
        window._popupEscHandler = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); close(); }
            if (e.key === 'Enter') { e.preventDefault(); confirm(); }
        };
        document.addEventListener('keydown', window._popupEscHandler);
        
        setTimeout(() => { if (cancelBtn && cancelBtn.parentNode) cancelBtn.focus(); }, 100);
        
        return overlay;
    }
    
    // ============================================================
    // POP-UP AVEC CHAMP DE SAISIE (pour le titre PDF)
    // ============================================================
    
    function showInputPopup(title, message, iconSVG, inputPlaceholder, inputDefaultValue, confirmText, onConfirm) {
        const existing = document.querySelector('.popup-overlay');
        if (existing) existing.remove();
        
        if (window._popupEscHandler) {
            document.removeEventListener('keydown', window._popupEscHandler);
            window._popupEscHandler = null;
        }
        
        const overlay = document.createElement('div');
        overlay.className = 'popup-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        
        overlay.innerHTML = `
            <div class="popup-dialog">
                <div class="popup-icon">${iconSVG}</div>
                <div class="popup-title">${escapeHTML(title)}</div>
                <div class="popup-message">${escapeHTML(message)}</div>
                <input 
                    type="text" 
                    class="popup-input" 
                    id="popup-title-input" 
                    placeholder="${escapeHTML(inputPlaceholder)}" 
                    value="${escapeHTML(inputDefaultValue)}"
                    autocomplete="off"
                    maxlength="100"
                >
                <div class="popup-buttons">
                    <button class="popup-btn popup-btn-cancel">Annuler</button>
                    <button class="popup-btn popup-btn-confirm">${escapeHTML(confirmText)}</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        const inputField = overlay.querySelector('#popup-title-input');
        const cancelBtn = overlay.querySelector('.popup-btn-cancel');
        const confirmBtn = overlay.querySelector('.popup-btn-confirm');
        let resolved = false;
        
        function close() {
            if (resolved) return;
            resolved = true;
            if (window._popupEscHandler) {
                document.removeEventListener('keydown', window._popupEscHandler);
                window._popupEscHandler = null;
            }
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.2s ease';
            setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 200);
        }
        
        function confirm() {
            if (resolved) return;
            const inputValue = inputField ? inputField.value.trim() : inputDefaultValue;
            const finalTitle = inputValue || inputDefaultValue || 'Document';
            close();
            setTimeout(() => { if (typeof onConfirm === 'function') onConfirm(finalTitle); }, 250);
        }
        
        cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); close(); });
        confirmBtn.addEventListener('click', (e) => { e.stopPropagation(); confirm(); });
        
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        
        const dialog = overlay.querySelector('.popup-dialog');
        if (dialog) dialog.addEventListener('click', (e) => e.stopPropagation());
        
        // Empêcher la fermeture au clic sur l'input
        if (inputField) {
            inputField.addEventListener('click', (e) => e.stopPropagation());
            // Valider avec Entrée dans le champ
            inputField.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    confirm();
                }
            });
        }
        
        window._popupEscHandler = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); close(); }
        };
        document.addEventListener('keydown', window._popupEscHandler);
        
        // Focus sur le champ de saisie
        setTimeout(() => {
            if (inputField) {
                inputField.focus();
                inputField.select();
            }
        }, 150);
        
        return overlay;
    }
    
    function escapeHTML(str) {
        if (!str || typeof str !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
    
    // ============================================================
    // BOUTON EFFACER
    // ============================================================
    
    function handleClearText() {
        if (!DOM.output || !DOM.output.value.trim()) {
            showToast('Aucun texte à effacer');
            return;
        }
        
        const trashIconSVG = `
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="28" height="28">
                <path d="M4 6h16" stroke="#f08080" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2" stroke="#f08080" stroke-width="1.8" fill="none"/>
                <path d="M10 10v7M14 10v7" stroke="#f08080" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M5 6l1 14a1 1 0 001 1h10a1 1 0 001-1l1-14" stroke="#f08080" stroke-width="1.8" fill="none"/>
            </svg>
        `;
        
        showConfirmPopup(
            'Effacer le texte',
            'Voulez-vous vraiment effacer tout le texte ?\nCette action est irréversible.',
            trashIconSVG,
            'Effacer',
            () => {
                state.fullTranscript = '';
                state.translatedText = '';
                state._lastInterimText = '';
                DOM.output.value = '';
                window.storage.setSession('currentText', '');
                if (SpeechModule.isSpeaking || SpeechModule.isPaused) {
                    SpeechModule.stopSpeaking();
                    resetPlayButton();
                }
                if (DOM.formatInfo) DOM.formatInfo.textContent = '';
                updateModeIndicator('Prêt');
                showToast('Texte effacé');
            }
        );
    }
    
    // ============================================================
    // ENREGISTREMENT VOCAL
    // ============================================================
    
    async function toggleRecording() {
        if (SpeechModule.isRecording) {
            SpeechModule.stopRecognition();
            resetRecordButton();
            updateModeIndicator('Prêt');
            if (DOM.output) {
                state.fullTranscript = DOM.output.value;
                window.storage.setSession('currentText', DOM.output.value);
            }

            // Déduire les crédits et rafraîchir
            try {
                await CreditModule.useCredits('dictation');
                updateCreditsDisplay();
            } catch(e) { /* silencieux */ }

            return;
        }
            try {
            await CreditModule.canUseService('dictation');
        } catch (e) {
            showToast(e.message);
            return;
        }

        try {
            if (navigator.permissions && navigator.permissions.query) {
                try {
                    const status = await navigator.permissions.query({ name: 'microphone' });
                    if (status.state === 'denied') {
                        showToast('Microphone bloqué. Activez-le dans les paramètres.');
                        return;
                    }
                } catch(e) {}
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
            });
            stream.getTracks().forEach(t => t.stop());

            state._lastInterimText = '';

            // SAUVEGARDE DU TEXTE EXISTANT avant la nouvelle dictée
            const baseText = DOM.output ? DOM.output.value : state.fullTranscript;

            await SpeechModule.startRecognition(
                state.currentLang,
                (fullText, interimText) => {
                    // fullText = texte complet de la session actuelle
                    state.fullTranscript = baseText + fullText;
                    let displayText = baseText + fullText;
                    if (interimText && interimText.trim() && interimText !== state._lastInterimText) {
                        displayText += interimText;
                        state._lastInterimText = interimText;
                    }
                    if (DOM.output) {
                        DOM.output.value = displayText;
                        DOM.output.scrollTop = DOM.output.scrollHeight;
                    }
                },
                (error) => {
                    showToast(error);
                    resetRecordButton();
                    updateModeIndicator('Erreur');
                }
            );

            setRecordButtonRecording();
            updateModeIndicator('🔴 Enregistrement...');

        } catch(e) {
            showToast('Erreur: ' + (e.message || 'Microphone indisponible'));
            resetRecordButton();
        }
    }
    
    function resetRecordButton() {
        if (DOM.recordBtn) {
            DOM.recordBtn.classList.remove('btn-recording');
            const label = DOM.recordBtn.querySelector('span:last-child');
            if (label) label.textContent = 'Dicter';
        }
    }
    
    function setRecordButtonRecording() {
        if (DOM.recordBtn) {
            DOM.recordBtn.classList.add('btn-recording');
            const label = DOM.recordBtn.querySelector('span:last-child');
            if (label) label.textContent = 'Stop';
        }
    }
    
    function updateModeIndicator(text) {
        if (DOM.modeIndicator) DOM.modeIndicator.textContent = text;
    }
    
    // ============================================================
    // TRADUCTION
    // ============================================================
    
    async function handleTranslation() {
        const text = DOM.output ? DOM.output.value : state.fullTranscript;
        if (!text || !text.trim()) { showToast('Aucun texte à traduire'); return; }
        
        if (DOM.translateBtn) DOM.translateBtn.disabled = true;
        updateModeIndicator('Traduction...');
        
        try {
            await CreditModule.canUseService('translation');
        } catch (e) {
            showToast(e.message);
            return;
        }

        try {
            const translated = await TranslationModule.translate(text, state.currentLang);
            state.translatedText = translated;
            if (DOM.output) DOM.output.value = translated;
            state.fullTranscript = translated;
            updateModeIndicator('Traduit');
            showToast('Traduction terminée');
        } catch (e) {
            showToast('Erreur: ' + e.message);
            updateModeIndicator('Erreur');
        } finally {
            if (DOM.translateBtn) DOM.translateBtn.disabled = false;
        }

        await CreditModule.useCredits('translation');
        updateCreditsDisplay();

    }
    
    // ============================================================
    // LECTURE
    // ============================================================
    
    function resetPlayButton() {
        if (DOM.playBtn) {
            const label = DOM.playBtn.querySelector('span:last-child');
            if (label) label.textContent = 'Lire';
        }
    }
    
    function toggleSpeech() {
        if (SpeechModule.isSpeaking && !SpeechModule.isPaused) { SpeechModule.pauseSpeaking(); return; }
        if (SpeechModule.isPaused) { SpeechModule.resumeSpeaking(); return; }
        
        const text = DOM.output ? DOM.output.value : '';
        if (!text || !text.trim()) { showToast('Aucun texte à lire'); return; }
        
        SpeechModule.onStart = () => { if (DOM.playBtn) DOM.playBtn.querySelector('span:last-child').textContent = 'Pause'; };
        SpeechModule.onPause = () => { if (DOM.playBtn) DOM.playBtn.querySelector('span:last-child').textContent = 'Reprendre'; };
        SpeechModule.onResume = () => { if (DOM.playBtn) DOM.playBtn.querySelector('span:last-child').textContent = 'Pause'; };
        SpeechModule.onStop = resetPlayButton;
        SpeechModule.onFinish = () => {
            resetPlayButton();
            // Déduire crédits
            CreditModule.useCredits('speech_reading')
                .then(() => updateCreditsDisplay())
                .catch(() => {});
        };
        
        SpeechModule.speak(text, state.currentLang, parseFloat(state.speechRate));
    }
    
    function stopSpeech() {
        SpeechModule.stopSpeaking();
        resetPlayButton();
        showToast('Lecture arrêtée');
    }
    
    // ============================================================
    // IA
    // ============================================================
    
    function handleIAAbort() {
        if (state.isProcessingIA) {
            AIModule.abort();
            state.isProcessingIA = false;
            if (DOM.iaBtn) {
                DOM.iaBtn.disabled = false;
                DOM.iaBtn.querySelector('span:last-child').textContent = 'IA';
                DOM.iaBtn.title = 'Lancer le traitement IA';
            }
            if (DOM.progressBar) DOM.progressBar.style.display = 'none';
            if (DOM.progressFill) DOM.progressFill.style.width = '0%';
            updateModeIndicator('⏹ Interrompu');
            showToast('Traitement IA interrompu');
        }
    }
    
    async function handleIA() {
        if (state.isProcessingIA) return;

        try {
            await CreditModule.canUseService('ia_processing');
        } catch (e) {
            showToast(e.message);
            return;
        }
        
        const text = DOM.output ? DOM.output.value : '';
        if (!text || !text.trim()) { showToast('Aucun texte à traiter'); return; }
        if (!AIModule.getApiKey()) { showToast('Configurez votre clé API OpenRouter'); return; }
        
        state.isProcessingIA = true;
        
        if (DOM.iaBtn) {
            DOM.iaBtn.querySelector('span:last-child').textContent = '...';
            DOM.iaBtn.title = 'Double-clic pour interrompre';
        }
        
        if (DOM.progressBar) DOM.progressBar.style.display = 'block';
        if (DOM.progressFill) DOM.progressFill.style.width = '0%';
        updateModeIndicator('🤖 IA en cours...');
        
        try {
            const result = await AIModule.processText(
                text, state.selectedAction,
                (current, total, label) => {
                    const percent = Math.round((current / total) * 100);
                    if (DOM.progressFill) DOM.progressFill.style.width = percent + '%';
                    updateModeIndicator('🤖 ' + label);
                }
            );
            
            if (result && result.trim() && state.isProcessingIA) {
                if (DOM.output) DOM.output.value = result;
                state.fullTranscript = result;
                updateModeIndicator('✅ Terminé');
                if (DOM.formatInfo) DOM.formatInfo.textContent = result.length.toLocaleString() + ' caractères';
                showToast('Traitement IA terminé');
            }
        } catch (e) {
            if (e.name === 'AbortError' || (e.message && e.message.includes('interrompu'))) {
                console.log('IA interrompue');
            } else {
                showToast('Erreur IA: ' + (e.message || 'Erreur inconnue'));
                updateModeIndicator('❌ Échec');
            }
        } finally {
            state.isProcessingIA = false;
            if (DOM.iaBtn) {
                DOM.iaBtn.disabled = false;
                DOM.iaBtn.querySelector('span:last-child').textContent = 'IA';
                DOM.iaBtn.title = 'Lancer le traitement IA';
            }
            setTimeout(() => { if (DOM.progressBar && !state.isProcessingIA) DOM.progressBar.style.display = 'none'; }, 2000);
        }

        await CreditModule.useCredits('ia_processing');
        updateCreditsDisplay(); // ← Mettre à jour l'affichage

    }
    
    // ============================================================
    // OUTILS
    // ============================================================
    
    function copyText() {
        const text = DOM.output ? DOM.output.value : '';
        if (!text || !text.trim()) { showToast('Aucun texte à copier'); return; }
        
        navigator.clipboard.writeText(text)
            .then(() => showToast('Texte copié !'))
            .catch(() => {
                if (DOM.output) { DOM.output.select(); document.execCommand('copy'); showToast('Texte copié !'); }
            });
    }
    
    // ============================================================
    // EXPORT PDF + TXT (avec titre personnalisable)
    // ============================================================

   async function handleExport() {
        const text = DOM.output ? DOM.output.value : '';
        if (!text || !text.trim()) { showToast('Aucun texte à exporter'); return; }
        
        exportTextFile(text);
        
        setTimeout(() => {
            const pdfIconSVG = `
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="28" height="28">
                    <path d="M6 2h8l6 6v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z" stroke="#b07cc6" stroke-width="1.8" fill="none"/>
                    <path d="M14 2v6h6" stroke="#b07cc6" stroke-width="1.8" fill="none"/>
                    <path d="M9 13h6M9 16h4" stroke="#b07cc6" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
            `;
            
            const now = new Date();
            const defaultTitle = 'QuickText_' + 
                String(now.getDate()).padStart(2, '0') + '-' + 
                String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                now.getFullYear() + '_' +
                String(now.getHours()).padStart(2, '0') + 'h' + 
                String(now.getMinutes()).padStart(2, '0') + 'm';
            
            showExportPDFPopup(text, pdfIconSVG, defaultTitle);
        }, 500);

        await CreditModule.useCredits('pdf_export');
        updateCreditsDisplay(); 
    }

    function showExportPDFPopup(text, iconSVG, defaultTitle) {
        const existing = document.querySelector('.popup-overlay');
        if (existing) existing.remove();
        
        if (window._popupEscHandler) {
            document.removeEventListener('keydown', window._popupEscHandler);
            window._popupEscHandler = null;
        }
        
        const overlay = document.createElement('div');
        overlay.className = 'popup-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        
        overlay.innerHTML = `
            <div class="popup-dialog">
                <div class="popup-icon">${iconSVG}</div>
                <div class="popup-title">Export PDF</div>
                <div class="popup-message">Entrez le titre du document.<br>Le fichier TXT a déjà été téléchargé.</div>
                <input type="text" class="popup-input" id="popup-title-input" placeholder="Titre du document..." value="${escapeHTML(defaultTitle)}" autocomplete="off" maxlength="100">
                
                <div class="popup-toggle-row">
                    <input type="checkbox" class="popup-toggle-switch" id="popup-hide-branding">
                    <label class="popup-toggle-label" for="popup-hide-branding">Sans mention QTVP</label>
                </div>
                
                <div class="popup-extra-options" id="popup-extra-options">
                    <div class="popup-option-row">
                        <span class="popup-option-label">Logo :</span>
                        <input type="file" class="popup-file-input" id="popup-logo-input" accept="image/png,image/jpeg,image/svg+xml">
                    </div>
                    
                    <div class="popup-option-row">
                        <span class="popup-option-label">Position :</span>
                        <div class="popup-position-group" id="popup-position-group">
                            <button class="popup-position-btn" data-pos="left">Gauche</button>
                            <button class="popup-position-btn active" data-pos="center">Centre</button>
                            <button class="popup-position-btn" data-pos="right">Droite</button>
                        </div>
                    </div>
                    
                    <div class="popup-option-row">
                        <span class="popup-option-label">Couleur :</span>
                        <input type="text" class="popup-hex-input" id="popup-hex-input" value="#9b59b6" placeholder="#9b59b6" maxlength="7" autocomplete="off">
                        <div class="popup-hex-preview" id="popup-hex-preview" style="background: #9b59b6;"></div>
                    </div>
                    
                    <div class="popup-radio-row">
                        <span class="popup-radio-label">Afficher la date et l'heure</span>
                        <input type="checkbox" class="popup-radio-switch" id="popup-show-date" checked>
                    </div>
                    
                    <div class="popup-radio-row">
                        <span class="popup-radio-label">Afficher la pagination</span>
                        <input type="checkbox" class="popup-radio-switch" id="popup-show-pagination" checked>
                    </div>
                </div>
                
                <div class="popup-buttons">
                    <button class="popup-btn popup-btn-cancel">Annuler</button>
                    <button class="popup-btn popup-btn-confirm">Exporter PDF</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        // Références
        const inputField = overlay.querySelector('#popup-title-input');
        const hideBrandingCheckbox = overlay.querySelector('#popup-hide-branding');
        const extraOptions = overlay.querySelector('#popup-extra-options');
        const logoInput = overlay.querySelector('#popup-logo-input');
        const positionGroup = overlay.querySelector('#popup-position-group');
        const hexInput = overlay.querySelector('#popup-hex-input');
        const hexPreview = overlay.querySelector('#popup-hex-preview');
        const showDateCheckbox = overlay.querySelector('#popup-show-date');
        const showPaginationCheckbox = overlay.querySelector('#popup-show-pagination');
        const cancelBtn = overlay.querySelector('.popup-btn-cancel');
        const confirmBtn = overlay.querySelector('.popup-btn-confirm');
        
        // État des options
        let logoDataURL = null;
        let logoPosition = 'center';
        let themeColor = '#9b59b6';
        let resolved = false;
        
        // Afficher/masquer les options supplémentaires
        hideBrandingCheckbox.addEventListener('change', () => {
            if (hideBrandingCheckbox.checked) {
                extraOptions.classList.add('visible');
            } else {
                extraOptions.classList.remove('visible');
            }
        });
        
        // Logo
        logoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (ev) => {
                logoDataURL = ev.target.result;
                showToast('Logo chargé');
            };
            reader.readAsDataURL(file);
        });
        
        // Position
        positionGroup.addEventListener('click', (e) => {
            const btn = e.target.closest('.popup-position-btn');
            if (!btn) return;
            
            positionGroup.querySelectorAll('.popup-position-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            logoPosition = btn.dataset.pos;
        });
        
        // Couleur hexadécimale
        hexInput.addEventListener('input', () => {
            let val = hexInput.value.trim();
            if (val && !val.startsWith('#')) val = '#' + val;
            hexInput.value = val;
            themeColor = val || '#9b59b6';
            
            // Mettre à jour la preview
            if (/^#[0-9a-f]{6}$/i.test(val)) {
                hexPreview.style.background = val;
            } else if (val === '' || val === '#') {
                hexPreview.style.background = 'transparent';
                hexPreview.style.border = '2px dashed #ccc';
            }
        });
        
        // Restaurer le style si valide
        hexInput.addEventListener('blur', () => {
            const val = hexInput.value.trim();
            if (/^#[0-9a-f]{6}$/i.test(val)) {
                hexPreview.style.background = val;
                hexPreview.style.border = '2px solid var(--border)';
            }
        });
        
        function close() {
            if (resolved) return;
            resolved = true;
            if (window._popupEscHandler) {
                document.removeEventListener('keydown', window._popupEscHandler);
                window._popupEscHandler = null;
            }
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.2s ease';
            setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 200);
        }
        
        function confirm() {
            if (resolved) return;
            const finalTitle = inputField?.value.trim() || defaultTitle || 'Document';
            const hideBranding = hideBrandingCheckbox?.checked || false;
            const showDate = showDateCheckbox?.checked !== false;
            const showPagination = showPaginationCheckbox?.checked !== false;
            
            // Valider la couleur
            let finalColor = hexInput?.value.trim() || '#9b59b6';
            if (!/^#[0-9a-f]{6}$/i.test(finalColor)) finalColor = '#9b59b6';
            
            const customOptions = hideBranding ? {
                logoDataURL: logoDataURL,
                logoPosition: logoPosition,
                themeColor: finalColor,
                showDate: showDate,
                showPagination: showPagination
            } : {
                showDate: true,
                showPagination: true,
                themeColor: '#9b59b6'
            };
            
            close();
            setTimeout(() => {
                try {
                    if (typeof PDFExportModule !== 'undefined') {
                        PDFExportModule.exportToPDF(text, finalTitle, hideBranding, customOptions);
                        showToast('PDF exporté avec succès !');
                    } else {
                        throw new Error('Module PDF non disponible');
                    }
                } catch (e) {
                    console.error('Erreur PDF:', e);
                    showToast('Erreur PDF: ' + e.message);
                }
            }, 250);
        }
        
        cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); close(); });
        confirmBtn.addEventListener('click', (e) => { e.stopPropagation(); confirm(); });
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        
        const dialog = overlay.querySelector('.popup-dialog');
        if (dialog) dialog.addEventListener('click', (e) => e.stopPropagation());
        
        if (extraOptions) extraOptions.addEventListener('click', (e) => e.stopPropagation());
        
        if (inputField) {
            inputField.addEventListener('click', (e) => e.stopPropagation());
            inputField.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); confirm(); } });
        }
        
        window._popupEscHandler = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
        document.addEventListener('keydown', window._popupEscHandler);
        
        setTimeout(() => { if (inputField) { inputField.focus(); inputField.select(); } }, 150);
        
        return overlay;
    }

    function exportTextFile(text) {
        const blob = new Blob(['\uFEFF' + text], { type: 'text/plain;charset=utf-8' });
        const d = new Date();
        const ts = 'QuickText_' + 
            String(d.getDate()).padStart(2, '0') + '-' + 
            String(d.getMonth() + 1).padStart(2, '0') + '-' + 
            d.getFullYear() + '_' +
            String(d.getHours()).padStart(2, '0') + 'h' + 
            String(d.getMinutes()).padStart(2, '0') + 'm' +
            String(d.getSeconds()).padStart(2, '0') + 's';
        
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = ts + '.txt';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        showToast('TXT exporté ! (' + text.length.toLocaleString() + ' car.)');
    }
    
    function exportTextFile(text) {
        const blob = new Blob(['\uFEFF' + text], { type: 'text/plain;charset=utf-8' });
        const d = new Date();
        const ts = 'QuickText_' + 
            String(d.getDate()).padStart(2, '0') + '-' + 
            String(d.getMonth() + 1).padStart(2, '0') + '-' + 
            d.getFullYear() + '_' +
            String(d.getHours()).padStart(2, '0') + 'h' + 
            String(d.getMinutes()).padStart(2, '0') + 'm' +
            String(d.getSeconds()).padStart(2, '0') + 's';
        
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = ts + '.txt';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        showToast('TXT exporté ! (' + text.length.toLocaleString() + ' car.)');
    }
    
    function exportPDFFile(text, title) {
        if (typeof PDFExportModule !== 'undefined') {
            PDFExportModule.exportToPDF(text, title);
        } else {
            throw new Error('Module PDF non disponible');
        }
    }
    
    // ============================================================
    // IMPORT PDF
    // ============================================================
    
    async function handlePdfImport(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        if (file.size > 50 * 1024 * 1024) {
            showToast('Fichier trop volumineux (max 50 Mo)');
            e.target.value = '';
            return;
        }
        
        updateModeIndicator('📄 Extraction PDF...');
        
        try {
            const text = await PDFModule.extractText(file);
            if (text && text.trim()) {
                if (DOM.output) DOM.output.value = text;
                state.fullTranscript = text;
                updateModeIndicator('✅ PDF extrait');
                showToast('PDF extrait (' + text.length.toLocaleString() + ' car.)');
            } else {
                showToast('Aucun texte extractible');
                updateModeIndicator('⚠️ Vide');
            }
        } catch (err) {
            showToast('Erreur PDF: ' + err.message);
            updateModeIndicator('❌ Erreur');
        }
        
        e.target.value = '';
    }
    
    // ============================================================
    // PWA
    // ============================================================
    
   function setupPWA() {
        let deferredPrompt;
        
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            if (DOM.installBtn) DOM.installBtn.style.display = 'block';
        });
        
        if (DOM.installBtn) {
            DOM.installBtn.addEventListener('click', async () => {
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    await deferredPrompt.userChoice;
                    deferredPrompt = null;
                    DOM.installBtn.style.display = 'none';
                } else {
                    showToast('Utilisez le menu du navigateur pour installer.');
                }
            });
        }
        
        // Enregistrement du Service Worker avec détection du chemin
        if ('serviceWorker' in navigator) {
            // Détecter le bon chemin de base (racine ou sous-dossier)
            const basePath = location.pathname.replace(/\/[^/]*$/, '');
            const swPath = basePath ? basePath + '/sw.js' : './sw.js';
            
            navigator.serviceWorker.register(swPath)
                .then(reg => console.log('SW OK:', reg.scope))
                .catch(err => console.warn('SW err:', err));
        }
    }
    
    function loadVoices() {
        if ('speechSynthesis' in window) {
            speechSynthesis.getVoices();
            speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
        }
    }
    
    // ============================================================
    // TOAST
    // ============================================================
    
    function showToast(message) {
        const existing = document.querySelector('.custom-toast');
        if (existing) existing.remove();
        
        const toast = document.createElement('div');
        toast.className = 'custom-toast';
        toast.setAttribute('role', 'alert');
        toast.textContent = message;
        document.body.appendChild(toast);
        
        const timer = setTimeout(() => { hideToast(toast); }, 2500);
        toast.addEventListener('click', () => { clearTimeout(timer); hideToast(toast); });
        
        return toast;
    }
    
    function hideToast(toast) {
        if (!toast || !toast.parentNode) return;
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        toast.style.transform = 'translateX(-50%) translateY(10px)';
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
    }
    
    // ============================================================
    // DÉMARRAGE
    // ============================================================
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
})();