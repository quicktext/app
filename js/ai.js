// QuickText Voice Pro - Module IA avec détection automatique du fournisseur
const AIModule = {
    apiKey: null,
    currentController: null,
    
    config: {
        deepseekUrl: 'https://zhvdyjpevrqteirqeztb.supabase.co/functions/v1/deepseek-proxy',
        timeout: 30000,
        maxChunkSize: 3000,
    },
    
    setApiKey(key) {
        this.apiKey = key;
        window.storage.set('api_key', key);
    },
    
    getApiKey() {
        if (!this.apiKey) {
            this.apiKey = window.storage.get('api_key', '');
        }
        return this.apiKey;
    },
    
    abort() {
        if (this.currentController) {
            this.currentController.abort();
            this.currentController = null;
            return true;
        }
        return false;
    },
    
    // ============================================================
    // DÉTECTION DU FOURNISSEUR
    // ============================================================
    detectProvider(apiKey) {
        if (!apiKey) return null;
        
        // Clé OpenAI native : commence par "sk-"
        if (apiKey.startsWith('sk-')) {
            return {
                name: 'openai',
                url: 'https://api.openai.com/v1/chat/completions',
                model: 'gpt-3.5-turbo',
                headerName: 'Authorization',
                headerValue: 'Bearer ' + apiKey
            };
        }
        
        // Clé OpenRouter : commence par "sk-or-"
        if (apiKey.startsWith('sk-or-')) {
            return {
                name: 'openrouter',
                url: 'https://openrouter.ai/api/v1/chat/completions',
                model: 'openai/gpt-3.5-turbo',
                headerName: 'Authorization',
                headerValue: 'Bearer ' + apiKey
            };
        }
        
        // Clé Anthropic : commence par "sk-ant-"
        if (apiKey.startsWith('sk-ant-')) {
            return {
                name: 'anthropic',
                url: 'https://api.anthropic.com/v1/messages',
                model: 'claude-3-haiku-20240307',
                headerName: 'x-api-key',
                headerValue: apiKey
            };
        }
        
        // Clé Google AI : commence par "AIza"
        if (apiKey.startsWith('AIza')) {
            return {
                name: 'google',
                url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
                model: 'gemini-pro',
                headerName: 'x-goog-api-key',
                headerValue: apiKey
            };
        }
        
        // Par défaut : tenter OpenRouter
        return {
            name: 'openrouter',
            url: 'https://openrouter.ai/api/v1/chat/completions',
            model: 'openai/gpt-3.5-turbo',
            headerName: 'Authorization',
            headerValue: 'Bearer ' + apiKey
        };
    },
    
    // ============================================================
    // TRAITEMENT IA PRINCIPAL
    // ============================================================
    async processText(text, action, onProgress) {
        this.abort();
        this.currentController = new AbortController();
        const signal = this.currentController.signal;
        
        if (onProgress) onProgress(0, 1, 'Préparation...');
        
        const userApiKey = this.getApiKey();
        const provider = this.detectProvider(userApiKey);
        
        // Essayer l'API utilisateur si une clé est fournie
        if (provider) {
            try {
                if (onProgress) onProgress(0, 1, `API ${provider.name}...`);
                
                const result = await this.callUserAPI(text, action, provider, signal);
                
                if (result && result.trim().length > 10) {
                    return result;
                }
            } catch (e) {
                console.warn(`API ${provider.name} échouée :`, e.message);
            }
        }
        
        // Fallback sur DeepSeek
        if (onProgress) onProgress(0, 1, 'API DeepSeek (secours)...');
        return await this.callDeepSeek(text, action, signal);
    },
    
    // ============================================================
    // APPEL API UTILISATEUR (multi-fournisseurs)
    // ============================================================
    async callUserAPI(text, action, provider, signal) {
        const prompt = this.getPrompt(action);
        const fullPrompt = prompt + '\n\n---\n' + text + '\n---';
        
        // Format du body selon le fournisseur
        let body;
        
        if (provider.name === 'anthropic') {
            body = JSON.stringify({
                model: provider.model,
                max_tokens: 4096,
                messages: [{ role: 'user', content: fullPrompt }]
            });
        } else if (provider.name === 'google') {
            body = JSON.stringify({
                contents: [{ parts: [{ text: fullPrompt }] }]
            });
        } else {
            // OpenAI, OpenRouter et autres compatibles
            body = JSON.stringify({
                model: provider.model,
                messages: [{ role: 'user', content: fullPrompt }],
                temperature: 0.1,
                max_tokens: 4096
            });
        }
        
        const headers = {
            'Content-Type': 'application/json',
        };
        headers[provider.headerName] = provider.headerValue;
        
        const response = await fetch(provider.url, {
            method: 'POST',
            headers: headers,
            body: body,
            signal: signal
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
        }
        
        const data = await response.json();
        
        // Extraire le contenu selon le format de réponse du fournisseur
        let content = '';
        
        if (provider.name === 'anthropic') {
            content = data.content?.[0]?.text || '';
        } else if (provider.name === 'google') {
            content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } else {
            // OpenAI, OpenRouter
            content = data.choices?.[0]?.message?.content || '';
        }
        
        return this.cleanGeneratedText(content);
    },
    
    // ============================================================
    // APPEL DEEPSEEK (fallback)
    // ============================================================
    async callDeepSeek(text, action, signal) {
        const response = await fetch(this.config.deepseekUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + CreditModule.config.anonKey,
                'apikey': CreditModule.config.anonKey,
            },
            body: JSON.stringify({ text, action }),
            signal: signal
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Erreur DeepSeek');
        }
        
        const data = await response.json();
        
        if (!data.success || !data.content) {
            throw new Error(data.error || 'Réponse invalide');
        }
        
        return this.cleanGeneratedText(data.content);
    },
    
    // ============================================================
    // PROMPTS
    // ============================================================
    getPrompt(action) {
        const prompts = {
            summarize: `Tu es un analyste expert. Realise une synthese analytique complete du texte suivant.

STRUCTURE : I. RESUME (3-5 paragraphes), II. CONCEPTS CLES (5-10), III. ANALYSE CRITIQUE, IV. SYNTHESE FINALE
Donne UNIQUEMENT le resultat, sans introduction. Pas d'asterisques.`,

            formatting: `Tu es un correcteur expert. Corrige UNIQUEMENT la forme (orthographe, grammaire, ponctuation), JAMAIS le fond.
Donne UNIQUEMENT le texte corrige, rien d'autre. Pas d'asterisques.`,

            reading: `Tu es un pedagogue expert. Cree une fiche d'etude complete du texte (REFERENCE, GENRE, RESUME, THEMES, ANALYSE, POINTS CLES, QUESTIONS).
Donne UNIQUEMENT la fiche. Pas d'asterisques.`,

            memory: `Tu es un expert en memorisation. Cree une fiche memorielle (TITRE, 5 POINTS ESSENTIELS, CARTE MENTALE, DEFINITIONS, SYNTHESE).
Donne UNIQUEMENT la fiche. Pas d'asterisques.`
        };
        return prompts[action] || prompts.formatting;
    },
    
    // ============================================================
    // NETTOYAGE
    // ============================================================
    cleanGeneratedText(text) {
        if (!text || typeof text !== 'string') return '';
        let cleaned = text;
        cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1');
        cleaned = cleaned.replace(/\*(.*?)\*/g, '$1');
        cleaned = cleaned.replace(/__(.*?)__/g, '$1');
        cleaned = cleaned.replace(/_(.*?)_/g, '$1');
        cleaned = cleaned.replace(/\*/g, '');
        cleaned = cleaned.replace(/^Voici[\s\S]*?\n\n/i, '');
        cleaned = cleaned.replace(/^Assistant[\s\S]*?\n\n/i, '');
        cleaned = cleaned.replace(/^Here[\s\S]*?\n\n/i, '');
        cleaned = cleaned.replace(/^Sure[\s\S]*?\n\n/i, '');
        cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
        cleaned = cleaned.replace(/ {2,}/g, ' ');
        return cleaned.trim();
    }
};