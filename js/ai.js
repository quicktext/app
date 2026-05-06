// QuickText Voice Pro - Module IA
// Version corrigée - Cohérence textes longs, nettoyage astérisques, interruption
// Optimisé - Gestion erreurs 429/402/502, modèles fiables, délais entre tentatives

const AIModule = {
    apiKey: null,
    modelsCache: null,
    lastFetch: 0,
    currentController: null,
    
    config: {
        apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
        modelsUrl: 'https://openrouter.ai/api/v1/models',
        cacheDuration: 3600000,     // 1 heure de cache
        maxChunkSize: 3000,
        maxTokens: 4096,
        temperature: 0.1,
        maxRetries: 3,              // Réduit de 5 à 3
        timeout: 30000,
        overlapSize: 200,
        delayBetweenRetries: 2000   // 2 secondes entre chaque tentative
    },
    
    // ============================================================
    // GESTION API KEY
    // ============================================================
    
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
    
    // ============================================================
    // INTERRUPTION
    // ============================================================
    
    abort() {
        if (this.currentController) {
            this.currentController.abort();
            this.currentController = null;
            console.log('IA: Traitement interrompu par l\'utilisateur');
            return true;
        }
        return false;
    },
    
    // ============================================================
    // GESTION DES MODÈLES
    // ============================================================
    
    async getFreeModels() {
        const now = Date.now();
        if (this.modelsCache && (now - this.lastFetch) < this.config.cacheDuration) {
            return this.prioritizeModels(this.modelsCache);
        }
        
        try {
            const response = await fetch(this.config.modelsUrl);
            if (!response.ok) throw new Error('HTTP ' + response.status);
            
            const data = await response.json();
            
            // Filtrer les modèles gratuits (prix = 0)
            const freeModels = (data.data || [])
                .filter(m => {
                    const p = parseFloat((m.pricing && m.pricing.prompt) || '0');
                    const c = parseFloat((m.pricing && m.pricing.completion) || '0');
                    return p === 0 && c === 0;
                })
                .map(m => m.id);
            
            // Ne garder que les modèles gratuits fiables
            const trulyFree = freeModels.filter(id => 
                id.startsWith('deepseek/') || 
                id.startsWith('google/gemini-2.0-flash') ||
                id.startsWith('google/gemini-2.0-pro-exp') ||
                id.startsWith('google/gemma-2-9b') ||
                id === 'google/gemma-2-27b-it:free' ||
                id === 'google/gemini-exp-1206:free' ||
                id === 'google/gemini-2.0-flash-thinking-exp:free'
            );
            
            if (trulyFree.length > 0) {
                this.modelsCache = trulyFree;
                this.lastFetch = now;
                console.log('IA: ' + trulyFree.length + ' modèles gratuits fiables trouvés');
                return this.prioritizeModels(trulyFree);
            }
            
            // Si aucun modèle fiable trouvé, utiliser les modèles de secours
            console.warn('IA: Aucun modèle fiable trouvé, utilisation des modèles de secours');
            
        } catch (e) {
            console.warn('IA: Erreur fetch modèles:', e.message);
        }
        
        // Liste de secours : modèles gratuits testés et fiables
        const fallbackModels = [
            'deepseek/deepseek-chat:free',
            'deepseek/deepseek-r1:free',
            'google/gemini-2.0-flash-001:free',
            'google/gemma-2-9b-it:free'
        ];
        
        this.modelsCache = fallbackModels;
        this.lastFetch = now;
        return this.prioritizeModels(fallbackModels);
    },
    
    prioritizeModels(models) {
        const deepseek = [];
        const gemini = [];
        const google = [];
        const others = [];
        
        models.forEach(m => {
            if (m.indexOf('deepseek') !== -1) deepseek.push(m);
            else if (m.indexOf('gemini') !== -1) gemini.push(m);
            else if (m.indexOf('google') !== -1 || m.indexOf('gemma') !== -1) google.push(m);
            else others.push(m);
        });
        
        return [...deepseek, ...gemini, ...google, ...others];
    },
    
    // ============================================================
    // NETTOYAGE DES RÉSULTATS
    // ============================================================
    
    cleanGeneratedText(text) {
        if (!text || typeof text !== 'string') return '';
        
        let cleaned = text;
        
        // === ÉTAPE 1 : SUPPRIMER LES ASTERISQUES DE MISE EN FORME ===
        // Supprimer les doubles astérisques **gras**
        cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1');
        
        // Supprimer les astérisques simples *italique*
        cleaned = cleaned.replace(/\*(.*?)\*/g, '$1');
        
        // Supprimer les astérisques isolés restants
        cleaned = cleaned.replace(/\*/g, '');
        
        // Supprimer les underscores de mise en forme __gras__
        cleaned = cleaned.replace(/__(.*?)__/g, '$1');
        
        // Supprimer les underscores simples _italique_
        cleaned = cleaned.replace(/_(.*?)_/g, '$1');
        
        // === ÉTAPE 2 : SUPPRIMER LES INTRODUCTIONS IA ===
        const introPatterns = [
            /^Voici le texte corrigé uniquement sur la forme[\s\S]*?\n\n/i,
            /^Voici le texte corrigé[\s\S]*?\n\n/i,
            /^Voici une version corrigée[\s\S]*?\n\n/i,
            /^Voici la correction[\s\S]*?\n\n/i,
            /^Voici le résultat[\s\S]*?\n\n/i,
            /^Voici la synthèse[\s\S]*?\n\n/i,
            /^Voici la fiche[\s\S]*?\n\n/i,
            /^Assistant[\s\S]*?\n\n/i,
            /^IA[\s\S]*?\n\n/i,
            /^Réponse[\s\S]*?\n\n/i,
            /^Résultat[\s\S]*?\n\n/i,
            /^Texte corrigé[\s\S]*?\n\n/i,
            /^Version corrigée[\s\S]*?\n\n/i,
            /^Nettoyage[\s\S]*?\n\n/i,
            /^Voici[\s\S]*?\n\n/i
        ];
        
        for (const pattern of introPatterns) {
            cleaned = cleaned.replace(pattern, '');
        }
        
        // === ÉTAPE 3 : SUPPRIMER LES RÉSUMÉS DE CORRECTIONS ===
        cleaned = cleaned.replace(/Résumé des corrections apportées\s*:[\s\S]*$/gim, '');
        cleaned = cleaned.replace(/Corrections apportées\s*:[\s\S]*$/gim, '');
        cleaned = cleaned.replace(/Modifications effectuées\s*:[\s\S]*$/gim, '');
        cleaned = cleaned.replace(/Liste des corrections\s*:[\s\S]*$/gim, '');
        cleaned = cleaned.replace(/Changements effectués\s*:[\s\S]*$/gim, '');
        
        // === ÉTAPE 4 : SUPPRIMER LES SÉPARATEURS ===
        cleaned = cleaned.replace(/^---+$/gm, '');
        cleaned = cleaned.replace(/^===+$/gm, '');
        cleaned = cleaned.replace(/^___+$/gm, '');
        cleaned = cleaned.replace(/^\*{3,}$/gm, '');
        cleaned = cleaned.replace(/^#{3,}$/gm, '');
        
        // === ÉTAPE 5 : SUPPRIMER LES BLOCS MARKDOWN ===
        cleaned = cleaned.replace(/```[a-z]*\n?/g, '');
        cleaned = cleaned.replace(/```/g, '');
        
        // === ÉTAPE 6 : NETTOYAGE FINAL ===
        // Lignes vides multiples
        cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
        
        // Espaces multiples
        cleaned = cleaned.replace(/[ \t]+/g, ' ');
        
        // Espaces en début de ligne
        cleaned = cleaned.replace(/^[ \t]+/gm, '');
        
        // Espaces en fin de ligne
        cleaned = cleaned.replace(/[ \t]+$/gm, '');
        
        // Lignes vides en début
        cleaned = cleaned.replace(/^\n+/, '');
        
        // Lignes vides en fin
        cleaned = cleaned.replace(/\n+$/, '');
        
        // Vérifier que le résultat n'est pas vide
        if (!cleaned || cleaned.length < 10) {
            return text;
        }
        
        return cleaned.trim();
    },
    
    // ============================================================
    // PROMPTS OPTIMISÉS
    // ============================================================
    
    getPrompt(action) {
        const prompts = {
            summarize: `Tu es un analyste expert. Realise une synthese analytique complete et coherente du texte suivant.

STRUCTURE DE LA REPONSE :
I. RESUME STRUCTURE (3-5 paragraphes)
II. CONCEPTS CLES (5-10 avec definition)
III. ANALYSE CRITIQUE (forces, faiblesses, implications)
IV. SYNTHESE FINALE

REGLES DE COHERENCE (TRES IMPORTANT) :
- Chaque phrase doit etre grammaticalement correcte et complete (sujet + verbe + complement)
- Les paragraphes doivent s'enchainer logiquement avec des transitions
- Verifie les accords (sujet-verbe, nom-adjectif, participe passe)
- Verifie la coherence des temps verbaux
- Verifie que les pronoms renvoient clairement a leur antecedent
- Si le texte source est long, assure la coherence globale de la synthese

REGLES DE FORMAT :
- Donne UNIQUEMENT le resultat, sans introduction ni commentaire
- N'utilise JAMAIS d'asterisques (*) pour la mise en forme
- N'utilise JAMAIS de underscores (_) pour la mise en forme
- Format texte brut, sans markdown
- Conserve la casse normale (minuscules avec majuscules en debut de phrase)

Texte a analyser :`,
            
            formatting: `Tu es un correcteur orthographique et grammatical expert. Corrige UNIQUEMENT la forme du texte, JAMAIS le fond.

ACTIONS AUTORISEES (forme uniquement) :
1. Corriger les fautes d'orthographe et de grammaire
2. Ajouter la ponctuation manquante (virgules, points, points-virgules)
3. Mettre une majuscule en debut de chaque phrase
4. Supprimer les doubles espaces et espaces en fin de ligne
5. Corriger les accords (sujet-verbe, nom-adjectif, participe passe)
6. Verifier la coherence des temps verbaux dans chaque phrase
7. Verifier la coherence des pronoms (il/elle, ils/elles, le/la/les)

ACTIONS INTERDITES (fond) :
- Ne reformule PAS les phrases
- Ne change PAS le sens du texte
- Ne reorganise PAS l'ordre des phrases
- Ne mets PAS de mots en majuscules sauf noms propres
- Ne transforme PAS une phrase ordinaire en titre
- Conserve exactement le meme vocabulaire et la meme structure

COHERENCE POUR LES TEXTES LONGS :
- Verifie que chaque phrase est complete (sujet + verbe + complement si necessaire)
- Verifie que les phrases se suivent logiquement au sein d'un paragraphe
- Verifie les transitions entre paragraphes
- Si deux phrases consecutives paraissent decousues, ajoute une legere transition logique
- Assure-toi que les pronoms renvoient clairement a leur antecedent
- Maintiens la coherence des temps verbaux tout au long du texte

REGLES IMPERATIVES :
- Donne UNIQUEMENT le texte corrige, RIEN d'autre
- AUCUNE introduction du type "Voici le texte corrige..."
- AUCUN resume des corrections apportees
- AUCUN commentaire sur ce que tu as corrige
- N'utilise JAMAIS d'asterisques (**) pour mettre en evidence des mots
- N'utilise JAMAIS de underscores (__) pour mettre en evidence des mots
- N'utilise JAMAIS de mise en forme markdown
- Juste le texte corrige, point final.

Texte a corriger :`,
            
            reading: `Tu es un pedagogue expert. Cree une fiche d'etude complete et coherente du texte suivant.

SECTIONS OBLIGATOIRES :
1. REFERENCE (titre, auteur, contexte)
2. GENRE ET TYPE DE DOCUMENT
3. RESUME ANALYTIQUE (10-15 lignes)
4. THEMES PRINCIPAUX (3-6 themes avec analyse)
5. ANALYSE APPROFONDIE
6. POINTS CLES A RETENIR (5-10 points)
7. CITATIONS MARQUANTES (3-5 avec contexte)
8. QUESTIONS DE REVISION (5 avec reponses detaillees)
9. PISTES DE REFLEXION

REGLES DE COHERENCE :
- Chaque section doit s'enchainer logiquement avec la precedente
- Le resume doit refleter fidelement le contenu
- Les themes identifies doivent etre coherents avec l'analyse
- Les questions de revision doivent couvrir l'ensemble du texte

REGLES DE FORMAT :
- Donne UNIQUEMENT la fiche d'etude, sans introduction
- N'utilise JAMAIS d'asterisques (*) pour la mise en forme
- N'utilise JAMAIS de underscores (_) pour la mise en forme
- Format texte brut, sans markdown

Texte source :`,
            
            memory: `Tu es un expert en memorisation. Cree une fiche memorielle ultra-condensee et coherente du texte suivant.

SECTIONS OBLIGATOIRES :
1. TITRE EVOCATEUR (qui resume l'essentiel)
2. LES 5 POINTS ESSENTIELS (avec phrase choc + astuce mnemotechnique)
3. CARTE MENTALE TEXTUELLE (structuree et logique)
4. DEFINITIONS CLES (claires et precises)
5. PIEGES A EVITER (erreurs frequentes)
6. PHRASE DE SYNTHESE FINALE

REGLES DE COHERENCE :
- Les 5 points doivent etre coherents entre eux et couvrir l'essentiel
- La carte mentale doit refleter la structure logique du texte original
- La phrase de synthese doit resumer l'ensemble de maniere percutante
- Chaque definition doit etre autonome et precise

REGLES DE FORMAT :
- Donne UNIQUEMENT la fiche memorielle, sans introduction
- N'utilise JAMAIS d'asterisques (*) pour la mise en forme
- N'utilise JAMAIS de underscores (_) pour la mise en forme
- Format texte brut, sans markdown

Texte a memoriser :`
        };
        
        return prompts[action] || prompts.formatting;
    },
    
    // ============================================================
    // TRAITEMENT IA PRINCIPAL
    // ============================================================
    
    async processText(text, action, onProgress) {
        const apiKey = this.getApiKey();
        if (!apiKey) throw new Error('Cle API non configuree');
        
        const prompt = this.getPrompt(action);
        const models = await this.getFreeModels();
        
        if (models.length === 0) throw new Error('Aucun modele disponible');
        
        // Annuler tout traitement précédent
        this.abort();
        
        // Créer un nouveau contrôleur pour cette requête
        this.currentController = new AbortController();
        const signal = this.currentController.signal;
        
        // Si le texte est long, le découper en chunks avec chevauchement
        if (text.length > this.config.maxChunkSize) {
            return await this.processLongText(text, prompt, models, signal, onProgress);
        }
        
        // Texte court : traitement normal
        const fullPrompt = prompt + '\n\n---\n' + text + '\n---';
        return await this.callModel(models, fullPrompt, signal, onProgress);
    },
    
    // ============================================================
    // TRAITEMENT DES TEXTES LONGS
    // ============================================================
    
    async processLongText(text, prompt, models, signal, onProgress) {
        const overlap = this.config.overlapSize;
        const chunks = [];
        
        // Découper avec chevauchement pour la cohérence
        for (let i = 0; i < text.length; i += (this.config.maxChunkSize - overlap)) {
            const chunk = text.substring(i, i + this.config.maxChunkSize);
            if (chunk.trim().length > 0) {
                chunks.push(chunk);
            }
        }
        
        console.log('IA: Traitement de ' + chunks.length + ' chunks avec chevauchement de ' + overlap + ' car.');
        
        if (onProgress) {
            onProgress(0, chunks.length, 'Preparation');
        }
        
        const results = [];
        
        for (let i = 0; i < chunks.length; i++) {
            // Vérifier l'interruption
            if (signal.aborted) {
                throw new DOMException('Traitement interrompu', 'AbortError');
            }
            
            // Construire le prompt pour ce chunk
            let chunkPrompt = prompt + '\n\n---\n' + chunks[i] + '\n---';
            
            // Ajouter le contexte du chunk précédent pour la cohérence
            if (i > 0 && results.length > 0) {
                const prevResult = results[results.length - 1];
                const contextLength = Math.min(300, prevResult.length);
                const previousContext = prevResult.substring(prevResult.length - contextLength);
                
                chunkPrompt += '\n\nIMPORTANT - Contexte du chunk precedent (pour maintenir la coherence) :\n' + previousContext;
                chunkPrompt += '\n\nAssure-toi que ce chunk s\'enchaine naturellement avec le contexte precedent.';
            }
            
            if (onProgress) {
                onProgress(i + 1, chunks.length, 'Partie ' + (i + 1) + '/' + chunks.length);
            }
            
            try {
                const result = await this.callModel(models, chunkPrompt, signal, null);
                
                if (result) {
                    const cleaned = this.cleanGeneratedText(result);
                    if (cleaned && cleaned.length > 10) {
                        results.push(cleaned);
                    } else {
                        results.push(chunks[i]);
                    }
                } else {
                    results.push(chunks[i]);
                }
            } catch (e) {
                if (e.name === 'AbortError') throw e;
                console.warn('IA: Echec chunk ' + (i + 1) + ':', e.message);
                results.push(chunks[i]);
            }
        }
        
        // Vérifier l'interruption avant d'assembler
        if (signal.aborted) {
            throw new DOMException('Traitement interrompu', 'AbortError');
        }
        
        // Assembler les résultats avec cohérence
        return this.mergeChunksCoherently(results);
    },
    
    // ============================================================
    // FUSION COHÉRENTE DES CHUNKS
    // ============================================================
    
    mergeChunksCoherently(chunks) {
        if (chunks.length === 0) return '';
        if (chunks.length === 1) return chunks[0];
        
        let merged = chunks[0];
        
        for (let i = 1; i < chunks.length; i++) {
            const currentChunk = chunks[i];
            
            // Extraire les derniers mots du chunk fusionné
            const mergedWords = merged.split(/\s+/);
            const lastMergedWords = mergedWords.slice(-15).join(' ');
            
            // Extraire les premiers mots du chunk courant
            const currentWords = currentChunk.split(/\s+/);
            const firstCurrentWords = currentWords.slice(0, 15).join(' ');
            
            // Détecter un chevauchement
            let overlapDetected = false;
            let startIndex = 0;
            
            // Chercher le chevauchement
            for (let j = Math.min(10, currentWords.length); j > 0; j--) {
                const prefix = currentWords.slice(0, j).join(' ');
                if (merged.endsWith(prefix) && prefix.length > 20) {
                    startIndex = j;
                    overlapDetected = true;
                    break;
                }
            }
            
            if (!overlapDetected) {
                // Vérifier si la fin du merged est incluse dans le début du courant
                const lastPart = mergedWords.slice(-8).join(' ');
                const firstPart = currentWords.slice(0, 8).join(' ');
                
                if (firstPart.includes(lastPart) || lastPart.includes(firstPart.substring(0, 30))) {
                    startIndex = 3;
                    overlapDetected = true;
                }
            }
            
            if (overlapDetected && startIndex > 0) {
                // Supprimer la partie chevauchante
                const remainingWords = currentWords.slice(startIndex);
                if (remainingWords.length > 0) {
                    merged += ' ' + remainingWords.join(' ');
                }
            } else {
                // Pas de chevauchement, ajouter avec transition
                const lastChar = merged.charAt(merged.length - 1);
                const separator = /[.!?]$/.test(lastChar) ? '\n\n' : ' ';
                merged += separator + currentChunk;
            }
        }
        
        // Nettoyer le résultat final
        return merged
            .replace(/\n{3,}/g, '\n\n')
            .replace(/ {2,}/g, ' ')
            .trim();
    },
    
    // ============================================================
    // APPEL AU MODÈLE (optimisé avec gestion des erreurs)
    // ============================================================
    
    async callModel(models, fullPrompt, signal, onProgress) {
        const maxModels = Math.min(models.length, this.config.maxRetries);
        let lastError = null;
        
        for (let i = 0; i < maxModels; i++) {
            // Vérifier l'interruption avant chaque tentative
            if (signal && signal.aborted) {
                throw new DOMException('Traitement interrompu', 'AbortError');
            }
            
            const model = models[i];
            const shortName = model.split('/').pop();
            
            console.log('IA: Essai ' + shortName + ' (' + (i + 1) + '/' + maxModels + ')');
            
            if (onProgress) {
                onProgress(i + 1, maxModels, shortName);
            }
            
            try {
                // Créer un contrôleur de timeout
                const timeoutController = new AbortController();
                const timeoutId = setTimeout(() => {
                    timeoutController.abort();
                }, this.config.timeout);
                
                const response = await fetch(this.config.apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + this.getApiKey(),
                        'X-Title': 'QuickText Voice Pro'
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: [{ role: 'user', content: fullPrompt }],
                        temperature: this.config.temperature,
                        max_tokens: this.config.maxTokens
                    }),
                    signal: timeoutController.signal
                });
                
                clearTimeout(timeoutId);
                
                // === GESTION DES ERREURS HTTP ===
                
                // 429 - Too Many Requests (limite de taux atteinte)
                if (response.status === 429) {
                    console.warn('IA: Limite de requêtes atteinte (429), pause de 5 secondes...');
                    lastError = new Error('Trop de requêtes. Veuillez patienter quelques secondes.');
                    
                    // Attendre 5 secondes avant de continuer
                    await new Promise(r => {
                        const timer = setTimeout(r, 5000);
                        if (signal) signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
                    });
                    
                    // Réessayer avec le même modèle après la pause
                    if (i < maxModels - 1) {
                        console.log('IA: Nouvelle tentative après pause...');
                        continue;
                    }
                }
                
                // 402 - Payment Required (modèle payant)
                if (response.status === 402) {
                    console.warn('IA: Modèle payant détecté (402), passage au suivant');
                    lastError = new Error('Ce modèle nécessite des crédits');
                    continue;
                }
                
                // 502 - Bad Gateway (erreur serveur temporaire)
                if (response.status === 502) {
                    console.warn('IA: Erreur serveur (502), pause de 3 secondes...');
                    lastError = new Error('Erreur serveur temporaire');
                    
                    await new Promise(r => {
                        const timer = setTimeout(r, 3000);
                        if (signal) signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
                    });
                    continue;
                }
                
                // Autres erreurs HTTP
                if (!response.ok) {
                    const errorText = await response.text();
                    lastError = new Error('HTTP ' + response.status + ': ' + errorText.substring(0, 100));
                    console.warn('IA: ' + shortName + ' erreur HTTP:', lastError.message);
                    
                    // Pause avant le modèle suivant
                    if (i < maxModels - 1) {
                        await new Promise(r => {
                            const timer = setTimeout(r, this.config.delayBetweenRetries);
                            if (signal) signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
                        });
                    }
                    continue;
                }
                
                // Succès - Traiter la réponse
                const data = await response.json();
                
                if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
                    let content = data.choices[0].message.content;
                    
                    if (content && content.trim().length > 10) {
                        content = this.cleanGeneratedText(content);
                        
                        if (content && content.trim().length > 10) {
                            console.log('IA: ' + shortName + ' OK -> ' + content.length + ' caracteres');
                            return content;
                        }
                    }
                    
                    lastError = new Error('Reponse vide ou invalide');
                } else {
                    lastError = new Error('Format de reponse invalide');
                }
                
            } catch (e) {
                clearTimeout(timeoutId);
                
                // Erreur d'interruption volontaire
                if (e.name === 'AbortError') {
                    throw e;
                }
                
                console.warn('IA: ' + shortName + ' echoue:', e.message);
                lastError = e;
                
                // Erreur réseau - arrêter complètement
                if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
                    throw new Error('Pas d\'acces internet. Verifiez votre connexion.');
                }
                
                // Pause avant de passer au modèle suivant
                if (i < maxModels - 1) {
                    await new Promise(r => {
                        const timer = setTimeout(r, this.config.delayBetweenRetries);
                        if (signal) signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
                    });
                }
                continue;
            }
        }
        
        // Tous les modèles ont échoué
        throw lastError || new Error('Tous les modeles ont echoue. Verifiez votre cle API ou patientez quelques minutes.');
    }
};