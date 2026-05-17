// QuickText Voice Pro - Module Export PDF + Word
// Version finale - Valeurs par défaut optimisées

const PDFExportModule = {
    exportToPDF(text, title, hideBranding, customOptions) {
        if (typeof window.jspdf === 'undefined' && typeof jspdf === 'undefined') {
            throw new Error('jsPDF non chargé');
        }
        
        const { jsPDF } = window.jspdf || { jsPDF: jspdf };
        const opts = customOptions || {};
        
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const marginLeft = 10;
        const marginRight = 10;
        const marginBottom = 10;
        const contentWidth = pageWidth - marginLeft - marginRight;
        
        // ✅ Valeurs par défaut
        const bodyFontSize = opts.bodyFontSize || 12;
        
        const FONT_SIZES = {
            title: opts.titleFontSize || 20,
            subtitle: opts.subtitleFontSize || 11,
            body: bodyFontSize,
            date: opts.dateFontSize || 7,
            footer: opts.footerFontSize || 7,
            metadata: opts.metadataFontSize || 7,
            h1: opts.h1FontSize || 12,
            h2: opts.h2FontSize || 11,
            h3: opts.h3FontSize || 10,
            tableHeader: bodyFontSize,
            tableBody: bodyFontSize
        };
        
        const SPACING = {
            headerToTitle: opts.headerToTitleSpacing || 15,
            titleToContent: opts.titleToContentSpacing || 20,
            paragraphToParagraph: opts.paragraphSpacing || 3,
            lineHeight: opts.lineHeight || 1.5,
            tableToContent: 8
        };
        
        const TITLE_ALIGN = opts.titleAlign || 'center';
        const TITLE_BOLD = opts.titleBold !== false;
        const TITLE_UNDERLINE = opts.titleUnderline === true;
        
        const hasThemeColor = opts.themeColor && opts.themeColor !== '' && opts.themeColor !== '#ffffff' && opts.themeColor !== '#fff';
        const themeColorHex = hasThemeColor ? opts.themeColor : '#000000';
        const themeColor = this._hexToRGB(themeColorHex) || [0, 0, 0];
        
        const colors = {
            primary: themeColor,
            dark: [26, 26, 46],
            text: [50, 50, 70],
            secondary: [100, 100, 120],
            tableBorder: [160, 160, 170]
        };
        
        let yPos = 0;
        let pageNumber = 1;
        let isFirstPage = true;
        
        let logoImg = null, logoLoaded = false;
        if (opts.logoDataURL && opts.logoDataURL.startsWith('data:image')) {
            logoImg = new Image(); logoImg.src = opts.logoDataURL; logoLoaded = true;
        }
        
        let headerImg = null, headerLoaded = false;
        if (opts.headerImageDataURL && opts.headerImageDataURL.startsWith('data:image')) {
            headerImg = new Image(); headerImg.src = opts.headerImageDataURL; headerLoaded = true;
        }
        
        const reportDate = this._formatDate();
        
        function addPage() {
            doc.addPage(); pageNumber++; isFirstPage = false; yPos = 10;
            doc.setFont('helvetica', 'normal'); doc.setFontSize(FONT_SIZES.body); doc.setTextColor(...colors.text);
        }
        
        function checkPageSpace(neededSpace) {
            if (yPos + neededSpace > pageHeight - marginBottom - 8) { addFooter(); addPage(); return true; }
            return false;
        }
        
        function addFooter() {
            const footerY = pageHeight - 7;
            doc.setFont('helvetica', 'normal'); doc.setFontSize(FONT_SIZES.footer); doc.setTextColor(...colors.secondary);
            if (opts.showPagination !== false) doc.text('— ' + pageNumber + ' —', marginLeft, footerY);
            if (opts.showDate !== false) doc.text(reportDate, pageWidth - marginRight, footerY, { align: 'right' });
            if (!hideBranding) { doc.setFontSize(6); doc.text('QuickText Voice Pro', pageWidth / 2, footerY, { align: 'center' }); }
        }
        
        function addHeader() {
            if (!isFirstPage) return;
            if (headerLoaded && headerImg) {
                const imgHeight = opts.headerImageHeight || 30;
                try { doc.addImage(headerImg, 'PNG', 0, 0, pageWidth, imgHeight); yPos = imgHeight + SPACING.headerToTitle; }
                catch (e) { yPos = 10 + SPACING.headerToTitle; }
            } else if (logoLoaded && logoImg) {
                const logoSize = 25;
                let logoX = (pageWidth - logoSize) / 2;
                switch (opts.logoPosition || 'center') { case 'left': logoX = marginLeft; break; case 'right': logoX = pageWidth - marginRight - logoSize; break; }
                try { doc.addImage(logoImg, 'PNG', logoX, 10, logoSize, logoSize); yPos = 10 + logoSize + SPACING.headerToTitle; }
                catch (e) { yPos = 10 + SPACING.headerToTitle; }
            } else { yPos = 10 + SPACING.headerToTitle; }
            if (yPos > pageHeight / 2) yPos = 40;
        }
        
        function addTitle(text) {
            checkPageSpace(30);
            doc.setFont('helvetica', TITLE_BOLD ? 'bold' : 'normal'); doc.setFontSize(FONT_SIZES.title); doc.setTextColor(...colors.dark);
            let titleX = marginLeft;
            const align = TITLE_ALIGN === 'center' ? 'center' : (TITLE_ALIGN === 'right' ? 'right' : 'left');
            if (align === 'center') titleX = pageWidth / 2; else if (align === 'right') titleX = pageWidth - marginRight;
            doc.text(text, titleX, yPos, { align: align });
            if (TITLE_UNDERLINE) {
                const titleWidth = doc.getTextWidth(text);
                let lineX = align === 'center' ? pageWidth/2 - titleWidth/2 : (align === 'right' ? pageWidth - marginRight - titleWidth : marginLeft);
                doc.setDrawColor(...colors.primary); doc.setLineWidth(0.4); doc.line(lineX, yPos + 1.5, lineX + titleWidth, yPos + 1.5);
            }
            yPos += SPACING.titleToContent;
        }
        
        function addH1(text) {
            checkPageSpace(14); doc.setFont('helvetica', 'bold'); doc.setFontSize(FONT_SIZES.h1);
            doc.setTextColor(...colors.primary); doc.text(text, marginLeft, yPos); yPos += 8;
        }
        
        function addH2(text) {
            checkPageSpace(12); doc.setFont('helvetica', 'bold'); doc.setFontSize(FONT_SIZES.h2);
            doc.setTextColor(...colors.dark); doc.text(text, marginLeft, yPos); yPos += 7;
        }
        
        function addParagraph(text) {
            doc.setFont('helvetica', 'normal'); doc.setFontSize(FONT_SIZES.body); doc.setTextColor(...colors.text);
            const cleanText = text.trim(); if (!cleanText) return;
            const align = opts.textAlign || 'justify';
            const lineHeight = FONT_SIZES.body * (SPACING.lineHeight / 3);
            
            if (align === 'justify') {
                const words = cleanText.split(/\s+/); let currentLine = '', lines = [];
                for (const word of words) {
                    const testLine = currentLine ? currentLine + ' ' + word : word;
                    if (doc.getTextWidth(testLine) > contentWidth && currentLine) { lines.push(currentLine.trim()); currentLine = word; }
                    else currentLine = testLine;
                }
                if (currentLine.trim()) lines.push(currentLine.trim());
                checkPageSpace(lines.length * lineHeight + SPACING.paragraphToParagraph);
                for (let i = 0; i < lines.length; i++) {
                    if (yPos > pageHeight - marginBottom - 8) { addFooter(); addPage(); }
                    const line = lines[i]; const isLastLine = i === lines.length - 1;
                    if (isLastLine || lines.length === 1) { doc.text(line, marginLeft, yPos); }
                    else {
                        const wordsInLine = line.split(/\s+/);
                        if (wordsInLine.length > 1) {
                            const lineWidth = doc.getTextWidth(line.replace(/\s+/g, ''));
                            const totalSpaces = contentWidth - lineWidth;
                            const spaceWidth = totalSpaces / (wordsInLine.length - 1);
                            let xPos = marginLeft;
                            for (let w = 0; w < wordsInLine.length; w++) { doc.text(wordsInLine[w], xPos, yPos); if (w < wordsInLine.length - 1) xPos += doc.getTextWidth(wordsInLine[w]) + spaceWidth; }
                        } else doc.text(line, marginLeft, yPos);
                    }
                    yPos += lineHeight;
                }
            } else {
                const lines = doc.splitTextToSize(cleanText, contentWidth);
                checkPageSpace(lines.length * lineHeight + SPACING.paragraphToParagraph);
                for (const line of lines) {
                    if (yPos > pageHeight - marginBottom - 8) { addFooter(); addPage(); }
                    if (align === 'center') doc.text(line, pageWidth / 2, yPos, { align: 'center' });
                    else if (align === 'right') doc.text(line, pageWidth - marginRight, yPos, { align: 'right' });
                    else doc.text(line, marginLeft, yPos);
                    yPos += lineHeight;
                }
            }
            yPos += SPACING.paragraphToParagraph;
        }
        
        function addBulletPoint(text) {
            doc.setFont('helvetica', 'normal'); doc.setFontSize(FONT_SIZES.body); doc.setTextColor(...colors.text);
            const bulletText = '— ' + text.trim();
            const lines = doc.splitTextToSize(bulletText, contentWidth - 3);
            const lineHeight = FONT_SIZES.body * (SPACING.lineHeight / 3);
            checkPageSpace(lines.length * lineHeight + 2);
            for (let i = 0; i < lines.length; i++) {
                if (yPos > pageHeight - marginBottom - 8) { addFooter(); addPage(); }
                doc.text(lines[i], marginLeft + 2, yPos); yPos += lineHeight;
            }
            yPos += SPACING.paragraphToParagraph;
        }
        
        function addTable(tableLines) {
            if (tableLines.length < 1) return;
            
            const dataRows = []; let headerRow = null; let columnAligns = [];
            
            for (const line of tableLines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) continue;
                const cells = trimmed.split('|').map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
                if (cells.length === 0) continue;
                if (cells.every(c => /^:?-{3,}:?$/.test(c))) {
                    columnAligns = cells.map(c => { if (c.startsWith(':') && c.endsWith(':')) return 'center'; if (c.endsWith(':')) return 'right'; return 'left'; });
                    continue;
                }
                if (!headerRow && dataRows.length === 0) headerRow = cells; else dataRows.push(cells);
            }
            
            if (!headerRow && dataRows.length === 0) return;
            if (!headerRow && dataRows.length > 0) headerRow = dataRows.shift();
            if (!headerRow) return;
            
            const numCols = headerRow.length; if (numCols === 0) return;
            const allRows = [headerRow, ...dataRows];
            
            const colWidths = [];
            for (let c = 0; c < numCols; c++) {
                let maxLen = 0;
                for (const row of allRows) { maxLen = Math.max(maxLen, doc.getTextWidth(row[c] || '')); }
                colWidths.push(Math.max(contentWidth * 0.15, Math.min(maxLen * 1.2, contentWidth * 0.5)));
            }
            const totalWidth = colWidths.reduce((a, b) => a + b, 0);
            const normalizedWidths = colWidths.map(w => (w / totalWidth) * contentWidth);
            
            const lineHeight = FONT_SIZES.tableBody * 0.4;
            const cellPadding = 1;
            
            function getCellHeight(text, cellWidth) {
                const lines = doc.splitTextToSize(text, cellWidth - cellPadding * 2);
                return Math.max(1, lines.length) * lineHeight + cellPadding * 2;
            }
            
            const rowHeights = [];
            let headerHeight = 0;
            for (let c = 0; c < numCols; c++) { headerHeight = Math.max(headerHeight, getCellHeight(headerRow[c] || '', normalizedWidths[c])); }
            rowHeights.push(headerHeight);
            for (let r = 0; r < dataRows.length; r++) {
                let maxRowHeight = lineHeight + cellPadding * 2;
                for (let c = 0; c < numCols; c++) { maxRowHeight = Math.max(maxRowHeight, getCellHeight(dataRows[r][c] || '', normalizedWidths[c])); }
                rowHeights.push(maxRowHeight);
            }
            
            const totalHeight = rowHeights.reduce((a, b) => a + b, 0) + 4;
            checkPageSpace(totalHeight + SPACING.tableToContent);
            
            let tableY = yPos;
            
            doc.setFont('helvetica', 'bold'); doc.setFontSize(FONT_SIZES.tableHeader);
            doc.setDrawColor(...colors.tableBorder); doc.setLineWidth(0.1);
            
            let xPos = marginLeft;
            for (let i = 0; i < numCols; i++) {
                const w = normalizedWidths[i];
                doc.rect(xPos, tableY, w, rowHeights[0], 'D');
                const cellText = headerRow[i] || '';
                const textLines = doc.splitTextToSize(cellText, w - cellPadding * 2);
                const totalTextHeight = textLines.length * lineHeight;
                const startY = tableY + (rowHeights[0] - totalTextHeight) / 2 + lineHeight * 0.8;
                for (let t = 0; t < textLines.length; t++) { doc.text(textLines[t], xPos + w/2, startY + t * lineHeight, { align: 'center' }); }
                xPos += w;
            }
            tableY += rowHeights[0];
            
            doc.setFont('helvetica', 'normal'); doc.setFontSize(FONT_SIZES.tableBody);
            doc.setDrawColor(...colors.tableBorder);
            
            for (let r = 0; r < dataRows.length; r++) {
                doc.setTextColor(...colors.text);
                const rowHeight = rowHeights[r + 1]; xPos = marginLeft;
                for (let i = 0; i < numCols; i++) {
                    const w = normalizedWidths[i];
                    doc.rect(xPos, tableY, w, rowHeight, 'D');
                    const cellText = dataRows[r][i] || '';
                    const textLines = doc.splitTextToSize(cellText, w - cellPadding * 2);
                    const align = columnAligns[i] || 'left';
                    const totalTextHeight = textLines.length * lineHeight;
                    const startY = tableY + (rowHeight - totalTextHeight) / 2 + lineHeight * 0.8;
                    for (let t = 0; t < textLines.length; t++) {
                        const textX = align === 'center' ? xPos + w/2 : (align === 'right' ? xPos + w - cellPadding : xPos + cellPadding);
                        doc.text(textLines[t], textX, startY + t * lineHeight, { align: align });
                    }
                    xPos += w;
                }
                tableY += rowHeight;
            }
            
            doc.setDrawColor(...colors.tableBorder); doc.setLineWidth(0.25);
            doc.rect(marginLeft, yPos, contentWidth, tableY - yPos);
            yPos = tableY + SPACING.tableToContent;
        }
        
        // ============================================================
        // GÉNÉRATION
        // ============================================================
        yPos = 0; isFirstPage = true; addHeader();
        const docTitle = title || ''; if (docTitle.trim()) addTitle(docTitle);
        
        const textLines = text.split('\n'); let i = 0, tableBuffer = [], inTable = false;
        
        while (i < textLines.length) {
            const line = textLines[i]; const trimmed = line.trim();
            const isTableLine = trimmed.startsWith('|') && trimmed.endsWith('|');
            if (isTableLine) { if (!inTable) { inTable = true; tableBuffer = []; } tableBuffer.push(trimmed); i++; continue; }
            if (inTable) { if (tableBuffer.length > 0) addTable(tableBuffer); tableBuffer = []; inTable = false; yPos += 2; }
            if (trimmed === '') { yPos += 2; }
            else if (/^[A-Z\u00C0-\u00DC][^a-z]{2,}$/.test(trimmed) && trimmed.length < 80) { addH1(trimmed); }
            else if (/^[A-Z][a-z]/.test(trimmed) && trimmed.length < 60 && !trimmed.endsWith('.')) { addH2(trimmed); }
            else if (trimmed.startsWith('- ') || trimmed.startsWith('— ') || trimmed.startsWith('• ')) { addBulletPoint(trimmed.replace(/^[—\-•]\s*/, '')); }
            else { addParagraph(trimmed); }
            i++;
        }
        if (inTable && tableBuffer.length > 0) addTable(tableBuffer);
        
        if (!hideBranding) {
            yPos += 4; doc.setFont('helvetica', 'italic'); doc.setFontSize(FONT_SIZES.metadata);
            doc.setTextColor(...colors.secondary);
            doc.text('Généré par QuickText Voice Pro — ' + reportDate, pageWidth / 2, yPos, { align: 'center' });
        }
        addFooter();
        
        const sanitizedTitle = (title || 'document').replace(/[^a-z0-9\-_]/gi, '_').substring(0, 50);
        doc.save(sanitizedTitle + '.pdf');
        return sanitizedTitle + '.pdf';
    },
    
    exportToWord(text, title, hideBranding, customOptions) {
        const htmlContent = this._convertToWordHTML(text, title, hideBranding, customOptions);
        const blob = new Blob(['\uFEFF' + htmlContent], { type: 'application/msword;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = (title || 'document').replace(/[^a-z0-9\-_]/gi, '_') + '.doc'; a.click(); URL.revokeObjectURL(a.href);
    },
    
    _convertToWordHTML(text, title, hideBranding, customOptions) {
        const opts = customOptions || {};
        const themeColor = opts.themeColor || '#000000'; const showDate = opts.showDate !== false;
        const titleAlign = opts.titleAlign || 'center'; const textAlign = opts.textAlign || 'justify';
        const titleFontSize = opts.titleFontSize || 20; const bodyFontSize = opts.bodyFontSize || 12;
        const reportDate = this._formatDate();
        let cssTextAlign = textAlign; if (textAlign === 'justify') cssTextAlign = 'justify';
        
        let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8"><title>${this._esc(title || 'Document')}</title>
<style>
@page { margin: 1cm; }
body { font-family: 'Calibri', sans-serif; font-size: ${bodyFontSize}pt; color: #323246; line-height: 1.5; margin: 0; padding: 0; }
h1 { font-size: ${titleFontSize}pt; color: ${themeColor}; margin-top: 12pt; margin-bottom: 6pt; border: none; text-align: ${titleAlign}; }
h2 { font-size: 12pt; color: #5b2c6f; margin-top: 10pt; margin-bottom: 4pt; }
p { margin-bottom: 4pt; text-align: ${cssTextAlign}; }
table { border-collapse: collapse; width: 100%; margin: 0 0 12pt 0; }
th { background-color: white; color: #323246; padding: 4pt 6pt; font-size: ${bodyFontSize}pt; font-weight: bold; border: 1px solid #b4b4c8; text-align: center; vertical-align: middle; word-wrap: break-word; }
td { border: 1px solid #b4b4c8; padding: 3pt 6pt; font-size: ${bodyFontSize}pt; background-color: white; vertical-align: middle; word-wrap: break-word; }
li { margin-bottom: 2pt; }
.footer { text-align: center; font-size: 7pt; color: #9696a0; margin-top: 20pt; border-top: 1px solid #d0d0e0; padding-top: 6pt; }
</style></head><body>`;
        
        html += `<h1>${this._esc(title || 'Document')}</h1>\n`;
        if (showDate) html += `<p style="text-align:right;font-size:8pt;color:#646478;">${reportDate}</p>\n`;
        
        const lines = text.split('\n'); let inTable = false, tableHTML = '', isFirstRow = true, hasHeader = false;
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
                if (!inTable) { tableHTML = '<table>\n'; inTable = true; isFirstRow = true; hasHeader = false; }
                if (trimmed.replace(/[\|\-\s:]/g, '') === '') { hasHeader = true; continue; }
                const cells = trimmed.split('|').filter(c => c.trim() !== '');
                const tag = (isFirstRow && !hasHeader) ? 'th' : 'td';
                tableHTML += '<tr>\n'; cells.forEach(cell => { tableHTML += `<${tag}>${this._esc(cell.trim())}</${tag}>\n`; });
                tableHTML += '</tr>\n'; isFirstRow = false;
            } else {
                if (inTable) { tableHTML += '</table>\n'; html += tableHTML; tableHTML = ''; inTable = false; }
                if (trimmed === '') html += '<br>\n';
                else if (/^[A-Z\u00C0-\u00DC][^a-z]{2,}$/.test(trimmed) && trimmed.length < 80) html += `<h1>${this._esc(trimmed)}</h1>\n`;
                else if (/^[A-Z][a-z]/.test(trimmed) && trimmed.length < 60 && !trimmed.endsWith('.')) html += `<h2>${this._esc(trimmed)}</h2>\n`;
                else if (trimmed.startsWith('- ') || trimmed.startsWith('— ')) html += `<li>${this._esc(trimmed.replace(/^[—\-]\s*/, ''))}</li>\n`;
                else html += `<p>${this._esc(trimmed)}</p>\n`;
            }
        }
        if (inTable) html += '</table>\n';
        if (!hideBranding) html += `<div class="footer">Généré par QuickText Voice Pro — ${reportDate}</div>`;
        html += '</body></html>';
        return html;
    },
    
    _formatDate() {
        const now = new Date();
        const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
        const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
        return jours[now.getDay()] + ' ' + now.getDate() + ' ' + mois[now.getMonth()] + ' ' + now.getFullYear() +
               ' à ' + String(now.getHours()).padStart(2, '0') + 'h' + String(now.getMinutes()).padStart(2, '0');
    },
    
    _esc(str) { if (!str) return ''; return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },
    
    _hexToRGB(hex) {
        if (!hex || hex === '') return null;
        hex = hex.replace('#', '').trim();
        if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        if (hex.length !== 6) return [0, 0, 0];
        const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [0, 0, 0];
    }
};