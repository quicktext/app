// QuickText Voice Pro - Module de Traduction via Edge Function Supabase
const TranslationModule = {
    edgeFunctionUrl: 'https://zhvdyjpevrqteirqeztb.supabase.co/functions/v1/translate-proxy',

    async translate(text, targetLang) {
        if (!text || !text.trim()) {
            throw new Error('Aucun texte à traduire');
        }

        const langCode = targetLang.split('-')[0];
        const maxChars = 3000;

        // Découper le texte en morceaux
        const chunks = [];
        for (let i = 0; i < text.length; i += maxChars) {
            chunks.push(text.substring(i, i + maxChars));
        }

        const translations = [];

        // Récupérer la clé anonyme Supabase (déjà chargée par CreditModule)
        const anonKey = CreditModule.config.anonKey;

        for (const chunk of chunks) {
            const params = new URLSearchParams({
                text: chunk,
                target: langCode
            });
            const url = this.edgeFunctionUrl + '?' + params.toString();

            const response = await fetch(url, {
                headers: {
                    'Authorization': 'Bearer ' + anonKey,
                    'apikey': anonKey
                }
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error('Erreur de traduction: ' + error);
            }

            const result = await response.json();
            if (result.translated) {
                translations.push(result.translated);
            } else {
                throw new Error(result.error || 'Réponse invalide');
            }
        }

        return translations.join(' ');
    }
};