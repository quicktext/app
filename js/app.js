// QuickText Voice Pro - Application Principale
// Version finale - Export PDF+TXT avec titre personnalisable
// Avec authentification par mot de passe

(function() {
    'use strict';
    
    const state = {
        fullTranscript: '',
        translatedText: '',
        isProcessingIA: false,
        currentLang: 'fr-FR',
        speechRate: '1.0',
        selectedAction: 'formatting',
        _lastInterimText: '',
        _baseTextBeforeDictation: ''
    };
    
    const DOM = {};

    // ============================================================
    // FONCTIONS UTILITAIRES
    // ============================================================

    function escapeHTML(str) {
        if (!str || typeof str !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function showToast(message) {
        const existing = document.querySelector('.custom-toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.className = 'custom-toast';
        toast.setAttribute('role', 'alert');
        toast.textContent = message;
        document.body.appendChild(toast);
        const timer = setTimeout(() => { hideToast(toast); }, 4000);
        toast.addEventListener('click', () => { clearTimeout(timer); hideToast(toast); });
        return toast;
    }

    function hideToast(toast) {
        if (!toast || !toast.parentNode) return;
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        toast.style.transform = 'translateX(-50%) translateY(-10px)';
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
    }

    function populateVoiceList(lang) {
        if (!DOM.voiceSelect) return;
        const currentValue = DOM.voiceSelect.value;
        DOM.voiceSelect.innerHTML = '';
        const autoOption = document.createElement('option');
        autoOption.value = 'auto';
        autoOption.textContent = '🎙️ Auto (meilleure voix)';
        DOM.voiceSelect.appendChild(autoOption);
        let voices = [];
        if ('speechSynthesis' in window) {
            voices = speechSynthesis.getVoices();
        }
        if (voices.length === 0) {
            speechSynthesis.getVoices();
            speechSynthesis.onvoiceschanged = () => { populateVoiceList(lang); };
            return;
        }
        const langPrefix = lang.split('-')[0];
        const langVoices = voices.filter(v => v.lang.indexOf(langPrefix) === 0);
        const voicesToShow = langVoices.length > 0 ? langVoices : voices;
        const naturalIndicators = [
            'Premium', 'Enhanced', 'Natural', 'Wavenet', 'Neural',
            'Google', 'Microsoft', 'Amazon',
            'Daniel', 'Samantha', 'Karen', 'Moira', 'Fiona', 'Veena',
            'Amélie', 'Thomas', 'Chantal', 'Nicolas', 'Audrey', 'Aurelie'
        ];
        voicesToShow.sort((a, b) => {
            const aNatural = naturalIndicators.some(i => a.name.includes(i));
            const bNatural = naturalIndicators.some(i => b.name.includes(i));
            if (aNatural && !bNatural) return -1;
            if (!aNatural && bNatural) return 1;
            return a.name.localeCompare(b.name);
        });
        voicesToShow.forEach(voice => {
            const isNatural = naturalIndicators.some(i => voice.name.includes(i));
            const prefix = isNatural ? '🌟 ' : '   ';
            const option = document.createElement('option');
            option.value = voice.name;
            option.textContent = prefix + voice.name + ' (' + voice.lang + ')';
            DOM.voiceSelect.appendChild(option);
        });
        if (currentValue && DOM.voiceSelect.querySelector(`option[value="${currentValue}"]`)) {
            DOM.voiceSelect.value = currentValue;
        }
    }

    function updateCreditsDisplay() {
        if (!DOM.creditsCount || typeof CreditModule === 'undefined') return;
        const credits = CreditModule.currentCredits;
        DOM.creditsCount.textContent = credits;
        if (credits <= 5) {
            DOM.creditsBadge?.classList.add('low');
        } else {
            DOM.creditsBadge?.classList.remove('low');
        }
        if (DOM.creditsBadge) {
            DOM.creditsBadge.onclick = null;
        }
    }

    function updateModeIndicator(text) {
        if (DOM.modeIndicator) DOM.modeIndicator.textContent = text;
    }

    function resetPlayButton() {
        if (DOM.playBtn) {
            const label = DOM.playBtn.querySelector('span:last-child');
            if (label) label.textContent = 'Lire';
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

    function calculateIACost(charCount) {
        if (charCount <= 2000) return 5;
        if (charCount <= 5000) return 10;
        if (charCount <= 10000) return 20;
        if (charCount <= 20000) return 35;
        if (charCount <= 40000) return 65;
        if (charCount <= 80000) return 120;
        return Math.ceil(charCount / 1000) * 1.5;
    }

    function calculatePartialCost(totalChars, traitedChars, totalCost) {
        const pourcentage = traitedChars / totalChars;
        if (pourcentage < 0.05) return 0;
        const coutProportionnel = Math.ceil(totalCost * pourcentage);
        return Math.max(1, coutProportionnel);
    }

    function confirmLargeProcessing(charCount, cost) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'popup-overlay popup-blocking';
            overlay.setAttribute('role', 'dialog');
            overlay.innerHTML = `
                <div class="popup-dialog">
                    <div class="popup-icon">
                        <svg viewBox="0 0 24 24" fill="none" width="28" height="28"><rect x="3" y="3" width="18" height="18" rx="5" stroke="#b07cc6" stroke-width="1.8"/><circle cx="9" cy="10" r="1.5" fill="#b07cc6"/><circle cx="15" cy="10" r="1.5" fill="#b07cc6"/><path d="M8 16c1.5 2 4.5 2 6 0" stroke="#b07cc6" stroke-width="1.5" stroke-linecap="round"/></svg>
                    </div>
                    <div class="popup-title">Traitement volumineux</div>
                    <div class="popup-message">
                        Votre texte contient <strong>${charCount.toLocaleString()}</strong> caractères.<br>
                        Coût estimé : <strong>${cost} crédits</strong> (${(cost * 0.25).toFixed(0)} FCFA).<br>
                        <small>En cas d'interruption, seuls les caractères traités seront facturés.</small><br><br>
                        Continuer ?
                    </div>
                    <div class="popup-buttons">
                        <button class="popup-btn popup-btn-cancel" id="cancelLargeIA">Annuler</button>
                        <button class="popup-btn popup-btn-confirm" id="confirmLargeIA">Continuer</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            overlay.querySelector('#cancelLargeIA').onclick = () => { overlay.remove(); resolve(false); };
            overlay.querySelector('#confirmLargeIA').onclick = () => { overlay.remove(); resolve(true); };
        });
    }

    // ============================================================
    // CHANGEMENT DE COMPTE
    // ============================================================

    async function switchToAccount(phone, password, currentOverlay) {
        try {
            const response = await fetch(
                'https://zhvdyjpevrqteirqeztb.supabase.co/functions/v1/auth-user',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + CreditModule.config.anonKey,
                        'apikey': CreditModule.config.anonKey,
                    },
                    body: JSON.stringify({
                        action: 'link',
                        phone: phone,
                        password: password,
                        userId: CreditModule.userID,
                    }),
                }
            );
            
            const result = await response.json();
            
            if (result.success) {
                window.storage.set('userID', result.userId);
                CreditModule.userID = result.userId;
                CreditModule.currentCredits = result.credits;
                window.storage.set('credits', result.credits);
                window.storage.set('profile_completed', true);
                
                if (currentOverlay && currentOverlay.parentNode) {
                    currentOverlay.remove();
                }
                
                updateCreditsDisplay();
                showToast('✅ Connecté ! ' + result.credits + ' crédits disponibles.');
            } else {
                showToast('❌ ' + (result.error || 'Erreur de connexion'));
                const passwordInput = document.querySelector('#switchPasswordContact, #switchPasswordAdmin');
                if (passwordInput) {
                    passwordInput.value = '';
                    passwordInput.focus();
                }
            }
        } catch (e) {
            showToast('Erreur réseau : ' + e.message);
        }
    }

    // ============================================================
    // POPUP LOGO (Admin ou Contact)
    // ============================================================

    async function openLogoPopup() {
        try {
            const response = await fetch(
                'https://zhvdyjpevrqteirqeztb.supabase.co/rest/v1/users?select=user_role&user_id=eq.' + encodeURIComponent(CreditModule.userID),
                {
                    headers: {
                        'apikey': CreditModule.config.anonKey,
                        'Authorization': 'Bearer ' + CreditModule.config.anonKey,
                    },
                }
            );
            
            const users = await response.json();
            
            if (users && users.length > 0) {
                const role = (users[0].user_role || '').toLowerCase();
                if (role === 'admin' || role === 'quicktext') {
                    showAdminAuthPopup();
                    return;
                }
            }
            
            showContactPopup();
        } catch (e) {
            showContactPopup();
        }
    }

    function showContactPopup() {
        const overlay = document.createElement('div');
        overlay.className = 'popup-overlay popup-blocking';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.style.zIndex = '35000';
        
        overlay.innerHTML = `
            <div class="popup-dialog">
                <div class="popup-icon">
                    <svg viewBox="0 0 24 24" fill="none" width="28" height="28">
                        <rect x="5" y="2" width="14" height="20" rx="3" stroke="#b07cc6" stroke-width="1.8"/>
                        <line x1="12" y1="17" x2="12" y2="17.01" stroke="#b07cc6" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </div>
                <div class="popup-title">Service Client</div>
                <div class="popup-message">
                    Pour toute assistance, contactez-nous :<br><br>
                    <strong style="font-size: 1.2rem; color: var(--accent-light);">620 99 46 46</strong>
                </div>
                <div class="popup-buttons" style="flex-direction: column; gap: 8px;">
                    <a href="https://wa.me/237620994646" target="_blank" rel="noopener" 
                       style="text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 8px; 
                              padding: 12px; background: #25D366; color: white; border-radius: var(--radius-sm); 
                              font-size: 0.9rem; font-weight: 600; font-family: inherit;">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                        WhatsApp
                    </a>
                    <button class="popup-btn popup-btn-cancel" id="closeContactPopup" style="flex: none; width: 100%;">Fermer</button>
                </div>
                <p style="margin-top: 16px; font-size: 0.75rem;">
                    <a href="#" id="showSwitchAccountContact" style="color: var(--text-muted); text-decoration: underline;">Changer de compte</a>
                </p>
                <div id="switchAccountSectionContact" style="display: none; margin-top: 12px;">
                    <input type="tel" class="popup-input" id="switchPhoneContact" placeholder="Numéro (ex: 696271312)" autocomplete="off" inputmode="numeric" pattern="[0-9]*" maxlength="9">
                    <input type="password" class="popup-input" id="switchPasswordContact" placeholder="Mot de passe" autocomplete="off">
                    <button class="popup-btn popup-btn-confirm" id="switchAccountBtnContact" style="width: 100%;">Se connecter</button>
                </div>
                <p style="margin-top: 16px; font-size: 0.75rem;">
                    <a href="#" id="showChangePasswordContact" style="color: var(--text-muted); text-decoration: underline;">Changer mon mot de passe</a>
                </p>
                <div id="changePasswordSectionContact" style="display: none; margin-top: 12px;">
                    <input type="tel" class="popup-input" id="changePhoneContact" placeholder="Votre numéro" autocomplete="off" inputmode="numeric" pattern="[0-9]*" maxlength="9">
                    <input type="password" class="popup-input" id="changeOldPasswordContact" placeholder="Ancien mot de passe" autocomplete="off">
                    <input type="password" class="popup-input" id="changeNewPasswordContact" placeholder="Nouveau mot de passe" autocomplete="off" minlength="6">
                    <button class="popup-btn popup-btn-confirm" id="changePasswordBtnContact" style="width: 100%;">Modifier</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        function closeContact() {
            if (overlay.parentNode) overlay.remove();
        }
        
        overlay.querySelector('#closeContactPopup').addEventListener('click', closeContact);
        
        // Changer de compte
        overlay.querySelector('#showSwitchAccountContact').addEventListener('click', (e) => {
            e.preventDefault();
            overlay.querySelector('#switchAccountSectionContact').style.display = 'block';
            setTimeout(() => overlay.querySelector('#switchPhoneContact')?.focus(), 100);
        });
        
        overlay.querySelector('#switchAccountBtnContact').addEventListener('click', async () => {
            const phone = overlay.querySelector('#switchPhoneContact').value.trim();
            const password = overlay.querySelector('#switchPasswordContact').value.trim();
            
            if (!phone || !password) {
                showToast('⚠️ Veuillez remplir tous les champs.');
                return;
            }
            
            if (!/^[67]\d{8}$/.test(phone)) {
                showToast('📱 Numéro invalide. Format : 696271312.');
                return;
            }
            
            await switchToAccount(phone, password, overlay);
        });
        
        // Changer le mot de passe
        overlay.querySelector('#showChangePasswordContact').addEventListener('click', (e) => {
            e.preventDefault();
            overlay.querySelector('#changePasswordSectionContact').style.display = 'block';
            setTimeout(() => overlay.querySelector('#changePhoneContact')?.focus(), 100);
        });

        overlay.querySelector('#changePasswordBtnContact').addEventListener('click', async () => {
            const phone = overlay.querySelector('#changePhoneContact').value.trim();
            const oldPassword = overlay.querySelector('#changeOldPasswordContact').value.trim();
            const newPassword = overlay.querySelector('#changeNewPasswordContact').value.trim();
            
            if (!phone || !oldPassword || !newPassword) {
                showToast('⚠️ Veuillez remplir tous les champs.');
                return;
            }
            
            if (!/^[67]\d{8}$/.test(phone)) {
                showToast('📱 Numéro invalide.');
                return;
            }
            
            if (newPassword.length < 6) {
                showToast('🔒 Le nouveau mot de passe doit contenir au moins 6 caractères.');
                return;
            }
            
            const btn = overlay.querySelector('#changePasswordBtnContact');
            btn.disabled = true;
            btn.textContent = '⏳ Modification...';
            
            try {
                const loginResponse = await fetch(
                    'https://zhvdyjpevrqteirqeztb.supabase.co/functions/v1/auth-user',
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + CreditModule.config.anonKey,
                            'apikey': CreditModule.config.anonKey,
                        },
                        body: JSON.stringify({
                            action: 'login',
                            phone: phone,
                            password: oldPassword,
                        }),
                    }
                );
                
                const loginResult = await loginResponse.json();
                
                if (!loginResult.success) {
                    showToast('❌ ' + (loginResult.error || 'Numéro ou mot de passe incorrect'));
                    btn.disabled = false;
                    btn.textContent = 'Modifier';
                    return;
                }
                
                const changeResponse = await fetch(
                    'https://zhvdyjpevrqteirqeztb.supabase.co/functions/v1/auth-user',
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + CreditModule.config.anonKey,
                            'apikey': CreditModule.config.anonKey,
                        },
                        body: JSON.stringify({
                            action: 'change_password',
                            userId: loginResult.user.user_id,
                            oldPassword: oldPassword,
                            newPassword: newPassword,
                        }),
                    }
                );
                
                const changeResult = await changeResponse.json();
                
                if (changeResult.success) {
                    showToast('✅ Mot de passe modifié avec succès !');
                    overlay.querySelector('#changePasswordSectionContact').style.display = 'none';
                    overlay.querySelector('#changePhoneContact').value = '';
                    overlay.querySelector('#changeOldPasswordContact').value = '';
                    overlay.querySelector('#changeNewPasswordContact').value = '';
                } else {
                    showToast('❌ ' + (changeResult.error || 'Erreur'));
                }
            } catch (e) {
                showToast('Erreur réseau : ' + e.message);
            } finally {
                btn.disabled = false;
                btn.textContent = 'Modifier';
            }
        });
    }

    function showAdminAuthPopup() {
        const overlay = document.createElement('div');
        overlay.className = 'popup-overlay popup-blocking';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.style.zIndex = '35000';
        
        overlay.innerHTML = `
            <div class="popup-dialog">
                <div class="popup-icon">
                    <svg viewBox="0 0 24 24" fill="none" width="28" height="28">
                        <rect x="3" y="11" width="18" height="11" rx="2" stroke="#b07cc6" stroke-width="1.8"/>
                        <path d="M7 11V7a5 5 0 0110 0v4" stroke="#b07cc6" stroke-width="1.8" stroke-linecap="round"/>
                        <circle cx="12" cy="16" r="1" fill="#b07cc6"/>
                    </svg>
                </div>
                <div class="popup-title">Accès administrateur</div>
                <div class="popup-message">Entrez le mot de passe pour accéder au tableau de bord.</div>
                <input type="password" class="popup-input" id="adminAuthPassword" placeholder="Mot de passe..." autocomplete="off">
                <div class="popup-buttons">
                    <button class="popup-btn popup-btn-cancel" id="cancelAdminAuth">Annuler</button>
                    <button class="popup-btn popup-btn-confirm" id="confirmAdminAuth">Accéder</button>
                </div>
                <p style="margin-top: 12px; font-size: 0.75rem;">
                    <a href="#" id="showSwitchAccountAdmin" style="color: var(--text-muted); text-decoration: underline;">Changer de compte</a>
                </p>
                <div id="switchAccountSectionAdmin" style="display: none; margin-top: 12px;">
                    <input type="tel" class="popup-input" id="switchPhoneAdmin" placeholder="Numéro (ex: 696271312)" autocomplete="off" inputmode="numeric" pattern="[0-9]*" maxlength="9">
                    <input type="password" class="popup-input" id="switchPasswordAdmin" placeholder="Mot de passe" autocomplete="off">
                    <button class="popup-btn popup-btn-confirm" id="switchAccountBtnAdmin" style="width: 100%;">Se connecter</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        const passwordInput = overlay.querySelector('#adminAuthPassword');
        const confirmBtn = overlay.querySelector('#confirmAdminAuth');
        const cancelBtn = overlay.querySelector('#cancelAdminAuth');
        
        function closeAuth() {
            if (overlay.parentNode) overlay.remove();
        }
        
        cancelBtn.addEventListener('click', closeAuth);
        
        setTimeout(() => { if (passwordInput) passwordInput.focus(); }, 200);
        
        confirmBtn.addEventListener('click', async () => {
            const password = passwordInput.value.trim();
            if (!password) {
                showToast('⚠️ Veuillez entrer le mot de passe.');
                return;
            }
            
            confirmBtn.disabled = true;
            confirmBtn.textContent = '⏳ Vérification...';
            
            try {
                const response = await fetch(
                    'https://zhvdyjpevrqteirqeztb.supabase.co/functions/v1/verify-password',
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + CreditModule.config.anonKey,
                            'apikey': CreditModule.config.anonKey,
                        },
                        body: JSON.stringify({
                            action: 'verify',
                            password: password,
                        }),
                    }
                );
                
                const result = await response.json();
                
                if (result.success) {
                    closeAuth();
                    window._adminAuthenticated = true;
                    openAdminDashboardInternal();
                } else {
                    showToast('🔒 ' + (result.message || 'Mot de passe incorrect'));
                    passwordInput.value = '';
                    passwordInput.focus();
                }
            } catch (e) {
                showToast('Erreur réseau : ' + e.message);
            } finally {
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Accéder';
            }
        });
        
        passwordInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                confirmBtn.click();
            }
        });
        
        // Changer de compte
        overlay.querySelector('#showSwitchAccountAdmin').addEventListener('click', (e) => {
            e.preventDefault();
            overlay.querySelector('#switchAccountSectionAdmin').style.display = 'block';
            setTimeout(() => overlay.querySelector('#switchPhoneAdmin')?.focus(), 100);
        });
        
        overlay.querySelector('#switchAccountBtnAdmin').addEventListener('click', async () => {
            const phone = overlay.querySelector('#switchPhoneAdmin').value.trim();
            const password = overlay.querySelector('#switchPasswordAdmin').value.trim();
            
            if (!phone || !password) {
                showToast('⚠️ Veuillez remplir tous les champs.');
                return;
            }
            
            if (!/^[67]\d{8}$/.test(phone)) {
                showToast('📱 Numéro invalide. Format : 696271312.');
                return;
            }
            
            await switchToAccount(phone, password, overlay);
        });
    }

    // ============================================================
    // TABLEAU DE BORD ADMINISTRATEUR
    // ============================================================

    async function openAdminDashboard() {
        if (window._adminAuthenticated) {
            openAdminDashboardInternal();
        } else {
            showAdminAuthPopup();
        }
    }

    async function openAdminDashboardInternal() {
        const overlay = document.getElementById('adminDashboardOverlay');
        if (!overlay) return;
        try {
            const response = await fetch(
                'https://zhvdyjpevrqteirqeztb.supabase.co/functions/v1/admin-dashboard',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + CreditModule.config.anonKey,
                        'apikey': CreditModule.config.anonKey,
                    },
                    body: JSON.stringify({
                        action: 'getDashboard',
                        userId: CreditModule.userID,
                    }),
                }
            );
            const result = await response.json();
            if (result.success) {
                overlay.style.display = 'flex';
                updateAdminDashboard(result.data);
                setupAdminTabs();
            } else {
                showToast('🔒 ' + (result.error || 'Accès refusé'));
                overlay.style.display = 'none';
            }
        } catch (e) {
            showToast('Erreur : ' + e.message);
            overlay.style.display = 'none';
        }
    }

    function closeAdminDashboard() {
        const overlay = document.getElementById('adminDashboardOverlay');
        if (overlay) overlay.style.display = 'none';
        window._adminAuthenticated = false;
    }

    async function loadAdminDashboard(isFiltered) {
        const searchName = DOM.filterName?.value.trim() || '';
        const searchPhone = DOM.filterPhone?.value.trim() || '';
        if (isFiltered && !searchName && !searchPhone) {
            showToast('Entrez un nom ou un numéro pour filtrer');
            return;
        }
        try {
            const response = await fetch(
                'https://zhvdyjpevrqteirqeztb.supabase.co/functions/v1/admin-dashboard',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + CreditModule.config.anonKey,
                        'apikey': CreditModule.config.anonKey,
                    },
                    body: JSON.stringify({
                        action: 'getDashboard',
                        userId: CreditModule.userID,
                        searchName: searchName || null,
                        searchPhone: searchPhone || null,
                    }),
                }
            );
            const result = await response.json();
            if (result.success) {
                updateAdminDashboard(result.data);
            } else {
                showToast('Erreur : ' + (result.error || 'Chargement échoué'));
            }
        } catch (e) {
            showToast('Erreur réseau');
        }
    }

    function updateAdminDashboard(data) {
        const { stats, users, servicesRanking } = data;
        
        document.getElementById('statUsers').textContent = stats.totalUsers;
        document.getElementById('statPurchased').textContent = stats.totalCreditsPurchased;
        document.getElementById('statUsed').textContent = stats.totalCreditsUsed;
        document.getElementById('statUnused').textContent = stats.totalCreditsUnused;
        document.getElementById('statAmount').textContent = stats.totalAmountXAF.toLocaleString() + ' XAF';
        
        const roleCounts = {};
        users.forEach(u => {
            const role = u.user_role || 'utilisateur';
            roleCounts[role] = (roleCounts[role] || 0) + 1;
        });
        
        let topRole = '-';
        let topRoleCount = 0;
        for (const [role, count] of Object.entries(roleCounts)) {
            if (count > topRoleCount) {
                topRole = role;
                topRoleCount = count;
            }
        }
        
        const topRoleEl = document.getElementById('adminTopRole');
        const topRoleName = document.getElementById('topRoleName');
        if (topRoleEl && topRoleName) {
            topRoleEl.style.display = 'block';
            topRoleName.textContent = topRole + ' (' + topRoleCount + ' utilisateur' + (topRoleCount > 1 ? 's' : '') + ')';
        }
        
        const tbody = document.getElementById('adminTableBody');
        if (tbody) {
            if (users.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">Aucun utilisateur trouvé</td></tr>';
            } else {
                tbody.innerHTML = users.map(u => `
                    <tr>
                        <td>${escapeHTML(u.user_name || 'N/A')}</td>
                        <td>${escapeHTML(u.user_tel || 'N/A')}</td>
                        <td>${escapeHTML(u.user_role || 'user')}</td>
                        <td>${u.credits}</td>
                        <td>${new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
                    </tr>
                `).join('');
            }
        }
        
        const totalServices = servicesRanking ? servicesRanking.length : 0;
        let totalCreditsMoved = 0;
        let totalRevenue = 0;
        
        if (servicesRanking) {
            servicesRanking.forEach(s => {
                totalCreditsMoved += s.totalCredits;
                totalRevenue += s.totalXAF;
            });
        }
        
        document.getElementById('statTotalServices').textContent = totalServices;
        document.getElementById('statTotalCreditsMoved').textContent = totalCreditsMoved;
        document.getElementById('statTotalRevenue').textContent = totalRevenue.toLocaleString() + ' XAF';
        
        const servicesRankingEl = document.getElementById('servicesRanking');
        if (servicesRankingEl) {
            if (!servicesRanking || servicesRanking.length === 0) {
                servicesRankingEl.innerHTML = '<p style="color: var(--text-muted);padding:12px;">Aucune transaction</p>';
            } else {
                const maxCredits = servicesRanking[0].totalCredits;
                servicesRankingEl.innerHTML = servicesRanking.map((s, i) => `
                    <div class="ranking-item">
                        <span class="ranking-position">#${i + 1}</span>
                        <div class="ranking-info">
                            <span class="ranking-name">${escapeHTML(s.name)}</span>
                            <span class="ranking-details">
                                ${s.count} transaction${s.count > 1 ? 's' : ''} · 
                                ${s.totalCredits} crédits · 
                                <strong>${s.totalXAF.toLocaleString()} XAF</strong>
                            </span>
                        </div>
                        <span class="ranking-bar" style="width: ${Math.max(4, (s.totalCredits / maxCredits) * 150)}px;"></span>
                    </div>
                `).join('');
            }
        }
        
        const sortedRoles = Object.entries(roleCounts).sort((a, b) => b[1] - a[1]);
        const rolesRanking = document.getElementById('rolesRanking');
        if (rolesRanking) {
            if (sortedRoles.length === 0) {
                rolesRanking.innerHTML = '<p style="color: var(--text-muted);padding:12px;">Aucun rôle</p>';
            } else {
                const maxCount = sortedRoles[0][1];
                rolesRanking.innerHTML = sortedRoles.map(([name, count], i) => `
                    <div class="ranking-item">
                        <span class="ranking-position">#${i + 1}</span>
                        <span class="ranking-name">${escapeHTML(name)}</span>
                        <span class="ranking-bar" style="width: ${Math.max(4, (count / maxCount) * 150)}px;"></span>
                        <span class="ranking-count">${count} utilisateur${count > 1 ? 's' : ''}</span>
                    </div>
                `).join('');
            }
        }
    }

    function setupAdminTabs() {
        const tabs = document.querySelectorAll('.admin-tab');
        const tabUsers = document.getElementById('tabUsers');
        const tabTransactions = document.getElementById('tabTransactions');
        const tabGestion = document.getElementById('tabGestion');
        const adminFilters = document.getElementById('adminFilters');
        
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                const tabName = tab.dataset.tab;
                
                tabUsers.style.display = 'none';
                tabTransactions.style.display = 'none';
                if (tabGestion) tabGestion.style.display = 'none';
                
                if (adminFilters) {
                    adminFilters.style.display = (tabName === 'users') ? 'flex' : 'none';
                }
                
                if (tabName === 'users') {
                    tabUsers.style.display = 'block';
                } else if (tabName === 'transactions') {
                    tabTransactions.style.display = 'block';
                } else if (tabName === 'gestion') {
                    if (tabGestion) tabGestion.style.display = 'block';
                    setupGestionTab();
                }
            });
        });
    }

    function setupGestionTab() {
        loadGestionUsers();
        
        const searchBtn = document.getElementById('gestionSearchBtn');
        if (searchBtn) {
            const newSearchBtn = searchBtn.cloneNode(true);
            searchBtn.parentNode.replaceChild(newSearchBtn, searchBtn);
            newSearchBtn.addEventListener('click', loadGestionUsers);
        }
    }

    async function loadGestionUsers() {
        const tbody = document.getElementById('gestionTableBody');
        if (!tbody) return;
        
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">Chargement...</td></tr>';
        
        const searchName = document.getElementById('gestionFilterName')?.value.trim() || '';
        
        try {
            const response = await fetch(
                'https://zhvdyjpevrqteirqeztb.supabase.co/functions/v1/admin-dashboard',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + CreditModule.config.anonKey,
                        'apikey': CreditModule.config.anonKey,
                    },
                    body: JSON.stringify({
                        action: 'getDashboard',
                        userId: CreditModule.userID,
                        searchName: searchName || null,
                    }),
                }
            );
            
            const result = await response.json();
            
            if (result.success && result.data.users.length > 0) {
                tbody.innerHTML = result.data.users.map(u => `
                    <tr>
                        <td>${escapeHTML(u.user_name || 'N/A')}</td>
                        <td>${escapeHTML(u.user_tel || 'N/A')}</td>
                        <td>${escapeHTML(u.user_role || 'user')}</td>
                        <td>${u.credits}</td>
                        <td style="display: flex; gap: 4px; flex-wrap: wrap;">
                            <button class="filter-btn" style="padding:4px 8px;font-size:0.7rem;" 
                                    onclick="editGestionUser('${u.user_id}', '${escapeHTML(u.user_name || '')}', '${escapeHTML(u.user_tel || '')}', '${escapeHTML(u.user_role || 'user')}', ${u.credits})">
                                Modifier
                            </button>
                            <button class="filter-btn-secondary" style="padding:4px 8px;font-size:0.7rem;" 
                                    onclick="deleteGestionUser('${u.user_id}', '${escapeHTML(u.user_name || 'N/A')}')">
                                Supprimer
                            </button>
                            <button class="filter-btn" style="padding:4px 8px;font-size:0.7rem; background: #f39c12;" 
                                    onclick="resetUserPassword('${u.user_id}', '${escapeHTML(u.user_name || 'N/A')}')">
                                🔑 MDP
                            </button>
                        </td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">Aucun utilisateur trouvé</td></tr>';
            }
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">Erreur de chargement</td></tr>';
        }
    }

    window.editGestionUser = function(userId, name, phone, role, credits) {
        document.getElementById('editUserId').value = userId;
        document.getElementById('editUserName').value = name;
        document.getElementById('editUserPhone').value = phone;
        document.getElementById('editUserRole').value = role;
        document.getElementById('editUserCredits').value = credits;
        document.getElementById('editUserPopup').style.display = 'block';
    };

    window.deleteGestionUser = function(userId, userName) {
        showConfirmPopup(
            'Supprimer utilisateur',
            'Voulez-vous vraiment supprimer "' + userName + '" ?\nCette action est irréversible.',
            '<svg viewBox="0 0 24 24" fill="none" width="28" height="28"><path d="M4 6h16" stroke="#f08080" stroke-width="1.8" stroke-linecap="round"/><path d="M5 6l1 14a1 1 0 001 1h10a1 1 0 001-1l1-14" stroke="#f08080" stroke-width="1.8" fill="none"/></svg>',
            'Supprimer',
            async () => {
                try {
                    const response = await fetch(
                        'https://zhvdyjpevrqteirqeztb.supabase.co/functions/v1/manage-users',
                        {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': 'Bearer ' + CreditModule.config.anonKey,
                                'apikey': CreditModule.config.anonKey,
                            },
                            body: JSON.stringify({
                                action: 'delete',
                                userId: CreditModule.userID,
                                targetUserId: userId,
                            }),
                        }
                    );
                    
                    const result = await response.json();
                    if (result.success) {
                        showToast('✅ Utilisateur supprimé');
                        await loadAdminDashboard(false);
                        loadGestionUsers();
                    } else {
                        showToast('❌ ' + (result.error || 'Erreur'));
                    }
                } catch (e) {
                    showToast('Erreur réseau');
                }
            }
        );
    };

    window.resetUserPassword = function(userId, userName) {
        showConfirmPopup(
            'Réinitialiser le mot de passe',
            'Voulez-vous réinitialiser le mot de passe de "' + userName + '" ?\n\nUn mot de passe aléatoire sera généré.',
            '<svg viewBox="0 0 24 24" fill="none" width="28" height="28"><rect x="3" y="11" width="18" height="11" rx="2" stroke="#f39c12" stroke-width="1.8"/><path d="M7 11V7a5 5 0 0110 0v4" stroke="#f39c12" stroke-width="1.8" stroke-linecap="round"/></svg>',
            'Réinitialiser',
            async () => {
                try {
                    const response = await fetch(
                        'https://zhvdyjpevrqteirqeztb.supabase.co/functions/v1/auth-user',
                        {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': 'Bearer ' + CreditModule.config.anonKey,
                                'apikey': CreditModule.config.anonKey,
                            },
                            body: JSON.stringify({
                                action: 'reset_password',
                                userId: userId,
                            }),
                        }
                    );
                    
                    const result = await response.json();
                    if (result.success) {
                        showToast('✅ Nouveau mot de passe : ' + result.password);
                    } else {
                        showToast('❌ ' + (result.error || 'Erreur'));
                    }
                } catch (e) {
                    showToast('Erreur réseau');
                }
            }
        );
    };

    document.addEventListener('click', async (e) => {
        if (e.target.id === 'saveEditBtn') {
            const userId = document.getElementById('editUserId').value;
            const updates = {
                user_name: document.getElementById('editUserName').value.trim(),
                user_tel: document.getElementById('editUserPhone').value.trim(),
                user_role: document.getElementById('editUserRole').value,
                credits: parseInt(document.getElementById('editUserCredits').value) || 0,
            };
            
            try {
                const response = await fetch(
                    'https://zhvdyjpevrqteirqeztb.supabase.co/functions/v1/manage-users',
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + CreditModule.config.anonKey,
                            'apikey': CreditModule.config.anonKey,
                        },
                        body: JSON.stringify({
                            action: 'update',
                            userId: CreditModule.userID,
                            targetUserId: userId,
                            updates: updates,
                        }),
                    }
                );
                
                const result = await response.json();
                if (result.success) {
                    showToast('✅ Utilisateur mis à jour');
                    document.getElementById('editUserPopup').style.display = 'none';
                    await loadAdminDashboard(false);
                    loadGestionUsers();
                } else {
                    showToast('❌ ' + (result.error || 'Erreur'));
                }
            } catch (e) {
                showToast('Erreur réseau');
            }
        }
        
        if (e.target.id === 'cancelEditBtn') {
            document.getElementById('editUserPopup').style.display = 'none';
        }
    });

    // ============================================================
    // POP-UP ENREGISTREMENT UTILISATEUR
    // ============================================================

    function showRegisterPopup() {
        if (CreditModule.isProfileCompleted()) return;
        
        const overlay = document.getElementById('registerOverlay');
        if (!overlay) return;
        
        overlay.style.display = 'flex';
        
        setTimeout(() => {
            document.getElementById('regPhone')?.focus();
        }, 400);
        
        const roleSelect = document.getElementById('regRole');
        const roleOtherInput = document.getElementById('regRoleOther');
        
        if (roleSelect && roleOtherInput) {
            roleSelect.value = '';
            roleOtherInput.style.display = 'none';
            roleOtherInput.value = '';
            
            roleSelect.addEventListener('change', () => {
                if (roleSelect.value === 'Autre') {
                    roleOtherInput.style.display = 'block';
                    setTimeout(() => roleOtherInput.focus(), 100);
                } else {
                    roleOtherInput.style.display = 'none';
                    roleOtherInput.value = '';
                }
            });
        }
        
        const submitBtn = document.getElementById('registerSubmit');
        if (submitBtn) {
            const newBtn = submitBtn.cloneNode(true);
            submitBtn.parentNode.replaceChild(newBtn, submitBtn);
            
            newBtn.addEventListener('click', async function handler(e) {
                e.preventDefault();
                
                const phone = document.getElementById('regPhone')?.value.trim();
                const name = document.getElementById('regName')?.value.trim();
                const password = document.getElementById('regPassword')?.value.trim();
                
                if (!phone) {
                    showToast('⚠️ Le numéro de téléphone est obligatoire.');
                    document.getElementById('regPhone')?.focus();
                    return;
                }
                
                if (!/^[67]\d{8}$/.test(phone)) {
                    showToast('📱 Numéro invalide. Format : 696271312 (9 chiffres).');
                    document.getElementById('regPhone')?.focus();
                    return;
                }
                
                if (!password || password.length < 6) {
                    showToast('🔒 Mot de passe obligatoire (6 caractères minimum).');
                    document.getElementById('regPassword')?.focus();
                    return;
                }
                
                if (!name) {
                    showToast('⚠️ Veuillez entrer votre nom complet.');
                    document.getElementById('regName')?.focus();
                    return;
                }
                
                let role = document.getElementById('regRole')?.value;
                if (role === 'Autre') {
                    role = document.getElementById('regRoleOther')?.value.trim();
                    if (!role) {
                        showToast('⚠️ Veuillez préciser votre profession.');
                        document.getElementById('regRoleOther')?.focus();
                        return;
                    }
                }
                
                if (!role) {
                    showToast('⚠️ Veuillez sélectionner votre rôle.');
                    document.getElementById('regRole')?.focus();
                    return;
                }
                
                newBtn.disabled = true;
                newBtn.textContent = '⏳ Création...';
                
                try {
                    const response = await fetch(
                        'https://zhvdyjpevrqteirqeztb.supabase.co/functions/v1/auth-user',
                        {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': 'Bearer ' + CreditModule.config.anonKey,
                                'apikey': CreditModule.config.anonKey,
                            },
                            body: JSON.stringify({
                                action: 'register',
                                phone: phone,
                                password: password,
                                userName: name,
                                userRole: role,
                                userId: CreditModule.userID,
                            }),
                        }
                    );
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        CreditModule.currentCredits = 100;
                        window.storage.set('credits', 100);
                        window.storage.set('profile_completed', true);
                        overlay.style.display = 'none';
                        updateCreditsDisplay();
                        showToast('✅ Bienvenue ' + name + ' !');
                    } else {
                        showToast('❌ ' + (result.error || 'Erreur'));
                        document.getElementById('regPassword').value = '';
                        document.getElementById('regPassword')?.focus();
                        newBtn.disabled = false;
                        newBtn.textContent = 'Enregistrer';
                    }
                } catch (e) {
                    showToast('Erreur réseau : ' + e.message);
                    newBtn.disabled = false;
                    newBtn.textContent = 'Enregistrer';
                }
            });
        }
    }

    // ============================================================
    // POP-UP RECHARGE
    // ============================================================

    function showRechargePopup() {
        if (document.querySelector('.popup-overlay')) return;

        const overlay = document.createElement('div');
        overlay.className = 'popup-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');

        const rechargeSection = document.getElementById('rechargeSection').cloneNode(true);
        rechargeSection.style.display = 'block';
        rechargeSection.style.position = 'relative';

        const creditDisplay = rechargeSection.querySelector('#creditDisplay');
        if (creditDisplay) creditDisplay.textContent = CreditModule.currentCredits;

        const dialog = document.createElement('div');
        dialog.className = 'popup-dialog';
        dialog.appendChild(rechargeSection);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        function close() {
            if (overlay.parentNode) overlay.remove();
        }

        const closeBtn = rechargeSection.querySelector('#closeRechargePopup');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                close();
            });
        }

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        const confirmBtn = rechargeSection.querySelector('#confirmRecharge');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', async () => {
                const phoneInput = rechargeSection.querySelector('#phoneNumber');
                const amountInput = rechargeSection.querySelector('#amountInput');
                const phone = phoneInput?.value.trim();
                const amountStr = amountInput?.value.trim();

                if (!/^[67]\d{8}$/.test(phone)) {
                    showToast('📱 Numéro invalide. Exemple : 696271312');
                    phoneInput?.focus();
                    return;
                }

                const amount = parseInt(amountStr, 10);
                if (isNaN(amount) || amount < 1 || amount > 1000000) {
                    showToast('💵 Montant invalide (1 à 1 000 000 XAF).');
                    amountInput?.focus();
                    return;
                }

                confirmBtn.disabled = true;
                confirmBtn.textContent = '⏳ Patientez...';

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 45000);

                try {
                    const supabaseUrl = 'https://zhvdyjpevrqteirqeztb.supabase.co';
                    const anonKey = CreditModule.config.anonKey;

                    const response = await fetch(
                        `${supabaseUrl}/functions/v1/handle-recharge`,
                        {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': 'Bearer ' + anonKey,
                                'apikey': anonKey,
                            },
                            body: JSON.stringify({
                                phone: phone,
                                amount: amount,
                                user_id: CreditModule.userID,
                            }),
                            signal: controller.signal,
                        }
                    );

                    clearTimeout(timeoutId);

                    let result;
                    try {
                        result = await response.json();
                    } catch (parseError) {
                        const rawText = await response.text();
                        throw new Error('Réponse invalide (HTTP ' + response.status + ')');
                    }

                    if (result.success) {
                        await CreditModule.afterRecharge();
                        updateCreditsDisplay();
                        showToast('✅ Recharge réussie ! ' + result.credits_added + ' crédits ajoutés.');
                        close();
                    } else {
                        const errorMsg = result.message || result.error || result.detail || 'Échec de la transaction';
                        showToast('❌ ' + errorMsg);
                    }
                } catch (e) {
                    clearTimeout(timeoutId);
                    if (e.name === 'AbortError') {
                        showToast('⏰ Délai dépassé. Vérifiez votre connexion.');
                    } else if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
                        showToast('📡 Pas de connexion internet.');
                    } else if (e.message.includes('HTTP')) {
                        showToast('🔧 ' + e.message);
                    } else {
                        showToast('⚠️ Erreur : ' + e.message);
                    }
                } finally {
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = 'Recharger';
                }
            });
        }
    }

    // ============================================================
    // POP-UPS GÉNÉRIQUES
    // ============================================================

    function showConfirmPopup(title, message, iconSVG, confirmText, onConfirm) {
        const existing = document.querySelector('.popup-overlay');
        if (existing) existing.remove();
        const overlay = document.createElement('div');
        overlay.className = 'popup-overlay popup-blocking';
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
    }

    function showExportPDFPopup(text, iconSVG, defaultTitle, estimatedPages, pdfCost) {
        const existing = document.querySelector('.popup-overlay');
        if (existing) existing.remove();
        const overlay = document.createElement('div');
        overlay.className = 'popup-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.innerHTML = `
            <div class="popup-dialog">
                <div class="popup-icon">${iconSVG}</div>
                <div class="popup-title">Export PDF</div>
                <div class="popup-message">
                    Entrez le titre du document.<br>
                    <small style="color: var(--text-muted);">
                        📄 ~${estimatedPages} page(s) · 💰 ${pdfCost} crédits · 📎 TXT déjà téléchargé
                    </small>
                </div>
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
        let logoDataURL = null;
        let logoPosition = 'center';
        let themeColor = '#9b59b6';
        let resolved = false;
        hideBrandingCheckbox.addEventListener('change', () => {
            if (hideBrandingCheckbox.checked) extraOptions.classList.add('visible');
            else extraOptions.classList.remove('visible');
        });
        logoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => { logoDataURL = ev.target.result; };
            reader.readAsDataURL(file);
        });
        positionGroup.addEventListener('click', (e) => {
            const btn = e.target.closest('.popup-position-btn');
            if (!btn) return;
            positionGroup.querySelectorAll('.popup-position-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            logoPosition = btn.dataset.pos;
        });
        hexInput.addEventListener('input', () => {
            let val = hexInput.value.trim();
            if (val && !val.startsWith('#')) val = '#' + val;
            hexInput.value = val;
            themeColor = val || '#9b59b6';
            if (/^#[0-9a-f]{6}$/i.test(val)) hexPreview.style.background = val;
        });
        function close() {
            if (resolved) return;
            resolved = true;
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
            let finalColor = hexInput?.value.trim() || '#9b59b6';
            if (!/^#[0-9a-f]{6}$/i.test(finalColor)) finalColor = '#9b59b6';
            const customOptions = hideBranding ? {
                logoDataURL, logoPosition, themeColor: finalColor, showDate, showPagination
            } : {
                showDate: true, showPagination: true, themeColor: '#9b59b6'
            };
            close();
            setTimeout(() => {
                try {
                    if (typeof PDFExportModule !== 'undefined') {
                        PDFExportModule.exportToPDF(text, finalTitle, hideBranding, customOptions);
                        CreditModule.useCredits('pdf_export', pdfCost)
                            .then(() => { updateCreditsDisplay(); showToast('✅ PDF exporté ! (' + pdfCost + ' crédits)'); })
                            .catch(() => {});
                    } else throw new Error('Module PDF non disponible');
                } catch (e) { showToast('Erreur PDF: ' + e.message); }
            }, 250);
        }
        cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); close(); });
        confirmBtn.addEventListener('click', (e) => { e.stopPropagation(); confirm(); });
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        if (inputField) inputField.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); confirm(); } });
        setTimeout(() => { if (inputField) { inputField.focus(); inputField.select(); } }, 150);
        return overlay;
    }

    // ============================================================
    // EXPORT TXT
    // ============================================================

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
        showToast('📄 TXT exporté ! (' + text.length.toLocaleString() + ' car.)');
    }

    // ============================================================
    // ACTIONS
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
            const currentText = DOM.output?.value || '';
            const baseText = state._baseTextBeforeDictation || '';
            const newCharsCount = Math.max(0, currentText.length - baseText.length);
            if (newCharsCount > 0) {
                const dictationCost = CreditModule.getServiceCost('dictation', newCharsCount);
                try { await CreditModule.useCredits('dictation', dictationCost); updateCreditsDisplay(); } catch(e) {}
            }
            state._baseTextBeforeDictation = '';
            return;
        }
        if (CreditModule.currentCredits < 1) { showToast('💰 Crédits insuffisants pour la dictée.'); return; }
        try {
            if (navigator.permissions && navigator.permissions.query) {
                try { if ((await navigator.permissions.query({ name: 'microphone' })).state === 'denied') { showToast('🎤 Microphone bloqué.'); return; } } catch(e) {}
            }
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
            stream.getTracks().forEach(t => t.stop());
            state._lastInterimText = '';
            state._baseTextBeforeDictation = DOM.output ? DOM.output.value : '';
            await SpeechModule.startRecognition(state.currentLang, (fullText, interimText) => {
                const baseText = state._baseTextBeforeDictation || '';
                state.fullTranscript = baseText + fullText;
                let displayText = baseText + fullText;
                if (interimText && interimText.trim() && interimText !== state._lastInterimText) { displayText += interimText; state._lastInterimText = interimText; }
                if (DOM.output) { DOM.output.value = displayText; DOM.output.scrollTop = DOM.output.scrollHeight; }
            }, (error) => { showToast(error); resetRecordButton(); updateModeIndicator('Erreur'); state._baseTextBeforeDictation = ''; });
            setRecordButtonRecording();
            updateModeIndicator('🔴 Enregistrement...');
        } catch(e) { showToast('Erreur: ' + (e.message || 'Microphone indisponible')); resetRecordButton(); state._baseTextBeforeDictation = ''; }
    }

    async function handleTranslation() {
        const text = DOM.output ? DOM.output.value : '';
        if (!text || !text.trim()) { showToast('Aucun texte à traduire'); return; }
        const charCount = text.length;
        const translationCost = CreditModule.getServiceCost('translation', charCount);
        if (CreditModule.currentCredits < translationCost) { showToast('💰 Crédits insuffisants ! Coût : ' + translationCost + ' crédits'); return; }
        if (DOM.translateBtn) DOM.translateBtn.disabled = true;
        updateModeIndicator('🌐 Traduction...');
        try {
            const translated = await TranslationModule.translate(text, state.currentLang);
            if (DOM.output) DOM.output.value = translated;
            state.fullTranscript = translated;
            updateModeIndicator('✅ Traduit');
            await CreditModule.useCredits('translation', translationCost);
            updateCreditsDisplay();
            showToast('✅ Traduction terminée (' + translationCost + ' crédits)');
        } catch (e) { showToast('❌ Erreur : ' + e.message); }
        finally { if (DOM.translateBtn) DOM.translateBtn.disabled = false; }
    }

    function toggleSpeech() {
        if (SpeechModule.isSpeaking && !SpeechModule.isPaused) { SpeechModule.pauseSpeaking(); return; }
        if (SpeechModule.isPaused) { SpeechModule.resumeSpeaking(); return; }
        const text = DOM.output ? DOM.output.value : '';
        if (!text || !text.trim()) { showToast('Aucun texte à lire'); return; }
        const charCount = text.length;
        const speechCost = CreditModule.getServiceCost('speech_reading', charCount);
        if (CreditModule.currentCredits < speechCost) { showToast('💰 Crédits insuffisants !\nCoût : ' + speechCost + ' crédits'); return; }
        CreditModule.useCredits('speech_reading', speechCost).then(() => updateCreditsDisplay()).catch(() => {});
        SpeechModule.onStart = () => { if (DOM.playBtn) DOM.playBtn.querySelector('span:last-child').textContent = 'Pause'; };
        SpeechModule.onPause = () => { if (DOM.playBtn) DOM.playBtn.querySelector('span:last-child').textContent = 'Reprendre'; };
        SpeechModule.onResume = () => { if (DOM.playBtn) DOM.playBtn.querySelector('span:last-child').textContent = 'Pause'; };
        SpeechModule.onStop = () => { resetPlayButton(); };
        SpeechModule.onFinish = () => { resetPlayButton(); };
        const preferredVoice = DOM.voiceSelect ? DOM.voiceSelect.value : 'auto';
        SpeechModule.speak(text, state.currentLang, parseFloat(state.speechRate), preferredVoice);
    }

    function stopSpeech() { SpeechModule.stopSpeaking(); resetPlayButton(); }

    function handleIAAbort() {
        if (state.isProcessingIA) {
            AIModule.abort(); state.isProcessingIA = false;
            if (DOM.iaBtn) { DOM.iaBtn.disabled = false; DOM.iaBtn.querySelector('span:last-child').textContent = 'IA'; DOM.iaBtn.title = 'Lancer le traitement IA'; }
            if (DOM.progressBar) DOM.progressBar.style.display = 'none';
            if (DOM.progressFill) DOM.progressFill.style.width = '0%';
            updateModeIndicator('⏹ Interrompu');
        }
    }

    async function handleIA() {
        if (state.isProcessingIA) return;
        const text = DOM.output ? DOM.output.value : '';
        if (!text || !text.trim()) { showToast('Aucun texte à traiter'); return; }
        const charCount = text.length;
        const iaCost = calculateIACost(charCount);
        if (charCount > 20000) { const confirmed = await confirmLargeProcessing(charCount, iaCost); if (!confirmed) return; }
        if (CreditModule.currentCredits < iaCost) { showToast('💰 Crédits insuffisants ! Coût : ' + iaCost + ' crédits'); return; }
        state.isProcessingIA = true;
        let caracteresTraites = 0;
        if (DOM.iaBtn) { DOM.iaBtn.querySelector('span:last-child').textContent = '...'; DOM.iaBtn.title = 'Double-clic pour interrompre'; }
        if (DOM.progressBar) DOM.progressBar.style.display = 'block';
        if (DOM.progressFill) DOM.progressFill.style.width = '0%';
        updateModeIndicator('🤖 IA en cours...');
        let traitementReussi = false, traitementInterrompu = false, apiIndisponible = false;
        try {
            const result = await AIModule.processText(text, state.selectedAction, (current, total, label) => {
                const percent = Math.round((current / total) * 100);
                if (DOM.progressFill) DOM.progressFill.style.width = percent + '%';
                updateModeIndicator('🤖 ' + label);
                if (total > 0) caracteresTraites = Math.round((current / total) * charCount);
            });
            if (result && result.trim() && state.isProcessingIA) {
                if (DOM.output) DOM.output.value = result;
                state.fullTranscript = result;
                updateModeIndicator('✅ Terminé');
                if (DOM.formatInfo) DOM.formatInfo.textContent = result.length.toLocaleString() + ' caractères';
                traitementReussi = true; caracteresTraites = charCount;
            } else throw new Error('Résultat vide');
        } catch (e) {
            if (e.name === 'AbortError' || (e.message && e.message.includes('interrompu'))) traitementInterrompu = true;
            else if (e.message && (e.message.includes('Failed to fetch') || e.message.includes('NetworkError') || e.message.includes('timeout') || e.message.includes('429') || e.message.includes('503') || e.message.includes('502'))) apiIndisponible = true;
            else showToast('❌ Erreur IA : ' + (e.message || 'Erreur inconnue'));
        } finally {
            state.isProcessingIA = false;
            if (DOM.iaBtn) { DOM.iaBtn.disabled = false; DOM.iaBtn.querySelector('span:last-child').textContent = 'IA'; DOM.iaBtn.title = 'Lancer le traitement IA'; }
            setTimeout(() => { if (DOM.progressBar && !state.isProcessingIA) DOM.progressBar.style.display = 'none'; }, 2000);
        }
        if (traitementReussi) { await CreditModule.useCredits('ia_processing', iaCost); updateCreditsDisplay(); }
        else if (traitementInterrompu && caracteresTraites > 0) {
            const creditDebites = calculatePartialCost(charCount, caracteresTraites, iaCost);
            if (creditDebites > 0) { await CreditModule.useCredits('ia_processing', creditDebites); updateCreditsDisplay(); }
        }
    }

    function copyText() {
        const text = DOM.output ? DOM.output.value : '';
        if (!text || !text.trim()) { showToast('Aucun texte à copier'); return; }
        navigator.clipboard.writeText(text).then(() => showToast('Texte copié !')).catch(() => { if (DOM.output) { DOM.output.select(); document.execCommand('copy'); showToast('Texte copié !'); } });
    }

    async function handleExport() {
        const text = DOM.output ? DOM.output.value : '';
        if (!text || !text.trim()) { showToast('Aucun texte à exporter'); return; }
        exportTextFile(text);
        const charCount = text.length;
        const estimatedPages = Math.max(1, Math.ceil(charCount / 2500));
        const pdfCost = CreditModule.getServiceCost('pdf_export', null, estimatedPages);
        if (CreditModule.currentCredits < pdfCost) { showToast('⚠️ TXT exporté. Crédits insuffisants pour le PDF (' + pdfCost + ' crédits).'); return; }
        setTimeout(() => {
            const pdfIconSVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="28" height="28"><path d="M6 2h8l6 6v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z" stroke="#b07cc6" stroke-width="1.8" fill="none"/><path d="M14 2v6h6" stroke="#b07cc6" stroke-width="1.8" fill="none"/><path d="M9 13h6M9 16h4" stroke="#b07cc6" stroke-width="1.5" stroke-linecap="round"/></svg>`;
            const now = new Date();
            const defaultTitle = 'QuickText_' + String(now.getDate()).padStart(2,'0') + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + now.getFullYear() + '_' + String(now.getHours()).padStart(2,'0') + 'h' + String(now.getMinutes()).padStart(2,'0') + 'm';
            showExportPDFPopup(text, pdfIconSVG, defaultTitle, estimatedPages, pdfCost);
        }, 500);
    }

    function handleClearText() {
        if (!DOM.output || !DOM.output.value.trim()) { showToast('Aucun texte à effacer'); return; }
        const trashIconSVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="28" height="28"><path d="M4 6h16" stroke="#f08080" stroke-width="1.8" stroke-linecap="round"/><path d="M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2" stroke="#f08080" stroke-width="1.8" fill="none"/><path d="M10 10v7M14 10v7" stroke="#f08080" stroke-width="1.8" stroke-linecap="round"/><path d="M5 6l1 14a1 1 0 001 1h10a1 1 0 001-1l1-14" stroke="#f08080" stroke-width="1.8" fill="none"/></svg>`;
        showConfirmPopup('Effacer le texte', 'Voulez-vous vraiment effacer tout le texte ?\nCette action est irréversible.', trashIconSVG, 'Effacer', () => {
            state.fullTranscript = ''; state.translatedText = ''; state._lastInterimText = '';
            DOM.output.value = ''; window.storage.setSession('currentText', '');
            if (SpeechModule.isSpeaking || SpeechModule.isPaused) { SpeechModule.stopSpeaking(); resetPlayButton(); }
            if (DOM.formatInfo) DOM.formatInfo.textContent = '';
            updateModeIndicator('Prêt'); showToast('Texte effacé');
        });
    }

    async function handlePdfImport(e) {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 50 * 1024 * 1024) { showToast('Fichier trop volumineux (max 50 Mo)'); e.target.value = ''; return; }
        updateModeIndicator('📄 Extraction PDF...');
        try {
            const text = await PDFModule.extractText(file);
            if (text && text.trim()) { if (DOM.output) DOM.output.value = text; state.fullTranscript = text; updateModeIndicator('✅ PDF extrait'); showToast('PDF extrait (' + text.length.toLocaleString() + ' car.)'); }
            else showToast('Aucun texte extractible');
        } catch (err) { showToast('Erreur PDF: ' + err.message); }
        e.target.value = '';
    }

    // ============================================================
    // PWA
    // ============================================================

    function setupPWA() {
        window._deferredPrompt = null;
        if (window.matchMedia('(display-mode: standalone)').matches) return;
        window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window._deferredPrompt = e; if (DOM.installBtn) DOM.installBtn.style.display = 'inline-flex'; });
        window.addEventListener('appinstalled', () => { window._deferredPrompt = null; if (DOM.installBtn) DOM.installBtn.style.display = 'none'; });
        if (DOM.installBtn) {
            DOM.installBtn.addEventListener('click', async () => {
                if (window._deferredPrompt) { window._deferredPrompt.prompt(); await window._deferredPrompt.userChoice; window._deferredPrompt = null; DOM.installBtn.style.display = 'none'; }
                else showToast('📱 Menu du navigateur → Installer');
            });
        }
        setTimeout(() => { if (DOM.installBtn && !window.matchMedia('(display-mode: standalone)').matches) DOM.installBtn.style.display = 'inline-flex'; }, 2000);
        if ('serviceWorker' in navigator) {
            const basePath = location.pathname.replace(/\/[^/]*$/, '');
            const swPath = basePath ? basePath + '/sw.js' : './sw.js';
            navigator.serviceWorker.register(swPath).catch(() => {});
        }
    }

    function loadVoices() { if ('speechSynthesis' in window) { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices(); } }

    // ============================================================
    // INITIALISATION
    // ============================================================

    function cacheDOM() {
        const ids = [
            'output', 'recordBtn', 'translateBtn', 'playBtn', 'iaBtn', 'copyBtn', 'clearBtn', 'exportBtn', 'importPdfBtn', 'pdfFileInput',
            'langSelect', 'speedSelect', 'actionSelect', 'apiKeyInput', 'apiKeyToggle', 'modeIndicator', 'progressBar', 'progressFill',
            'formatInfo', 'installBtn', 'creditsBadge', 'creditsCount', 'rechargeBtn',
            'registerPopup', 'registerOverlay', 'registerSubmit', 'registerSkip', 'regName', 'regPhone', 'regRole', 'regRoleOther', 'regPassword', 'voiceSelect',
            'adminDashboardOverlay', 'adminCloseBtn', 'filterName', 'filterPhone', 'filterBtn', 'resetFilterBtn',
            'gestionSearchBtn', 'gestionFilterName', 'gestionTableBody', 'editUserPopup', 'editUserId', 'editUserName',
            'editUserPhone', 'editUserRole', 'editUserCredits', 'cancelEditBtn', 'saveEditBtn'
        ];
        ids.forEach(id => { DOM[id] = document.getElementById(id); });
    }

    function loadPreferences() {
        state.currentLang = window.storage.get('selectedLang', 'fr-FR');
        state.speechRate = window.storage.get('speechRate', '1.0');
        state.selectedAction = window.storage.get('selectedAction', 'formatting');
        if (DOM.langSelect) DOM.langSelect.value = state.currentLang;
        if (DOM.speedSelect) DOM.speedSelect.value = state.speechRate;
        if (DOM.actionSelect) DOM.actionSelect.value = state.selectedAction;
        const apiKey = window.storage.get('api_key', '');
        if (apiKey && DOM.apiKeyInput) { DOM.apiKeyInput.value = apiKey; if (DOM.apiKeyToggle) DOM.apiKeyToggle.checked = true; DOM.apiKeyInput.readOnly = true; DOM.apiKeyInput.type = 'password'; }
        const savedText = window.storage.getSession('currentText', '');
        if (savedText && DOM.output) { DOM.output.value = savedText; state.fullTranscript = savedText; }
        const savedVoice = window.storage.get('preferredVoice', 'auto');
        if (DOM.voiceSelect) DOM.voiceSelect.value = savedVoice;
    }

    function setupEvents() {
        if (DOM.recordBtn) DOM.recordBtn.addEventListener('click', toggleRecording);
        if (DOM.translateBtn) DOM.translateBtn.addEventListener('click', handleTranslation);
        if (DOM.rechargeBtn) DOM.rechargeBtn.addEventListener('click', showRechargePopup);
        if (DOM.playBtn) {
            let clickTimer = null;
            DOM.playBtn.addEventListener('click', (e) => { if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; return; } clickTimer = setTimeout(() => { clickTimer = null; toggleSpeech(); }, 250); });
            DOM.playBtn.addEventListener('dblclick', (e) => { if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; } stopSpeech(); });
        }
        if (DOM.iaBtn) { DOM.iaBtn.addEventListener('click', handleIA); DOM.iaBtn.addEventListener('dblclick', handleIAAbort); }
        if (DOM.copyBtn) DOM.copyBtn.addEventListener('click', copyText);
        if (DOM.clearBtn) DOM.clearBtn.addEventListener('click', handleClearText);
        if (DOM.exportBtn) DOM.exportBtn.addEventListener('click', handleExport);
        if (DOM.importPdfBtn) DOM.importPdfBtn.addEventListener('click', () => { if (DOM.pdfFileInput) DOM.pdfFileInput.click(); });
        if (DOM.pdfFileInput) DOM.pdfFileInput.addEventListener('change', handlePdfImport);
        if (DOM.langSelect) DOM.langSelect.addEventListener('change', (e) => { state.currentLang = e.target.value; window.storage.set('selectedLang', state.currentLang); populateVoiceList(state.currentLang); if (SpeechModule.isSpeaking || SpeechModule.isPaused) { SpeechModule.stopSpeaking(); resetPlayButton(); } });
        if (DOM.speedSelect) DOM.speedSelect.addEventListener('change', (e) => { state.speechRate = e.target.value; window.storage.set('speechRate', state.speechRate); });
        if (DOM.voiceSelect) DOM.voiceSelect.addEventListener('change', (e) => { window.storage.set('preferredVoice', e.target.value); });
        if (DOM.actionSelect) DOM.actionSelect.addEventListener('change', (e) => { state.selectedAction = e.target.value; window.storage.set('selectedAction', state.selectedAction); });
        if (DOM.apiKeyToggle) DOM.apiKeyToggle.addEventListener('change', (e) => {
            if (e.target.checked) { const key = DOM.apiKeyInput ? DOM.apiKeyInput.value.trim() : ''; if (key) { AIModule.setApiKey(key); if (DOM.apiKeyInput) { DOM.apiKeyInput.readOnly = true; DOM.apiKeyInput.type = 'password'; } showToast('Clé API verrouillée'); } else { e.target.checked = false; showToast('Veuillez entrer une clé API'); } }
            else { if (DOM.apiKeyInput) { DOM.apiKeyInput.readOnly = false; DOM.apiKeyInput.type = 'text'; } window.storage.remove('api_key'); }
        });
        if (DOM.output) DOM.output.addEventListener('input', () => { state.fullTranscript = DOM.output.value; window.storage.setSession('currentText', DOM.output.value); });
        const headerLogo = document.querySelector('.header-logo');
        if (headerLogo) { headerLogo.style.cursor = 'pointer'; headerLogo.addEventListener('click', openLogoPopup); }
        if (DOM.adminCloseBtn) DOM.adminCloseBtn.addEventListener('click', closeAdminDashboard);
        if (DOM.filterBtn) DOM.filterBtn.addEventListener('click', () => loadAdminDashboard(true));
        if (DOM.resetFilterBtn) DOM.resetFilterBtn.addEventListener('click', () => { if (DOM.filterName) DOM.filterName.value = ''; if (DOM.filterPhone) DOM.filterPhone.value = ''; loadAdminDashboard(false); });
        window.addEventListener('beforeunload', () => { if (DOM.output) window.storage.setSession('currentText', DOM.output.value); window.storage.set('speechRate', state.speechRate); window.storage.set('selectedLang', state.currentLang); window.storage.set('selectedAction', state.selectedAction); });
    }

    async function init() {
        cacheDOM(); loadPreferences(); setupEvents(); setupPWA(); loadVoices();
        await CreditModule.init(); updateCreditsDisplay();
        if (!CreditModule.isProfileCompleted()) { setTimeout(() => showRegisterPopup(), 1000); }
        setTimeout(() => populateVoiceList(state.currentLang), 500);
        if ('speechSynthesis' in window) { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => populateVoiceList(state.currentLang); if (speechSynthesis.getVoices().length > 0) populateVoiceList(state.currentLang); }
        setTimeout(() => populateVoiceList(state.currentLang), 1000);
        const loadingScreen = document.getElementById('loadingScreen'); if (loadingScreen) loadingScreen.classList.add('hidden');
        const app = document.getElementById('app'); if (app) app.style.display = 'flex';
        console.log('✅ QuickText Voice Pro - Prêt');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

})();