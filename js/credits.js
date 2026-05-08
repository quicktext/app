// QuickText Voice Pro - Module de Crédits (Supabase)
const CreditModule = {
    config: {
        apiUrl: 'https://zhvdyjpevrqteirqeztb.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpodmR5anBldnJxdGVpcnFlenRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMDY1MTAsImV4cCI6MjA5MzY4MjUxMH0.0YpMPKb7Lf3FZyM0wNpa35MZutruk6ZdIAFMKASSpvA',
        freeCredits: 10,
        services: {
            dictation: { cost: 5, unit: 'par minute', name: 'Dictée vocale' },
            translation: { cost: 15, unit: 'par 1000 car.', name: 'Traduction' },
            ia_processing: { cost: 25, unit: 'par requête', name: 'Traitement IA' },
            pdf_export: { cost: 50, unit: 'par export', name: 'Export PDF' },
            speech_reading: { cost: 5, unit: 'par 1000 car.', name: 'Lecture audio' }
        }
    },

    userID: null,
    currentCredits: 0,
    initialized: false,

    /**
     * Requête HTTP vers Supabase avec gestion robuste des erreurs
     */
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

        // Récupérer le texte brut pour diagnostic
        const responseText = await response.text();

        if (!response.ok) {
            // Tentative de parser l'erreur Supabase si c'est du JSON
            let errorDetail = responseText;
            try {
                const errorObj = JSON.parse(responseText);
                errorDetail = errorObj.message || errorDetail;
            } catch (_) {}
            throw new Error('Erreur Supabase (' + response.status + '): ' + errorDetail);
        }

        // Si le body est vide (ex: 204 No Content), retourner null
        if (!responseText.trim()) {
            return null;
        }

        try {
            return JSON.parse(responseText);
        } catch (e) {
            throw new Error('Réponse non JSON: ' + responseText.substring(0, 200));
        }
    },

    async init() {
        this.userID = window.storage.get('userID', null);
        if (!this.userID) {
            this.userID = 'QT-' + Math.random().toString(36).substring(2, 8).toUpperCase();
            window.storage.set('userID', this.userID);
        }

        await this.ensureUser();
        this.initialized = true;
        console.log('Crédits initialisés - ' + this.currentCredits + ' crédits (Supabase)');
    },

    /**
     * S'assure que l'utilisateur existe, sinon le crée
     */
    async ensureUser() {
        // Charger l'utilisateur si existant
        const user = await this.fetchUser();
        if (user) {
            this.currentCredits = user.credits;
            return;
        }

        // Tenter de créer l'utilisateur
        try {
            await this.insertUser();
            this.currentCredits = this.config.freeCredits;
            window.storage.set('credits', this.currentCredits);
            console.log('Nouvel utilisateur créé - ' + this.currentCredits + ' crédits');
        } catch (e) {
            // Si conflit (duplicate), un autre processus a créé l'utilisateur entre temps, on recharge
            if (e.message.includes('duplicate key') || e.message.includes('409')) {
                const userAgain = await this.fetchUser();
                if (userAgain) {
                    this.currentCredits = userAgain.credits;
                } else {
                    throw new Error('Conflit utilisateur impossible à résoudre');
                }
            } else {
                throw e;
            }
        }
    },

    /**
     * Récupère l'utilisateur depuis Supabase
     */
    async fetchUser() {
        const filter = 'user_id=eq.' + encodeURIComponent(this.userID);
        const data = await this.supabaseQuery('/rest/v1/users?select=credits&' + filter);
        return data && data.length > 0 ? data[0] : null;
    },

    /**
     * Insère un nouvel utilisateur
     */
    async insertUser() {
        return await this.supabaseQuery('/rest/v1/users', {
            method: 'POST',
            body: JSON.stringify({
                user_id: this.userID,
                credits: this.config.freeCredits
            })
        });
    },

    /**
     * Synchronise les crédits (appelé avant chaque opération)
     */
    async syncCredits() {
        const user = await this.fetchUser();
        if (user) {
            this.currentCredits = user.credits;
            window.storage.set('credits', this.currentCredits);
        }
    },

    /**
     * Vérifie si l'utilisateur a assez de crédits pour un service
     */
    async checkCredits(service) {
        await this.syncCredits();
        const cost = this.getServiceCost(service);
        return this.currentCredits >= cost;
    },

    /**
     * Débite des crédits
     */
    async useCredits(service, amount) {
        const cost = amount || this.getServiceCost(service);
        if (this.currentCredits < cost) return false;

        const newCredits = this.currentCredits - cost;

        // Récupérer l'ID interne de l'utilisateur
        const filter = 'user_id=eq.' + encodeURIComponent(this.userID);
        const users = await this.supabaseQuery('/rest/v1/users?select=id&' + filter);
        if (!users || users.length === 0) throw new Error('Utilisateur introuvable');

        const internalId = users[0].id;

        // Mettre à jour les crédits
        await this.supabaseQuery('/rest/v1/users?id=eq.' + internalId, {
            method: 'PATCH',
            body: JSON.stringify({
                credits: newCredits,
                last_used: new Date().toISOString()
            })
        });

        // Enregistrer la transaction
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
        window.storage.set('credits', newCredits);
        console.log(cost + ' crédits utilisés - Restant: ' + newCredits);
        return true;
    },

    /**
     * Vérifie et déduit avant d'exécuter un service
     */
    async canUseService(service) {
        const hasCredits = await this.checkCredits(service);
        if (!hasCredits) {
            const cost = this.getServiceCost(service);
            const serviceName = this.getServiceName(service);
            throw new Error(
                'Crédits insuffisants !\n\n' +
                'Service : ' + serviceName + '\n' +
                'Coût : ' + cost + ' crédit(s)\n' +
                'Vos crédits : ' + this.currentCredits + '\n\n' +
                'Rechargez vos crédits pour continuer.'
            );
        }
        return true;
    },

    getServiceCost(service) {
        return this.config.services[service]?.cost || 1;
    },

    getServiceName(service) {
        return this.config.services[service]?.name || service;
    }
};