// QuickText Voice Pro - Module de Crédits (Supabase)
const CreditModule = {
    config: {
        apiUrl: 'https://zhvdyjpevrqteirqeztb.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpodmR5anBldnJxdGVpcnFlenRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMDY1MTAsImV4cCI6MjA5MzY4MjUxMH0.0YpMPKb7Lf3FZyM0wNpa35MZutruk6ZdIAFMKASSpvA',
        freeCredits: 100,
        cacheDuration: 300000, // 5 minutes en millisecondes
        services: {}
    },

    userID: null,
    currentCredits: 0,
    initialized: false,
    _pricingCache: null,
    _pricingLastFetch: 0,
    _creditsCache: null,
    _creditsLastFetch: 0,

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
    // INITIALISATION
    // ============================================================
    async init() {
        this.userID = window.storage.get('userID', null);
        if (!this.userID) {
            this.userID = 'QT-' + Math.random().toString(36).substring(2, 8).toUpperCase();
            window.storage.set('userID', this.userID);
        }

        await this.ensureUser();
        await this.loadPricing(); // Charger les prix une seule fois
        this.initialized = true;
        console.log('Crédits initialisés - ' + this.currentCredits + ' crédits');
    },

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

        // Si le cache est encore valide, ne rien faire
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
                console.log('Tarification mise à jour :', services);
            }
        } catch (e) {
            console.warn('Tarification inaccessible, utilisation du cache local');
        }
    },

    // ============================================================
    // SYNCHRONISATION CRÉDITS (avec cache)
    // ============================================================
    async syncCredits() {
        const now = Date.now();

        // Si le cache est valide, utiliser le cache
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
            console.warn('Sync crédits échouée, utilisation du cache');
        }
    },

    // ============================================================
    // VÉRIFICATION RAPIDE (pas d'appel réseau)
    // ============================================================
    async checkCredits(service) {
        // Juste une vérification locale, pas d'appel réseau
        const cost = this.getServiceCost(service);
        return this.currentCredits >= cost;
    },

    async canUseService(service) {
        // Sync rapide si le cache est expiré
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

        // Mise à jour immédiate du cache local
        this.currentCredits = newCredits;
        this._creditsCache = newCredits;
        this._creditsLastFetch = Date.now();
        window.storage.set('credits', newCredits);

        console.log(cost + ' crédits utilisés - Restant: ' + newCredits);
        return true;
    },

    // ============================================================
    // GETTERS (locaux, instantanés)
    // ============================================================
    getServiceCost(service) {
        return this.config.services[service]?.cost || 1;
    },

    getServiceName(service) {
        return this.config.services[service]?.name || service;
    },

    // ============================================================
    // RECHARGE (mise à jour forcée après)
    // ============================================================
    async afterRecharge() {
        // Invalider le cache crédits
        this._creditsLastFetch = 0;
        // Recharger immédiatement
        await this.syncCredits();
        // Recharger les prix aussi
        await this.loadPricing();
    },

    // ===========================================================
    // MET A JOUR LE PROFIL UTILISATEUR
    // ===========================================================

    async updateProfile(userName, userTel, userRole) {
        const filter = 'user_id=eq.' + encodeURIComponent(this.userID);
        const users = await this.supabaseQuery('/rest/v1/users?select=id&' + filter);
        
        if (!users || users.length === 0) {
            throw new Error('Utilisateur introuvable');
        }
        
        const internalId = users[0].id;
        
        await this.supabaseQuery('/rest/v1/users?id=eq.' + internalId, {
            method: 'PATCH',
            body: JSON.stringify({
                user_name: userName,
                user_tel: userTel,
                user_role: userRole,
            })
        });
        
        // Sauvegarder en local pour ne plus afficher le pop-up
        window.storage.set('profile_completed', true);
        
        console.log('Profil mis à jour');
        return true;
    },

    // ============================================================
    // VERIFIE SI LE PROFIL EST DEJA COMPLET
    // ============================================================

    isProfileCompleted() {
        return window.storage.get('profile_completed', false);
    }
};