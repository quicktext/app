// QuickText Voice Pro - Module IA avec détection automatique du fournisseur
// 6 actions : Correction, Reformulation, Résumer, Exposé, Rapport, Cours

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
    
    detectProvider(apiKey) {
        if (!apiKey) return null;
        if (apiKey.startsWith('sk-ant-')) {
            return {
                name: 'anthropic',
                url: 'https://api.anthropic.com/v1/messages',
                model: 'claude-3-haiku-20240307',
                headerName: 'x-api-key',
                headerValue: apiKey
            };
        }
        if (apiKey.startsWith('AIza')) {
            return {
                name: 'google',
                url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
                model: 'gemini-pro',
                headerName: 'x-goog-api-key',
                headerValue: apiKey
            };
        }
        return {
            name: apiKey.startsWith('sk-or-') ? 'openrouter' : 'openai',
            url: apiKey.startsWith('sk-or-') ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions',
            model: apiKey.startsWith('sk-or-') ? 'openai/gpt-3.5-turbo' : 'gpt-3.5-turbo',
            headerName: 'Authorization',
            headerValue: 'Bearer ' + apiKey
        };
    },
    
    async processText(text, action, onProgress) {
        this.abort();
        this.currentController = new AbortController();
        const signal = this.currentController.signal;
        
        if (onProgress) onProgress(0, 1, 'Préparation...');
        
        const userApiKey = this.getApiKey();
        const provider = this.detectProvider(userApiKey);
        
        if (provider) {
            try {
                if (onProgress) onProgress(0, 1, `API ${provider.name}...`);
                const result = await this.callUserAPI(text, action, provider, signal);
                if (result && result.trim().length > 10) return result;
            } catch (e) {
                console.warn(`⚠️ API ${provider.name} échouée :`, e.message);
            }
        }
        
        if (onProgress) onProgress(0, 1, 'API DeepSeek (secours)...');
        return await this.callDeepSeek(text, action, signal);
    },
    
    async callUserAPI(text, action, provider, signal) {
        const prompt = this.getPrompt(action);
        const fullPrompt = prompt + '\n\n---\n' + text + '\n---';
        
        let body;
        if (provider.name === 'anthropic') {
            body = JSON.stringify({ model: provider.model, max_tokens: 4096, messages: [{ role: 'user', content: fullPrompt }] });
        } else if (provider.name === 'google') {
            body = JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] });
        } else {
            body = JSON.stringify({ model: provider.model, messages: [{ role: 'user', content: fullPrompt }], temperature: 0.1, max_tokens: 4096 });
        }
        
        const headers = { 'Content-Type': 'application/json' };
        headers[provider.headerName] = provider.headerValue;
        
        const response = await fetch(provider.url, { method: 'POST', headers, body, signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        let content = '';
        if (provider.name === 'anthropic') content = data.content?.[0]?.text || '';
        else if (provider.name === 'google') content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        else content = data.choices?.[0]?.message?.content || '';
        
        return this.cleanGeneratedText(content);
    },
    
    async callDeepSeek(text, action, signal) {
        const response = await fetch(this.config.deepseekUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + CreditModule.config.anonKey,
                'apikey': CreditModule.config.anonKey,
            },
            body: JSON.stringify({ text, action }),
            signal
        });
        
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Erreur DeepSeek');
        const data = await response.json();
        if (!data.success || !data.content) throw new Error(data.error || 'Réponse invalide');
        return this.cleanGeneratedText(data.content);
    },
    
    getPrompt(action) {
        const prompts = {
            formatting: `# RÔLE
    Tu es un correcteur-relecteur professionnel certifié, spécialisé en publications académiques et professionnelles. Tu travailles pour une maison d'édition exigeante.

    # MISSION
    Transforme le texte fourni en un document impeccable, prêt à être publié, sans aucun artefact parasite.

    # RÈGLES IMPÉRATIVES

    ## 1. CORRECTION LINGUISTIQUE EXHAUSTIVE
    - Orthographe lexicale et grammaticale
    - Grammaire (syntaxe, concordance des temps, pronoms)
    - Ponctuation française (espaces fines, guillemets français « », tirets cadratins —)
    - Typographie (majuscules accentuées, abréviations normalisées)

    ## 2. SUPPRESSION DES CÉSURES ET ARTEFACTS
    - Souder les mots coupés par césure en fin de ligne
    - Supprimer TOUS les astérisques, étoiles, underscores, tildes
    - Nettoyer les guillemets de code au profit des guillemets français

    ## 3. MISE EN FORME PROFESSIONNELLE
    - Structurer en paragraphes cohérents
    - Numéroter les sections de façon cohérente (1. / 1.1 / 1.1.1)
    - Mettre en gras les titres et sous-titres
    - Utiliser l'italique pour les citations

    ## 4. CONSIGNES ABSOLUES
    - AUCUNE introduction du type "Voici le texte corrigé..."
    - AUCUN commentaire sur les corrections apportées
    - AUCUN astérisque, AUCUNE étoile, AUCUN underscore
    - Donne UNIQUEMENT le texte final, propre et professionnel

    Texte à corriger :`,

            reformulation: `# RÔLE
    Tu es un expert en reformulation de textes professionnels. Tu travailles pour un cabinet de conseil en communication.

    # MISSION
    Reformule le texte fourni en conservant EXACTEMENT le même sens et les mêmes informations, mais avec un style différent et une qualité professionnelle irréprochable.

    # RÈGLES
    - Conserve TOUTES les informations du texte original
    - Ne change PAS le sens des phrases
    - Utilise des synonymes et des tournures de phrases différentes
    - Améliore la fluidité et la lisibilité
    - Conserve le même niveau de langue et le même ton
    - Garde la même longueur approximative
    - Structure en paragraphes cohérents
    - Donne UNIQUEMENT le texte reformulé
    - AUCUNE introduction, AUCUN commentaire, AUCUN astérisque

    Texte à reformuler :`,

            summarize: `# RÔLE
    Tu es un expert en analyse et synthèse de documents. Ta spécialité est d'extraire l'essentiel d'un texte complexe et de le présenter de manière claire, structurée et pédagogique.

    # MISSION
    Analyse le texte fourni et produis un résumé structuré qui met en évidence les concepts et notions clés.

    # INSTRUCTIONS

    ## 1. Analyse préalable
    - Identifie le thème principal et les thèmes secondaires
    - Repère les concepts fondamentaux et leur définition
    - Détecte les relations logiques entre les idées
    - Note les arguments, preuves et exemples significatifs

    ## 2. Structure du résumé

    I. IDENTIFICATION
    - Titre : Donne un titre évocateur au texte
    - Thème : Résume le sujet en une phrase
    - Type : Nature du document (article, essai, rapport...)
    - Tonalité : Objectif, argumentatif, descriptif...

    II. RÉSUMÉ NARRATIF (5-10 lignes)
    Rédige un paragraphe fluide qui capture l'essence du texte, sa problématique et sa conclusion principale.

    III. CONCEPTS CLÉS
    Pour chaque concept majeur identifié, présente :
    - Définition : Une définition claire et concise
    - Contexte : Comment ce concept s'inscrit dans le texte
    - Importance : Pourquoi ce concept est essentiel

    IV. STRUCTURE LOGIQUE
    - Idée principale : La thèse ou le message central
    - Arguments : Les 3-5 arguments majeurs qui soutiennent l'idée
    - Preuves : Faits, données ou exemples clés
    - Implications : Conséquences ou applications pratiques

    V. SYNTHÈSE FINALE (3-5 lignes)
    Un paragraphe concis qui capture le message essentiel, la contribution du texte et une ouverture.

    # RÈGLES DE FORMAT
    - Utilise des titres clairs pour chaque section
    - Mets en gras les concepts clés à leur première occurrence
    - Numérote les listes pour faciliter la lecture
    - Garde une longueur totale proportionnelle au texte source (environ 20-30%)
    - Pas d'astérisques, pas de markdown, pas d'emojis

    # RÈGLES DE QUALITÉ
    - Sois fidèle au texte original (ne pas ajouter d'idées extérieures)
    - Sois précis dans les définitions
    - Sois hiérarchique dans l'organisation des idées
    - Sois concis sans sacrifier la clarté
    - Sois objectif (ne pas donner d'avis personnel)

    Texte à analyser :`,

            expose: `# RÔLE
    Tu es un expert en communication orale et écrite. Ta spécialité est de transformer des informations complexes en un exposé structuré, clair et captivant, adapté à une présentation orale.

    # MISSION
    À partir du texte ou du sujet fourni, produis un exposé complet et structuré, prêt à être présenté.

    # INSTRUCTIONS

    ## 1. STRUCTURE DE L'EXPOSÉ

    INTRODUCTION (10% du temps)
    - Accroche : Une phrase percutante pour capter l'attention (citation, statistique, question)
    - Présentation du sujet : Définition claire du thème
    - Problématique : La question centrale que l'exposé va traiter
    - Annonce du plan : Les grandes parties annoncées clairement

    DÉVELOPPEMENT (80% du temps)
    Pour chaque partie :
    - Titre de la partie : Clair et annonciateur
    - Idée principale : Une phrase qui résume la partie
    - Arguments (2-3 par partie) : Avec exemples, données, citations
    - Transition : Phrase de liaison vers la partie suivante

    CONCLUSION (10% du temps)
    - Synthèse : Résumé des points principaux (3 phrases maximum)
    - Réponse à la problématique : Claire et concise
    - Ouverture : Élargissement du sujet ou question pour le débat

    ## 2. RÈGLES DE RÉDACTION POUR L'ORAL
    - Phrases courtes et rythmées
    - Vocabulaire accessible mais précis
    - Répétitions volontaires des idées clés pour ancrer le message
    - Questions rhétoriques pour impliquer l'auditoire
    - Connecteurs logiques clairs (tout d'abord, ensuite, enfin, en conclusion)

    ## 3. FORMAT
    - Indique la durée estimée de présentation
    - Indique les moments clés (accroche, transition, conclusion)
    - Pas d'astérisques ni de markdown

    Sujet à traiter :`,

            report: `RÔLE
    Tu es un consultant expert en rédaction de rapports professionnels pour des cabinets de conseil internationaux.

    # MISSION
    À partir des informations fournies, produis un rapport complet avec tableaux formatés, prêt à être imprimé ou exporté.

    # STRUCTURE DU RAPPORT

    PAGE DE GARDE (Titre, Sous-titre, Date, Auteur, Classification)
    RÉSUMÉ EXÉCUTIF (encadré avec ┌───┐)
    1. INTRODUCTION
    2. ANALYSE DÉTAILLÉE
    3. TABLEAUX DE DONNÉES (format pipe | avec alignement :---)
    4. RECOMMANDATIONS (tableau avec N°, Recommandation, Priorité, Impact, Délai, Responsable)
    5. PLAN D'ACTION (tableau avec Action, Responsable, Échéance, Priorité)
    6. CONCLUSION

    # RÈGLES DE FORMAT
    - Les tableaux DOIVENT utiliser le format pipe | avec alignement (:---)
    - Pour les séparateurs de section, utilise UNIQUEMENT un saut de ligne double
    - N'utilise JAMAIS de ligne de tirets (---) comme séparateur entre les sections
    - N'utilise JAMAIS d'astérisques pour la mise en forme
    - N'utilise JAMAIS de markdown (pas de #, pas de **, pas de ___)
    - Pour les titres, utilise des MAJUSCULES suivies d'un saut de ligne
    - Pour les sous-titres, utilise la Capitalisation Simple

    # EXEMPLE DE FORMAT ATTENDU

    TITRE DU RAPPORT

    1. INTRODUCTION
    Texte de l'introduction...

    2. ANALYSE DÉTAILLÉE
    Texte de l'analyse...

    TABLEAU 1 : Données
    | Colonne A | Colonne B | Colonne C |
    |:----------|:----------|:----------|
    | Valeur 1  | Valeur 2  | Valeur 3  |
    | Valeur 4  | Valeur 5  | Valeur 6  |

    3. CONCLUSION
    Texte de conclusion...

    Texte source / Notes :`,

            course: `# RÔLE
    Tu es un professeur agrégé, auteur de manuels scolaires de référence. Tes cours sont utilisés dans les établissements d'enseignement supérieur. Ta mise en page est exemplaire.

    # MISSION
    Conçois un cours complet comprenant une présentation théorique, des exemples concrets, un exercice d'application avec corrigé détaillé, et un exercice sommatif avec corrigé.

    # INSTRUCTIONS

    ## 1. ANALYSE PRÉALABLE
    - Identifie le public cible et son niveau
    - Définis les prérequis nécessaires
    - Formule les objectifs pédagogiques (3 à 5)
    - Structure la progression logique des notions

    ## 2. STRUCTURE DU COURS

    FICHE PÉDAGOGIQUE
    - Titre du cours, Public cible, Durée estimée, Prérequis, Objectifs pédagogiques

    PARTIE 1 : CONTENU THÉORIQUE
    Pour chaque notion : Introduction, Définition, Développement, Illustration, Transition

    PARTIE 2 : EXEMPLES CONCRETS (3 à 5 exemples variés)
    - Exemple 1 : Cas simple
    - Exemple 2 : Cas intermédiaire
    - Exemple 3 : Cas complexe
    Pour chaque exemple : énoncé, démarche, solution commentée
    Inclus des contre-exemples pour clarifier les erreurs fréquentes

    PARTIE 3 : EXERCICE D'APPLICATION (3 niveaux progressifs)
    Niveau 1 - Application directe : 2-3 questions simples
    Niveau 2 - Mobilisation combinée : 2-3 questions intermédiaires
    Niveau 3 - Transfert : 1-2 questions complexes

    CORRIGÉ DÉTAILLÉ DE L'EXERCICE
    Pour chaque question : Réponse attendue, Méthode de résolution, Pièges à éviter, Critères de réussite

    PARTIE 4 : EXERCICE SOMMATIF
    Partie A - Restitution (30% des points) : Questions de connaissance
    Partie B - Application (40% des points) : Exercices pratiques
    Partie C - Synthèse (30% des points) : Question ouverte ou étude de cas

    CORRIGÉ DE L'EXERCICE SOMMATIF
    Grille d'évaluation, Exemple de réponse attendue, Commentaires

    ## 3. FORMAT DES TABLEAUX (OBLIGATOIRE)
    TABLEAU PÉDAGOGIQUE : [Titre]
    | Critère | Description | Exemple |
    |:--------|:------------|:--------|
    | [Nom]   | [Desc]      | [Ex]    |

    ## 4. RÈGLES DE FORMAT
    - Structure aérée avec titres et sous-titres explicites
    - Mise en gras des notions clés à leur première occurrence
    - Tableaux avec format pipe et alignement
    - Pas d'astérisques, pas de markdown complexe
    - Progressivité du simple au complexe

    Sujet du cours :`
        };
        
        return prompts[action] || prompts.formatting;
    },
    
    cleanGeneratedText(text) {
        if (!text || typeof text !== 'string') return '';
        let cleaned = text;
        
        // ============================================================
        // ÉTAPE 1 : SUPPRIMER TOUTES LES INTRODUCTIONS IA
        // ============================================================
        const introPatterns = [
            /^Absolument[\s\S]*?\n\n/i,
            /^Bien sûr[\s\S]*?\n\n/i,
            /^Certainement[\s\S]*?\n\n/i,
            /^Voici[\s\S]*?\n\n/i,
            /^Assistant[\s\S]*?\n\n/i,
            /^Here[\s\S]*?\n\n/i,
            /^Sure[\s\S]*?\n\n/i,
            /^Je vais[\s\S]*?\n\n/i,
            /^D'accord[\s\S]*?\n\n/i,
            /^OK[\s\S]*?\n\n/i,
            /^Parfait[\s\S]*?\n\n/i,
            /^Très bien[\s\S]*?\n\n/i,
            /^Je comprends[\s\S]*?\n\n/i,
            /^Compris[\s\S]*?\n\n/i,
            /^Pas de problème[\s\S]*?\n\n/i,
        ];
        
        for (const pattern of introPatterns) {
            cleaned = cleaned.replace(pattern, '');
        }
        
        // ============================================================
        // ÉTAPE 2 : SUPPRIMER TOUTES LES CONCLUSIONS IA
        // ============================================================
        const conclusionPatterns = [
            /N'hésitez pas[\s\S]*$/i,
            /N'hésite pas[\s\S]*$/i,
            /J'espère que[\s\S]*$/i,
            /Si vous avez[\s\S]*$/i,
            /Pour toute question[\s\S]*$/i,
            /Je reste à votre disposition[\s\S]*$/i,
            /N'oubliez pas[\s\S]*$/i,
            /Bon courage[\s\S]*$/i,
            /Bonne continuation[\s\S]*$/i,
        ];
        
        for (const pattern of conclusionPatterns) {
            cleaned = cleaned.replace(pattern, '');
        }
        
        // ============================================================
        // ÉTAPE 3 : SUPPRIMER LES ASTERISQUES ET UNDERSCORES
        // ============================================================
        cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1');
        cleaned = cleaned.replace(/\*(.*?)\*/g, '$1');
        cleaned = cleaned.replace(/__(.*?)__/g, '$1');
        cleaned = cleaned.replace(/_(.*?)_/g, '$1');
        cleaned = cleaned.replace(/\*/g, '');
        
        // ============================================================
        // ÉTAPE 4 : SUPPRIMER LES SÉPARATEURS MARKDOWN
        // ============================================================
        cleaned = cleaned.replace(/^---+$/gm, '');
        cleaned = cleaned.replace(/^\*{3,}$/gm, '');
        cleaned = cleaned.replace(/^===+$/gm, '');
        cleaned = cleaned.replace(/^___+$/gm, '');
        cleaned = cleaned.replace(/^###+$/gm, '');
        
        // ============================================================
        // ÉTAPE 5 : NETTOYAGE FINAL
        // ============================================================
        cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
        cleaned = cleaned.replace(/^\n+/, '');
        cleaned = cleaned.replace(/\n+$/, '');
        
        return cleaned.trim();
    }
};