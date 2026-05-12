// QuickText Voice Pro - Module de Crédits (Supabase)
const CreditModule = {
    config: {
        apiUrl: 'https://zhvdyjpevrqteirqeztb.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpodmR5anBldnJxdGVpcnFlenRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMDY1MTAsImV4cCI6MjA5MzY4MjUxMH0.0YpMPKb7Lf3FZyM0wNpa35MZutruk6ZdIAFMKASSpvA',
        freeCredits: 10,
        cacheDuration: 300000,
        services: {}
    },

    userID: null,
    currentCredits: 0,
    initialized: false,
    _pricingCache: null,
    _pricingLastFetch: 0,
    _creditsCache: null,
    _creditsLastFetch: 0,
    _skipAutoCreate: false,

    // ============================================================
    // REQUÊTE HTTP
    // ============================================================
    async supabaseQuery(endpoint, options = {}) {
        const url = this.config.apiUrl + endpoint;
        const headers = {
            'apikey': this.config.anonKey,
            'Authorization': 'Bearer ' + this.config.anonKey,
            'Content-Type': 'application/json',
            ...options.headers
        };

        let response;
        try {
            response = await fetch(url, { ...options, headers });
        } catch (e) {
            throw new Error('Erreur réseau: ' + e.message);
        }

        const responseText = await response.text();

        if (!response.ok) {
            let errorDetail = responseText;
            try { errorDetail = JSON.parse(responseText).message || errorDetail; } catch (_) {}
            throw new Error('Erreur Supabase (' + response.status + '): ' + errorDetail);
        }

        if (!responseText.trim()) return null;

        try {
            return JSON.parse(responseText);
        } catch (e) {
            throw new Error('Réponse non JSON');
        }
    },

    // ============================================================
    // CALCUL DU COÛT PAR SERVICE
    // ============================================================
    getServiceCost(service, charCount, pageCount) {
        // PDF : facturation au nombre de pages
        if (service === 'pdf_export' && pageCount !== undefined && pageCount !== null) {
            return this.calculatePDFCost(pageCount);
        }
        // Autres services : facturation au nombre de caractères
        if (charCount !== undefined && charCount !== null) {
            return this.calculateCostByChars(service, charCount);
        }
        // Valeur par défaut (fallback)
        return this.config.services[service]?.cost || this.getDefaultCost(service);
    },

    calculatePDFCost(pageCount) {
        const pages = parseInt(pageCount) || 1;
        if (pages <= 1) return 2;
        if (pages <= 3) return 4;
        if (pages <= 5) return 6;
        if (pages <= 10) return 10;
        if (pages <= 20) return 18;
        if (pages <= 50) return 35;
        if (pages <= 100) return 60;
        return Math.ceil(60 + (pages - 100) * 0.5);
    },

    calculateCostByChars(service, charCount) {
        const chars = parseInt(charCount) || 0;
        switch (service) {
            case 'dictation':
                if (chars <= 500) return 1;
                if (chars <= 1500) return 2;
                if (chars <= 3000) return 3;
                if (chars <= 6000) return 5;
                return 8;
            case 'translation':
                if (chars <= 500) return 2;
                if (chars <= 1500) return 5;
                if (chars <= 3000) return 8;
                if (chars <= 6000) return 15;
                if (chars <= 10000) return 25;
                return 35;
            case 'speech_reading':
                if (chars <= 1000) return 1;
                if (chars <= 3000) return 2;
                if (chars <= 6000) return 4;
                if (chars <= 10000) return 6;
                return 10;
            case 'ia_processing':
                return this.calculateIACost(chars);
            default:
                return 1;
        }
    },

    calculateIACost(charCount) {
        if (charCount <= 2000) return 5;
        if (charCount <= 5000) return 10;
        if (charCount <= 10000) return 20;
        if (charCount <= 20000) return 35;
        if (charCount <= 40000) return 65;
        if (charCount <= 80000) return 120;
        return Math.ceil(charCount / 1000) * 1.5;
    },

    getDefaultCost(service) {
        const defaults = {
            dictation: 1,
            translation: 3,
            ia_processing: 5,
            pdf_export: 2,
            speech_reading: 1,
        };
        return defaults[service] || 1;
    },

    getServiceName(service) {
        return this.config.services[service]?.name || service;
    },

    // ============================================================
    // INITIALISATION
    // ============================================================

    async init() {
        this.userID = window.storage.get('userID', null);
        
        if (!this.userID) {
            // Générer un ID temporaire (non sauvegardé en base)
            this.userID = 'QT-' + Math.random().toString(36).substring(2, 8).toUpperCase();
            window.storage.set('userID', this.userID);
        }

        // Vérifier si le profil est complété
        if (this.isProfileCompleted()) {
            // Profil existant → charger normalement
            await this.ensureUser();
            await this.loadPricing();
            this.initialized = true;
        } else {
            // Profil non complété → ne pas créer en base, utiliser des crédits locaux
            this.currentCredits = this.config.freeCredits;
            this.initialized = true;
            console.log('💰 Crédits temporaires - ' + this.currentCredits + ' crédits');
        }
        
        console.log('💰 Module crédits initialisé');
    },

    // Modifier ensureUser pour accepter le mode différé
    async ensureUser() {
        const user = await this.fetchUser();
        if (user) {
            this.currentCredits = user.credits;
            return;
        }
        try {
            await this.insertUser();
            this.currentCredits = this.config.freeCredits;
            window.storage.set('credits', this.currentCredits);
        } catch (e) {
            if (e.message.includes('duplicate') || e.message.includes('409')) {
                const userAgain = await this.fetchUser();
                if (userAgain) this.currentCredits = userAgain.credits;
            } else {
                throw e;
            }
        }
    },

    // Ajouter une fonction pour créer l'utilisateur après inscription
    async createUserAfterRegistration(userName, userTel, userRole) {
        // Supprimer l'utilisateur temporaire s'il existe
        const filter = 'user_id=eq.' + encodeURIComponent(this.userID);
        const existing = await this.supabaseQuery('/rest/v1/users?select=id&' + filter);
        
        if (existing && existing.length > 0) {
            // Mettre à jour l'utilisateur existant
            await this.supabaseQuery('/rest/v1/users?id=eq.' + existing[0].id, {
                method: 'PATCH',
                body: JSON.stringify({
                    user_name: userName,
                    user_tel: userTel,
                    user_role: userRole,
                    credits: this.config.freeCredits,
                    created_at: new Date().toISOString(),
                    last_used: new Date().toISOString(),
                })
            });
        } else {
            // Créer un nouvel utilisateur
            await this.insertUserWithProfile(userName, userTel, userRole);
        }
        
        this.currentCredits = this.config.freeCredits;
        window.storage.set('credits', this.currentCredits);
        window.storage.set('profile_completed', true);
        
        console.log('✅ Utilisateur créé après inscription');
        return true;
    },

    async insertUserWithProfile(userName, userTel, userRole) {
        return await this.supabaseQuery('/rest/v1/users', {
            method: 'POST',
            body: JSON.stringify({
                user_id: this.userID,
                user_name: userName,
                user_tel: userTel,
                user_role: userRole,
                credits: this.config.freeCredits,
                created_at: new Date().toISOString(),
                last_used: new Date().toISOString(),
            })
        });
    },

    async fetchUser() {
        const filter = 'user_id=eq.' + encodeURIComponent(this.userID);
        const data = await this.supabaseQuery('/rest/v1/users?select=credits&' + filter);
        return data && data.length > 0 ? data[0] : null;
    },

    async insertUser() {
        return await this.supabaseQuery('/rest/v1/users', {
            method: 'POST',
            body: JSON.stringify({ user_id: this.userID, credits: this.config.freeCredits })
        });
    },

    // ============================================================
    // TARIFICATION (avec cache)
    // ============================================================
    async loadPricing() {
        const now = Date.now();
        if (this._pricingCache && (now - this._pricingLastFetch) < this.config.cacheDuration) {
            return;
        }
        try {
            const pricing = await this.supabaseQuery('/rest/v1/pricing?select=*');
            if (pricing && pricing.length > 0) {
                const services = {};
                pricing.forEach(item => {
                    services[item.service] = {
                        cost: item.cost,
                        name: item.name || item.service,
                        unit: item.unit || '',
                    };
                });
                this.config.services = services;
                this._pricingCache = services;
                this._pricingLastFetch = now;
                console.log('💰 Tarification mise à jour :', services);
            }
        } catch (e) {
            console.warn('⚠️ Tarification inaccessible');
        }
    },

    // ============================================================
    // SYNCHRONISATION CRÉDITS
    // ============================================================
    async syncCredits() {
        const now = Date.now();
        if (this._creditsCache !== null && (now - this._creditsLastFetch) < 30000) {
            this.currentCredits = this._creditsCache;
            window.storage.set('credits', this.currentCredits);
            return;
        }
        try {
            const user = await this.fetchUser();
            if (user) {
                this.currentCredits = user.credits;
                this._creditsCache = user.credits;
                this._creditsLastFetch = now;
                window.storage.set('credits', this.currentCredits);
            }
        } catch (e) {
            console.warn('⚠️ Sync crédits échouée');
        }
    },

    // ============================================================
    // VÉRIFICATION RAPIDE
    // ============================================================
    async checkCredits(service) {
        const cost = this.getServiceCost(service);
        return this.currentCredits >= cost;
    },

    async canUseService(service) {
        await this.syncCredits();
        const cost = this.getServiceCost(service);
        const hasCredits = this.currentCredits >= cost;
        if (!hasCredits) {
            const serviceName = this.getServiceName(service);
            throw new Error(
                '💰 Crédits insuffisants !\n\n' +
                'Service : ' + serviceName + '\n' +
                'Coût : ' + cost + ' crédit(s)\n' +
                'Vos crédits : ' + this.currentCredits + '\n\n' +
                'Rechargez vos crédits pour continuer.'
            );
        }
        return true;
    },

    // ============================================================
    // UTILISER DES CRÉDITS
    // ============================================================
    async useCredits(service, amount) {
        const cost = amount || this.getServiceCost(service);
        if (this.currentCredits < cost) return false;

        const newCredits = this.currentCredits - cost;

        const filter = 'user_id=eq.' + encodeURIComponent(this.userID);
        const users = await this.supabaseQuery('/rest/v1/users?select=id&' + filter);
        if (!users || users.length === 0) throw new Error('Utilisateur introuvable');

        const internalId = users[0].id;

        await this.supabaseQuery('/rest/v1/users?id=eq.' + internalId, {
            method: 'PATCH',
            body: JSON.stringify({
                credits: newCredits,
                last_used: new Date().toISOString()
            })
        });

        await this.supabaseQuery('/rest/v1/transactions', {
            method: 'POST',
            body: JSON.stringify({
                user_id: this.userID,
                type: 'debit',
                amount: -cost,
                service: service
            })
        });

        this.currentCredits = newCredits;
        this._creditsCache = newCredits;
        this._creditsLastFetch = Date.now();
        window.storage.set('credits', newCredits);

        console.log('💰 ' + cost + ' crédits utilisés - Restant: ' + newCredits);
        return true;
    },

    // ============================================================
    // RECHARGE
    // ============================================================
    async afterRecharge() {
        this._creditsLastFetch = 0;
        await this.syncCredits();
        await this.loadPricing();
    },

    // ============================================================
    // PROFIL UTILISATEUR
    // ============================================================
    async updateProfile(userName, userTel, userRole) {
        const filter = 'user_id=eq.' + encodeURIComponent(this.userID);
        const users = await this.supabaseQuery('/rest/v1/users?select=id&' + filter);
        if (!users || users.length === 0) throw new Error('Utilisateur introuvable');
        const internalId = users[0].id;
        await this.supabaseQuery('/rest/v1/users?id=eq.' + internalId, {
            method: 'PATCH',
            body: JSON.stringify({
                user_name: userName,
                user_tel: userTel,
                user_role: userRole,
            })
        });
        window.storage.set('profile_completed', true);
        console.log('✅ Profil mis à jour');
        return true;
    },

    isProfileCompleted() {
        return window.storage.get('profile_completed', false);
    }
};