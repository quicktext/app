// QuickText Voice Pro - Module Export Audio
// Version corrigée - Export audio fonctionnel

const AudioExportModule = {
    config: {
        maxTotalChars: 10000,
        maxSegmentSize: 150,
        rateLimitDelay: 2000,
        maxRetries: 2,
        timeout: 15000,
        maxSegments: 50 // Maximum 50 segments pour éviter les blocages
    },
    
    async exportToAudio(text, lang, onProgress) {
        const langCode = lang.split('-')[0];
        
        // Limiter la taille totale du texte
        let textToProcess = text;
        let truncated = false;
        
        if (text.length > this.config.maxTotalChars) {
            textToProcess = text.substring(0, this.config.maxTotalChars);
            truncated = true;
            console.log('Audio: Texte tronque a ' + this.config.maxTotalChars + ' caracteres');
        }
        
        // Nettoyer le texte pour l'audio
        textToProcess = this.cleanTextForAudio(textToProcess);
        
        // Découper le texte en segments
        const segments = this.splitText(textToProcess, this.config.maxSegmentSize);
        
        // Limiter le nombre de segments
        let limitedSegments = segments.slice(0, this.config.maxSegments);
        
        if (segments.length > this.config.maxSegments) {
            truncated = true;
            console.log('Audio: Limite a ' + this.config.maxSegments + ' segments (sur ' + segments.length + ')');
        }
        
        if (limitedSegments.length === 0) {
            throw new Error('Aucun segment audio a generer');
        }
        
        console.log('Audio: ' + limitedSegments.length + ' segments pour ' + textToProcess.length + ' caracteres');
        
        const blobs = [];
        let consecutiveFailures = 0;
        const maxConsecutiveFailures = 5;
        
        for (let i = 0; i < limitedSegments.length; i++) {
            let segment = limitedSegments[i].trim();
            if (!segment) continue;
            
            // Vérifier que le segment se termine par une ponctuation
            const lastChar = segment.charAt(segment.length - 1);
            if (!/[.!?;:,]/.test(lastChar) && i < limitedSegments.length - 1) {
                segment += '.';
            }
            
            if (onProgress) onProgress(i + 1, limitedSegments.length);
            
            // Vérifier si on a trop d'échecs consécutifs
            if (consecutiveFailures >= maxConsecutiveFailures) {
                console.warn('Audio: Trop d\'echecs consecutifs, arret');
                break;
            }
            
            let success = false;
            
            for (let retry = 0; retry <= this.config.maxRetries; retry++) {
                try {
                    const blob = await this.fetchAudioSegment(segment, langCode);
                    
                    if (blob && blob.size > 0) {
                        blobs.push(blob);
                        success = true;
                        consecutiveFailures = 0;
                        console.log('Audio: Segment ' + (i + 1) + '/' + limitedSegments.length + ' OK (' + segment.length + ' car.)');
                        break;
                    }
                } catch (err) {
                    console.warn('Audio: Segment ' + (i + 1) + ' tentative ' + (retry + 1) + ' echouee:', err.message);
                    
                    if (err.message.includes('429') || err.message.includes('Too Many Requests')) {
                        // Attendre plus longtemps en cas de rate limiting
                        console.log('Audio: Rate limiting detecte, pause de 5 secondes...');
                        await this.delay(5000);
                    } else if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
                        consecutiveFailures = maxConsecutiveFailures;
                        break;
                    }
                }
                
                // Attendre entre les tentatives
                if (!success && retry < this.config.maxRetries) {
                    await this.delay(this.config.rateLimitDelay);
                }
            }
            
            if (!success) {
                consecutiveFailures++;
                console.warn('Audio: Echec segment ' + (i + 1) + ' apres ' + (this.config.maxRetries + 1) + ' tentatives');
            }
            
            // Pause entre les segments
            if (i < limitedSegments.length - 1 && consecutiveFailures < maxConsecutiveFailures) {
                await this.delay(this.config.rateLimitDelay);
            }
        }
        
        if (blobs.length === 0) {
            throw new Error(
                'Aucun segment audio genere.\n\n' +
                'Causes possibles :\n' +
                '- Limite Google atteinte (reessayez dans quelques minutes)\n' +
                '- Probleme de connexion internet\n' +
                '- Utilisez l\'export TXT a la place'
            );
        }
        
        // Créer le blob final
        const finalBlob = new Blob(blobs, { type: 'audio/mpeg' });
        
        console.log('Audio: Fichier final = ' + blobs.length + ' segments, ' + 
                    Math.round(finalBlob.size / 1024) + ' Ko');
        
        return {
            blob: finalBlob,
            truncated: truncated,
            segmentCount: blobs.length,
            totalSegments: limitedSegments.length
        };
    },
    
    async fetchAudioSegment(segment, langCode) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
        
        try {
            const url = 'https://translate.google.com/translate_tts?ie=UTF-8&q=' +
                        encodeURIComponent(segment) + '&tl=' + langCode + '&client=tw-ob';
            
            const response = await fetch(url, {
                method: 'GET',
                signal: controller.signal,
                headers: {
                    'Accept': 'audio/mpeg, audio/*'
                }
            });
            
            clearTimeout(timeoutId);
            
            if (response.status === 429) {
                throw new Error('429 Too Many Requests');
            }
            
            if (response.status === 503) {
                throw new Error('503 Service Unavailable');
            }
            
            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }
            
            const blob = await response.blob();
            
            // Vérifier que le blob est un audio valide
            if (blob.size === 0) {
                throw new Error('Blob audio vide');
            }
            
            if (blob.size < 100) {
                // Probablement une réponse d'erreur HTML
                throw new Error('Blob audio trop petit (' + blob.size + ' octets)');
            }
            
            return blob;
            
        } catch (err) {
            clearTimeout(timeoutId);
            
            if (err.name === 'AbortError') {
                throw new Error('Timeout audio');
            }
            
            throw err;
        }
    },
    
    cleanTextForAudio(text) {
        if (!text) return '';
        
        let cleaned = text;
        
        // Supprimer les caractères non prononçables
        cleaned = cleaned.replace(/[*_~`#]/g, '');
        cleaned = cleaned.replace(/\[.*?\]/g, ''); // Supprimer [crochets]
        cleaned = cleaned.replace(/\(.*?\)/g, ''); // Supprimer (parenthèses)
        cleaned = cleaned.replace(/\{.*?\}/g, ''); // Supprimer {accolades}
        
        // Supprimer les URLs
        cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, '');
        
        // Supprimer les emojis et caractères spéciaux
        cleaned = cleaned.replace(/[\u{1F600}-\u{1F64F}]/gu, '');
        cleaned = cleaned.replace(/[\u{1F300}-\u{1F5FF}]/gu, '');
        cleaned = cleaned.replace(/[\u{1F680}-\u{1F6FF}]/gu, '');
        cleaned = cleaned.replace(/[\u{2600}-\u{26FF}]/gu, '');
        cleaned = cleaned.replace(/[\u{2700}-\u{27BF}]/gu, '');
        
        // Remplacer les tirets par des virgules
        cleaned = cleaned.replace(/—/g, ', ');
        cleaned = cleaned.replace(/–/g, ', ');
        
        // Supprimer les guillemets
        cleaned = cleaned.replace(/[""''«»]/g, '');
        
        // Normaliser les espaces
        cleaned = cleaned.replace(/\s+/g, ' ');
        
        return cleaned.trim();
    },
    
    splitText(text, maxSize) {
        if (!text || text.length <= maxSize) {
            return text ? [text.trim()] : [];
        }
        
        const segments = [];
        let remaining = text;
        let safetyCounter = 0;
        const maxIterations = 1000;
        
        while (remaining.length > 0 && safetyCounter < maxIterations) {
            safetyCounter++;
            
            if (remaining.length <= maxSize) {
                const trimmed = remaining.trim();
                if (trimmed.length > 0) {
                    segments.push(trimmed);
                }
                break;
            }
            
            let chunk = remaining.substring(0, maxSize);
            
            // Chercher le meilleur point de coupure
            let cutPos = -1;
            
            // Priorité 1 : Fin de phrase (. ! ?)
            const endPuncts = ['. ', '! ', '? ', '." ', '!" ', '?" '];
            for (const punct of endPuncts) {
                const pos = chunk.lastIndexOf(punct);
                if (pos > cutPos && pos > maxSize * 0.3) {
                    cutPos = pos;
                }
            }
            
            // Priorité 2 : Point-virgule
            if (cutPos < maxSize * 0.4) {
                const pos = chunk.lastIndexOf('; ');
                if (pos > cutPos && pos > maxSize * 0.5) {
                    cutPos = pos;
                }
            }
            
            // Priorité 3 : Virgule
            if (cutPos < maxSize * 0.3) {
                const pos = chunk.lastIndexOf(', ');
                if (pos > cutPos && pos > maxSize * 0.6) {
                    cutPos = pos;
                }
            }
            
            // Priorité 4 : Espace
            if (cutPos < maxSize * 0.2) {
                const pos = chunk.lastIndexOf(' ');
                if (pos > maxSize * 0.5) {
                    cutPos = pos;
                }
            }
            
            // Fallback : couper à la taille max
            if (cutPos < 10) {
                cutPos = maxSize - 1;
            }
            
            const segment = remaining.substring(0, cutPos + 1).trim();
            
            if (segment.length > 5) {
                segments.push(segment);
            }
            
            remaining = remaining.substring(cutPos + 1).trim();
            
            // Sécurité anti-boucle
            if (remaining.length >= text.length) {
                break;
            }
        }
        
        return segments.filter(s => s.length > 0);
    },
    
    download(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 1000);
    },
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};