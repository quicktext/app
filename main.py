# -*- coding: utf-8 -*-
import base64
import io
import csv
import zipfile
import logging
import json
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont

# Tentative d'import pour la génération Excel
try:
    import xlsxwriter
except ImportError:
    xlsxwriter = None

# --- IMPORTATION DU SDK MESOMB ---
try:
    from pymesomb.operations import PaymentOperation
    from pymesomb.utils import RandomGenerator
    HAS_MESOMB = True
except ImportError:
    HAS_MESOMB = False

from odoo import http
from odoo.http import request, content_disposition, Response

_logger = logging.getLogger(__name__)

# ==========================================================
# CONFIGURATION MESOMB - REMPLACEZ PAR VOS CLÉS RÉELLES
# ==========================================================
MESOMB_CONFIG = {
    'app_key': 'e18d9eeaca13e7a980f4cf788de3d340d611ea3e',
    'access_key': '78c7de30-1966-4251-826c-1294d476de47',
    'secret_key': '4c255aea-0b18-4c3b-846d-4656147c90d8',
}

class PhotoCidController(http.Controller):

    @http.route('/photocid/app', type='http', auth='user', website=True)
    def open_app(self, **kwargs):
        return request.render('photocid_pro.photocid_page_template')

    # --- NOUVEAU : GÉNÉRATION DU MODÈLE EXCEL FORMATÉ ---
    @http.route('/photocid/api/download_excel_template', type='http', auth='user')
    def download_excel_template(self, **kwargs):
        if not xlsxwriter:
            return request.make_response("Erreur: Bibliothèque 'xlsxwriter' manquante sur le serveur.", [('Content-Type', 'text/plain')])
        
        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output)
        worksheet = workbook.add_worksheet('Modèle Import PhotoCid')

        # Styles
        header_style = workbook.add_format({
            'bold': True,
            'bg_color': '#71639e',
            'font_color': 'white',
            'border': 1,
            'align': 'center',
            'valign': 'vcenter'
        })
        
        # En-têtes
        headers = ['Nom', 'Matricule', 'Classe']
        for col, header in enumerate(headers):
            worksheet.write(0, col, header, header_style)
            worksheet.set_column(col, col, 25)

        # Ajout d'une ligne d'exemple
        worksheet.write(1, 0, "JEAN DUPONT")
        worksheet.write(1, 1, "MAT12345")
        worksheet.write(1, 2, "Tle A4 ESP")

        workbook.close()
        output.seek(0)
        
        return request.make_response(
            output.read(), 
            headers=[
                ('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
                ('Content-Disposition', content_disposition('modele_import_photocid.xlsx'))
            ]
        )

    # --- MODIFIÉ : IMPORT CSV (SUPPORT VIRGULE ET POINT-VIRGULE) ---
    @http.route('/photocid/api/process_csv', type='json', auth='user', methods=['POST'], csrf=False)
    def process_csv(self, csv_data, school_year, **kwargs):
        try:
            if ',' in csv_data:
                csv_data = csv_data.split(',')[1]
            
            decoded_csv = base64.b64decode(csv_data).decode('utf-8-sig')
            
            # Détection automatique du séparateur (, ou ;)
            if decoded_csv:
                try:
                    dialect = csv.Sniffer().sniff(decoded_csv[:2048], delimiters=',;')
                    delimiter = dialect.delimiter
                except:
                    # Fallback si le sniffer échoue
                    delimiter = ';' if ';' in decoded_csv.splitlines()[0] else ','
            else:
                return {'success': False, 'message': 'Fichier vide'}

            stream = io.StringIO(decoded_csv)
            reader = csv.DictReader(stream, delimiter=delimiter)
            
            count = 0
            for row in list(reader):
                # Nettoyage des noms de colonnes
                d = {k.strip().lower(): v.strip() for k, v in row.items() if k}
                name = d.get('nom') or d.get('name')
                mat = d.get('matricule') or d.get('id')
                
                if name and mat:
                    exist = request.env['photocid.student'].sudo().search([
                        ('matricule', '=', mat), 
                        ('user_id', '=', request.env.uid)
                    ], limit=1)
                    
                    vals = {
                        'name': name, 
                        'matricule': mat, 
                        'class_name': d.get('classe') or d.get('class'), 
                        'user_id': request.env.uid, 
                        'school_year': school_year,
                        'payment_status': exist.payment_status if exist else 'unpaid'
                    }
                    if exist:
                        exist.write(vals)
                    else:
                        request.env['photocid.student'].sudo().create(vals)
                    count += 1
            
            return {'success': True, 'message': f'{count} élèves importés avec succès.'}
        except Exception as e:
            _logger.error("Erreur Import CSV: %s", str(e))
            return {'success': False, 'message': f"Erreur de format: {str(e)}"}

    # --- LOGIQUE PAIEMENT API MESOMB (CONSERVÉE TELLE QUELLE) ---
    @http.route('/photocid/api/initiate_payment', type='json', auth='user', methods=['POST'], csrf=False)
    def initiate_payment(self, amount, phone, **kwargs):
        if not HAS_MESOMB:
            return {'success': False, 'message': "SDK MeSomb non installé sur le serveur."}
        try:
            p = phone.strip().replace(" ", "").replace("+237", "")
            if p.startswith('237') and len(p) > 9:
                p = p[3:]
            service = "MTN" if p.startswith(('67', '68', '650', '651', '652', '653', '654')) else "ORANGE"
            local_reference = f"USER_{request.env.uid}_{int(datetime.now().timestamp())}"
            client = PaymentOperation(MESOMB_CONFIG['app_key'], MESOMB_CONFIG['access_key'], MESOMB_CONFIG['secret_key'])
            response = client.make_collect(
                amount=float(amount),
                service=service,
                payer=p,
                nonce=RandomGenerator.nonce(),
                trx_id=local_reference
            )
            if response.is_operation_success():
                return {'success': True, 'message': 'Requête envoyée. Validez sur votre mobile.'}
            else:
                return {'success': False, 'message': response.message or "Échec de l'opération."}
        except Exception as e:
            _logger.error("Erreur MeSomb: %s", str(e))
            return {'success': False, 'message': f"Erreur technique: {str(e)}"}

    @http.route('/photocid/api/mesomb_webhook', type='http', auth='public', methods=['POST'], csrf=False)
    def mesomb_webhook(self, **kwargs):
        _logger.info("===== WEBHOOK MESOMB REÇU =====")
        try:
            data = json.loads(request.httprequest.data)
            status = data.get('status')
            reference = data.get('reference', '') 
            if status == 'SUCCESS' and reference.startswith('USER_'):
                user_id = int(reference.split('_')[1])
                students = request.env['photocid.student'].sudo().search([
                    ('user_id', '=', user_id),
                    ('status', '=', 'printed'),
                    ('payment_status', '=', 'unpaid')
                ])
                students.write({'payment_status': 'paid'})
                _logger.info("Webhook : Paiement validé pour UID %s", user_id)
            return Response("OK", status=200)
        except Exception as e:
            _logger.error("Erreur Webhook : %s", str(e))
            return Response("Error", status=500)

    # --- TRAITEMENT PHOTO CID (PIL) ---
    @http.route('/photocid/api/save_photo', type='json', auth='user', methods=['POST'], csrf=False)
    def save_photo(self, student_id, photo_data, examen, statut, code, **kwargs):
        try:
            student = request.env['photocid.student'].sudo().search([('id','=',int(student_id)),('user_id','=',request.env.uid)], limit=1)
            if not student: return {'success': False, 'message': 'Élève non trouvé'}
            if ',' in photo_data: photo_data = photo_data.split(',')[1]
            image_bytes = base64.b64decode(photo_data)
            img_raw = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            W, H, BAND = 413, 431, 50
            img_res = img_raw.resize((W, H), Image.Resampling.LANCZOS)
            canvas = Image.new("RGB", (W, H + (2 * BAND)), (255, 255, 255))
            canvas.paste(img_res, (0, BAND))
            draw = ImageDraw.Draw(canvas)
            try: f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 20)
            except: f = ImageFont.load_default()
            date_txt = datetime.now().strftime("%d/%m/%Y")
            draw.text(((W - draw.textbbox((0,0), date_txt, font=f)[2])/2, 10), date_txt, fill=(0,0,0), font=f)
            name_txt = (student.name or '').upper()[:30]
            draw.text(((W - draw.textbbox((0,0), name_txt, font=f)[2])/2, H + BAND + 5), name_txt, fill=(0,0,0), font=f)
            info_txt = f"{examen}  {statut}  {code}".upper()
            draw.text(((W - draw.textbbox((0,0), info_txt, font=f)[2])/2, H + BAND + 28), info_txt, fill=(0,0,0), font=f)
            out = io.BytesIO()
            canvas.save(out, format="JPEG", quality=95)
            student.write({'photo': base64.b64encode(out.getvalue()), 'status': 'printed'})
            return {'success': True}
        except Exception as e: return {'success': False, 'message': str(e)}

    # --- ZIP & FILIGRANE DYNAMIQUE ---
    def _apply_watermark(self, b64_data):
        try:
            img = Image.open(io.BytesIO(base64.b64decode(b64_data))).convert("RGBA")
            txt = Image.new('RGBA', img.size, (255, 255, 255, 0))
            try: fnt = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 45)
            except: fnt = ImageFont.load_default()
            d = ImageDraw.Draw(txt)
            bbox = d.textbbox((0,0), "Photocid Pro", font=fnt)
            d.text(((img.size[0]-(bbox[2]-bbox[0]))/2, (img.size[1]-(bbox[3]-bbox[1]))/2), "Photocid Pro", font=fnt, fill=(255, 255, 255, 80))
            out = io.BytesIO()
            Image.alpha_composite(img, txt).convert("RGB").save(out, format="JPEG", quality=85)
            return out.getvalue()
        except: return base64.b64decode(b64_data)

    @http.route('/photocid/api/download_zip', type='http', auth='user')
    def download_zip(self, class_name=None, **kwargs):
        domain = [('photo', '!=', False), ('user_id', '=', request.env.uid)]
        if class_name and class_name != "all": domain.append(('class_name', '=', class_name))
        students = request.env['photocid.student'].sudo().search(domain)
        mem = io.BytesIO()
        with zipfile.ZipFile(mem, 'w', zipfile.ZIP_DEFLATED) as zf:
            for s in students:
                img = base64.b64decode(s.photo) if s.payment_status == 'paid' else self._apply_watermark(s.photo)
                zf.writestr(f"{s.matricule}.jpg", img)
        mem.seek(0)
        return request.make_response(mem.read(), [('Content-Type', 'application/zip'), ('Content-Disposition', content_disposition(f'Photos_Cid_{datetime.now().strftime("%Y%m%d")}.zip'))])

    # --- CONFIG & LISTS ---
    @http.route('/photocid/api/get_config', type='json', auth='user', methods=['POST'], csrf=False)
    def get_config(self, **kwargs):
        conf = request.env['photocid.school'].sudo().search([('user_id', '=', request.env.uid)], limit=1)
        if not conf: conf = request.env['photocid.school'].sudo().create({'user_id': request.env.uid})
        return {'name': conf.name, 'year': conf.school_year, 'examen': conf.examen, 'statut': conf.statut, 'code': conf.code}

    @http.route('/photocid/api/save_config', type='json', auth='user', methods=['POST'], csrf=False)
    def save_config(self, config, **kwargs):
        conf = request.env['photocid.school'].sudo().search([('user_id', '=', request.env.uid)], limit=1)
        if conf: conf.write({'name': config.get('name'), 'school_year': config.get('year'), 'examen': config.get('examen'), 'statut': config.get('statut'), 'code': config.get('code')})
        return True

    @http.route('/photocid/api/students', type='json', auth='user', methods=['POST'], csrf=False)
    def get_students(self, **kwargs):
        try:
            students = request.env['photocid.student'].sudo().search_read([('user_id','=',request.env.uid)], ['id','name','matricule','class_name','photo','payment_status'])
            for s in students:
                s['has_photo'] = bool(s['photo'])
                if 'photo' in s: del s['photo']
            return {'success': True, 'data': students}
        except Exception: return {'success': False, 'data': []}

    @http.route('/photocid/api/get_payment_stats', type='json', auth='user', methods=['POST'], csrf=False)
    def get_payment_stats(self, **kwargs):
        students = request.env['photocid.student'].sudo().search([('user_id', '=', request.env.uid), ('status', '=', 'printed'), ('payment_status', '=', 'unpaid')])
        return {'count': len(students), 'total': len(students) * 200}

    @http.route('/photocid/api/confirm_payment', type='json', auth='user', methods=['POST'], csrf=False)
    def confirm_payment(self, **kwargs): return {}
