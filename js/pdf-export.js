// QuickText Voice Pro - Module Export PDF
// Version finale - Logo top, ligne collée, espace avant titre, texte fixe

const PDFExportModule = {
    /**
     * Exporte le texte en PDF
     * @param {string} text - Texte à exporter
     * @param {string} title - Titre du document
     * @param {boolean} hideBranding - Masquer les mentions QuickText
     * @param {Object} customOptions - Options personnalisées
     */
    exportToPDF(text, title, hideBranding, customOptions) {
        if (typeof window.jspdf === 'undefined' && typeof jspdf === 'undefined') {
            throw new Error('jsPDF non chargé');
        }
        
        const { jsPDF } = window.jspdf || { jsPDF: jspdf };
        const opts = customOptions || {};
        
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });
        
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const marginLeft = 20;
        const marginRight = 20;
        const marginBottom = 25;
        
        // Position de début du corps du texte (fixe pour ne pas bouger)
        const TEXT_START_Y = 85;
        
        // Couleur du thème
        const hasThemeColor = opts.themeColor && opts.themeColor !== '' && opts.themeColor !== '#ffffff' && opts.themeColor !== '#fff';
        const themeColorHex = hasThemeColor ? opts.themeColor : '#9b59b6';
        const themeColor = this._hexToRGB(themeColorHex) || [155, 89, 182];
        const themeColorLight = themeColor.map(c => Math.min(255, c + 60));
        
        const colors = {
            primary: themeColor,
            dark: [26, 26, 46],
            text: [50, 50, 70],
            secondary: [100, 100, 120],
            accent: themeColorLight
        };
        
        let yPos = 0; // sera défini par addHeaderAndTitle
        let pageNumber = 1;
        
        // Logo
        let logoImg = null;
        let logoLoaded = false;
        
        if (opts.logoDataURL && opts.logoDataURL.startsWith('data:image')) {
            logoImg = new Image();
            logoImg.src = opts.logoDataURL;
            logoLoaded = true;
        }
        
        // ============================================================
        // FONCTIONS
        // ============================================================
        
        function addPage() {
            doc.addPage();
            pageNumber++;
            // Sur les nouvelles pages, on commence à la marge haute (20mm)
            yPos = 20;
        }
        
        function checkPageSpace(neededSpace) {
            if (yPos + neededSpace > pageHeight - marginBottom) {
                addFooter();
                addPage();
                return true;
            }
            return false;
        }
        
        function addFooter() {
            if (!opts.showPagination && hideBranding) return;
            
            const footerY = pageHeight - 12;
            
            if (opts.showPagination) {
                doc.setFontSize(8);
                doc.setTextColor(...colors.secondary);
                doc.setDrawColor(...colors.accent);
                doc.setLineWidth(0.3);
                doc.line(marginLeft, footerY - 5, pageWidth - marginRight, footerY - 5);
                doc.text(String(pageNumber), pageWidth / 2, footerY, { align: 'center' });
            }
            
            if (!hideBranding) {
                doc.setFontSize(7);
                doc.text('QuickText Voice Pro', marginLeft, footerY);
            }
        }
        
        /**
         * Dessine l'en-tête (logo + ligne) et retourne la position Y pour le titre.
         */
        function addHeader() {
            if (logoLoaded && logoImg) {
                const logoSize = 54;
                let logoX;
                
                switch (opts.logoPosition || 'center') {
                    case 'left': logoX = marginLeft; break;
                    case 'right': logoX = pageWidth - marginRight - logoSize; break;
                    case 'center':
                    default: logoX = (pageWidth - logoSize) / 2; break;
                }
                
                // Logo collé tout en haut (y=0)
                try {
                    doc.addImage(logoImg, 'PNG', logoX, 0, logoSize, logoSize);
                } catch (e) {
                    console.warn('Logo non ajouté:', e);
                }
                
                // Ligne juste sous le logo, sans espace
                doc.setDrawColor(...colors.primary);
                doc.setLineWidth(0.6);
                doc.line(marginLeft, logoSize, pageWidth - marginRight, logoSize);
                
                // Position après l'en-tête = sous la ligne + espace avant titre
                return logoSize + 10; // 10mm d'espace après la ligne avant le titre
            } else {
                // Pas de logo : ligne en haut de la page (à 18mm) avec espace avant titre
                const lineY = 18;
                doc.setDrawColor(...colors.primary);
                doc.setLineWidth(0.6);
                doc.line(marginLeft, lineY, pageWidth - marginRight, lineY);
                return lineY + 10;
            }
        }
        
        function addTitle(text) {
            checkPageSpace(20);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(16);
            doc.setTextColor(...colors.dark);
            doc.text(text, marginLeft, yPos);
            yPos += 8;
        }
        
        function addSubtitle(text) {
            checkPageSpace(14);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.setTextColor(...colors.primary);
            doc.text(text, marginLeft, yPos);
            yPos += 6;
        }
        
        function addParagraph(text) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(...colors.text);
            
            const cleanText = text.trim();
            if (!cleanText) return;
            
            const lines = doc.splitTextToSize(cleanText, pageWidth - marginLeft - marginRight);
            const lineHeight = 5;
            
            checkPageSpace(lines.length * lineHeight + 3);
            
            for (const line of lines) {
                if (yPos > pageHeight - marginBottom) { addFooter(); addPage(); }
                doc.text(line, marginLeft, yPos);
                yPos += lineHeight;
            }
            
            yPos += 3;
        }
        
        function addBulletPoint(text) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(...colors.text);
            
            const bulletText = '•  ' + text.trim();
            const lines = doc.splitTextToSize(bulletText, pageWidth - marginLeft - marginRight - 5);
            const lineHeight = 5;
            
            checkPageSpace(lines.length * lineHeight + 3);
            
            for (let i = 0; i < lines.length; i++) {
                if (yPos > pageHeight - marginBottom) { addFooter(); addPage(); }
                if (i === 0) doc.text(lines[i], marginLeft + 3, yPos);
                else doc.text('   ' + lines[i], marginLeft + 3, yPos);
                yPos += lineHeight;
            }
            yPos += 1;
        }
        
        function addDivider() {
            yPos += 3;
            checkPageSpace(5);
            doc.setDrawColor(...colors.accent);
            doc.setLineWidth(0.3);
            doc.line(marginLeft, yPos, pageWidth - marginRight, yPos);
            yPos += 5;
        }
        
        function formatDate() {
            const now = new Date();
            const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
            const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
            
            return jours[now.getDay()] + ' ' + now.getDate() + ' ' + mois[now.getMonth()] + ' ' + now.getFullYear() +
                   ' à ' + String(now.getHours()).padStart(2, '0') + 'h' + String(now.getMinutes()).padStart(2, '0');
        }
        
        // ============================================================
        // GÉNÉRATION
        // ============================================================
        
        // En-tête (logo + ligne) -> yPos positionné pour le titre
        yPos = addHeader();
        
        // Titre du document
        const docTitle = title || 'Document QuickText';
        addTitle(docTitle);
        
        // Date (si activée)
        if (opts.showDate) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(9);
            doc.setTextColor(...colors.secondary);
            doc.text(formatDate(), marginLeft, yPos);
            yPos += 8;
        }
        
        // ---- Forcer le début du texte à TEXT_START_Y ----
        if (yPos < TEXT_START_Y) {
            yPos = TEXT_START_Y;
        }
        // ------------------------------------------------
        
        // Texte principal
        const paragraphs = text.split(/\n\n+/);
        for (const paragraph of paragraphs) {
            const trimmed = paragraph.trim();
            if (!trimmed) continue;
            
            const lines = trimmed.split('\n');
            
            if (lines.length === 1 && /^[A-Z\u00C0-\u00DC][^a-z]*$/.test(trimmed) && trimmed.length < 80) {
                addSubtitle(trimmed);
            } else if (lines.length === 1 && /^[IVX]+\.\s/.test(trimmed)) {
                addSubtitle(trimmed);
            } else if (lines.length === 1 && /^\d+\.\s/.test(trimmed)) {
                addSubtitle(trimmed);
            } else if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
                const bulletItems = trimmed.split(/\n/);
                for (const item of bulletItems) {
                    const cleanItem = item.replace(/^[•\-*]\s*/, '');
                    if (cleanItem.trim()) addBulletPoint(cleanItem.trim());
                }
            } else if (lines.every(l => l.match(/^[•\-*]\s/))) {
                for (const line of lines) {
                    const cleanLine = line.replace(/^[•\-*]\s*/, '');
                    if (cleanLine.trim()) addBulletPoint(cleanLine.trim());
                }
            } else {
                addParagraph(trimmed);
            }
        }
        
        // Métadonnées
        if (!hideBranding) {
            addDivider();
            yPos += 2;
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(8);
            doc.setTextColor(...colors.secondary);
            doc.text('Document généré par QuickText Voice Pro — ' + formatDate(), pageWidth / 2, yPos, { align: 'center' });
        }
        
        addFooter();
        
        const sanitizedTitle = (title || 'document').replace(/[^a-z0-9\-_]/gi, '_').substring(0, 50);
        doc.save(sanitizedTitle + '.pdf');
        
        return sanitizedTitle + '.pdf';
    },
    
    _hexToRGB(hex) {
        if (!hex || hex === '') return null;
        hex = hex.replace('#', '').trim();
        if (hex.length === 3) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }
        if (hex.length !== 6) return [155, 89, 182];
        const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [
            parseInt(result[1], 16),
            parseInt(result[2], 16),
            parseInt(result[3], 16)
        ] : [155, 89, 182];
    }
};