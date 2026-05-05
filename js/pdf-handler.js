// QuickText Voice Pro - Module PDF
// Version corrigée - Extraction complète des PDFs longs

const PDFModule = {
    config: {
        maxFileSize: 50 * 1024 * 1024, // 50 Mo
        workerSrc: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
    },
    
    async extractText(file) {
        // Vérifier la taille du fichier
        if (file.size > this.config.maxFileSize) {
            throw new Error('Fichier trop volumineux (max 50 Mo)');
        }
        
        // Vérifier que PDF.js est chargé
        if (typeof pdfjsLib === 'undefined') {
            throw new Error('PDF.js non charge. Verifiez votre connexion internet.');
        }
        
        // Configurer le worker
        if (pdfjsLib.GlobalWorkerOptions) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = this.config.workerSrc;
        }
        
        console.log('PDF: Debut extraction - ' + (file.size / 1024 / 1024).toFixed(2) + ' Mo');
        
        const arrayBuffer = await file.arrayBuffer();
        
        // Options de chargement optimisées
        const loadingTask = pdfjsLib.getDocument({
            data: arrayBuffer,
            disableAutoFetch: false,
            disableStream: false,
            enableXfa: true // Support des formulaires XFA
        });
        
        const pdf = await loadingTask.promise;
        const numPages = pdf.numPages;
        
        console.log('PDF: ' + numPages + ' pages a traiter');
        
        let fullText = '';
        let emptyPages = 0;
        
        // Traiter toutes les pages
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            try {
                const page = await pdf.getPage(pageNum);
                
                // Extraire le contenu texte de la page
                const textContent = await page.getTextContent();
                
                // Organiser le texte par position Y (lignes)
                const lines = {};
                const tolerance = 5;
                
                textContent.items.forEach(item => {
                    if (!item.str || !item.str.trim()) return;
                    
                    const y = Math.round(item.transform[5] / tolerance) * tolerance;
                    
                    if (!lines[y]) {
                        lines[y] = [];
                    }
                    
                    lines[y].push({
                        text: item.str,
                        x: item.transform[4],
                        width: item.width || (item.str.length * 6)
                    });
                });
                
                // Trier les lignes par position Y (de haut en bas)
                const yValues = Object.keys(lines)
                    .map(Number)
                    .sort((a, b) => b - a); // Inversé car l'axe Y est vers le bas en PDF
                
                let pageText = '';
                let lastY = null;
                
                yValues.forEach(y => {
                    // Ajouter un saut de ligne entre les lignes
                    if (lastY !== null && Math.abs(y - lastY) > tolerance * 2) {
                        pageText += '\n';
                    }
                    
                    // Trier les éléments par position X (gauche à droite)
                    const elements = lines[y].sort((a, b) => a.x - b.x);
                    
                    let lineText = '';
                    let lastX = -1000;
                    
                    elements.forEach(el => {
                        const gap = el.x - lastX;
                        
                        if (lastX > -1000 && gap > 10) {
                            lineText += '  '; // Espacement entre colonnes
                        } else if (lastX > -1000 && gap > 3) {
                            lineText += ' ';
                        }
                        
                        lineText += el.text;
                        lastX = el.x + el.width;
                    });
                    
                    pageText += lineText.trim();
                    lastY = y;
                });
                
                if (pageText.trim()) {
                    if (fullText && !fullText.endsWith('\n\n')) {
                        fullText += '\n\n';
                    }
                    fullText += pageText.trim();
                } else {
                    emptyPages++;
                }
                
            } catch (pageError) {
                console.warn('PDF: Erreur page ' + pageNum + ':', pageError.message);
                // Continuer avec les autres pages
            }
        }
        
        console.log('PDF: Extraction terminee - ' + fullText.length + ' caracteres, ' + emptyPages + ' pages vides');
        
        if (!fullText.trim()) {
            // Essayer une extraction alternative (texte brut)
            console.log('PDF: Tentative extraction alternative...');
            
            for (let pageNum = 1; pageNum <= numPages; pageNum++) {
                try {
                    const page = await pdf.getPage(pageNum);
                    const textContent = await page.getTextContent();
                    
                    const pageText = textContent.items
                        .map(item => item.str)
                        .filter(s => s && s.trim())
                        .join(' ');
                    
                    if (pageText.trim()) {
                        if (fullText && !fullText.endsWith('\n\n')) {
                            fullText += '\n\n';
                        }
                        fullText += pageText.trim();
                    }
                } catch (e) {
                    // Ignorer les erreurs de page
                }
            }
            
            console.log('PDF: Extraction alternative - ' + fullText.length + ' caracteres');
        }
        
        if (!fullText.trim()) {
            throw new Error('Aucun texte extractible de ce PDF. Le document pourrait etre scanne ou protege.');
        }
        
        // Nettoyer le texte extrait
        return this.cleanText(fullText);
    },
    
    cleanText(text) {
        if (!text) return '';
        
        let cleaned = text;
        
        // Supprimer les caractères de contrôle
        cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
        
        // Normaliser les sauts de ligne
        cleaned = cleaned.replace(/\r\n/g, '\n');
        cleaned = cleaned.replace(/\r/g, '\n');
        
        // Supprimer les lignes vides multiples
        cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
        
        // Supprimer les espaces multiples
        cleaned = cleaned.replace(/[ \t]+/g, ' ');
        
        // Supprimer les espaces en début de ligne
        cleaned = cleaned.replace(/^[ \t]+/gm, '');
        
        // Supprimer les espaces en fin de ligne
        cleaned = cleaned.replace(/[ \t]+$/gm, '');
        
        // Corriger la ponctuation
        cleaned = cleaned.replace(/\s+([.,!?;:])/g, '$1');
        cleaned = cleaned.replace(/([.,!?;:])([^\s\d])/g, '$1 $2');
        
        // Supprimer les lignes qui ne contiennent que des chiffres (numéros de page)
        cleaned = cleaned.replace(/^\d+$/gm, '');
        
        // Supprimer les lignes vides en début et fin
        cleaned = cleaned.replace(/^\n+/, '');
        cleaned = cleaned.replace(/\n+$/, '');
        
        return cleaned.trim();
    },
    
    // Traiter le PDF par lots pour les très longs documents
    async extractTextInBatches(file, onProgress) {
        const text = await this.extractText(file);
        
        // Si le texte est très long, le découper en lots pour le traitement IA
        const batches = [];
        const maxBatchSize = 10000;
        
        for (let i = 0; i < text.length; i += maxBatchSize) {
            batches.push(text.substring(i, i + maxBatchSize));
        }
        
        if (onProgress) {
            onProgress(batches.length, text.length);
        }
        
        return {
            text: text,
            batches: batches,
            totalLength: text.length
        };
    }
};