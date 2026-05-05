// QuickText Voice Pro - Module de Traduction
const TranslationModule = {
    async translate(text, targetLang) {
        if (!text || !text.trim()) {
            throw new Error('Aucun texte a traduire');
        }
        
        const langCode = targetLang.split('-')[0];
        const maxChars = 3000;
        
        const chunks = [];
        for (let i = 0; i < text.length; i += maxChars) {
            chunks.push(text.substring(i, i + maxChars));
        }
        
        const translations = [];
        
        for (const chunk of chunks) {
            const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' + 
                        langCode + '&dt=t&q=' + encodeURIComponent(chunk);
            
            const response = await fetch(url);
            if (!response.ok) throw new Error('Erreur de traduction');
            
            const data = await response.json();
            if (data && data[0]) {
                translations.push(data[0].map(item => item[0]).join(''));
            }
        }
        
        return translations.join(' ');
    }
};
