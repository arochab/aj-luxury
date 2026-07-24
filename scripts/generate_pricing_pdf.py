from pathlib import Path
from shutil import copy2

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "outputs" / "aj-luxury-pricing"
DELIVERABLE_DIR = ROOT / "deliverables" / "2026-07-23-call-18h"
PDF_PATH = OUT_DIR / "AJ-Luxury-Grille-Tarifaire-Base-de-travail.pdf"
DELIVERABLE_PATH = DELIVERABLE_DIR / PDF_PATH.name

W, H = landscape(A4)
INK = HexColor("#0B0B0D")
PAPER = HexColor("#F4F4F1")
WHITE = HexColor("#FFFFFF")
MIST = HexColor("#E5E5E1")
LINE = HexColor("#CACAC6")
MUTED = HexColor("#626267")
POURPRE = HexColor("#7D0F52")
ROSE = HexColor("#DDA9BD")
LILAS = HexColor("#A9ABD9")
INPUT = HexColor("#FFF1B8")
REGULAR = "AJ-Regular"
BOLD = "AJ-Bold"


def register_fonts():
    pdfmetrics.registerFont(TTFont(REGULAR, r"C:\Windows\Fonts\arial.ttf"))
    pdfmetrics.registerFont(TTFont(BOLD, r"C:\Windows\Fonts\arialbd.ttf"))


def background(c):
    c.setFillColor(PAPER)
    c.rect(0, 0, W, H, fill=True, stroke=False)


def footer(c, page):
    c.setStrokeColor(LINE)
    c.line(34, 24, W - 34, 24)
    c.setFillColor(MUTED)
    c.setFont(BOLD, 6.4)
    c.drawString(34, 12, "AJ LUXURY  |  BASE TARIFAIRE NON CONTRACTUELLE")
    c.drawRightString(W - 34, 12, f"23.07.2026  |  {page:02d}")


def wrap(text, max_chars):
    words = text.split()
    lines, current = [], ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) <= max_chars:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def paragraph(c, text, x, y, width, size=8, leading=10, color=MUTED, max_lines=2):
    max_chars = max(12, int(width / (size * 0.53)))
    c.setFillColor(color)
    c.setFont(REGULAR, size)
    for line in wrap(text, max_chars)[:max_lines]:
        c.drawString(x, y, line)
        y -= leading


def heading(c, eyebrow, title):
    c.setFillColor(MUTED)
    c.setFont(BOLD, 7.2)
    c.drawString(42, H - 46, eyebrow.upper())
    c.setFillColor(INK)
    c.setFont(REGULAR, 31)
    c.drawString(42, H - 88, title)


def table(c, headers, rows, x, y_top, widths, row_height=38):
    total = sum(widths)
    c.setFillColor(INK)
    c.rect(x, y_top - 30, total, 30, fill=True, stroke=False)
    xx = x
    c.setFillColor(WHITE)
    c.setFont(BOLD, 7)
    for header, width in zip(headers, widths):
        c.drawString(xx + 9, y_top - 19, header.upper())
        xx += width
    y = y_top - 30 - row_height
    for index, row in enumerate(rows):
        c.setFillColor(WHITE if index % 2 == 0 else MIST)
        c.rect(x, y, total, row_height, fill=True, stroke=False)
        xx = x
        for value, width in zip(row, widths):
            paragraph(c, str(value), xx + 9, y + row_height - 16, width - 16, 7.3, 9.2, INK, 2)
            xx += width
        y -= row_height
    return y


def page_services(c):
    background(c)
    heading(c, "Prestation", "Un socle V1 lisible et chiffré par lots.")
    c.setFillColor(MUTED)
    c.setFont(REGULAR, 8.5)
    c.drawString(42, H - 112, "Hypothèse : 450 € HT par jour. Base à confirmer après validation du périmètre.")
    rows = [
        ("01", "Cadrage", "0,75 j", "337,50 €"),
        ("02", "UX/UI final", "1,50 j", "675,00 €"),
        ("03", "Front responsive et motion", "2,50 j", "1 125,00 €"),
        ("04", "Catalogue Apollon", "1,00 j", "450,00 €"),
        ("05", "Panier, paiement et commande", "1,50 j", "675,00 €"),
        ("06", "Stocks et gestion commerce", "1,50 j", "675,00 €"),
        ("07", "QA, documentation et lancement", "1,00 j", "450,00 €"),
    ]
    table(c, ["Lot", "Prestation", "Charge", "Montant HT"], rows, 42, 432, [60, 470, 95, 130], 38)
    c.setFillColor(INK)
    c.roundRect(42, 64, W - 84, 54, 4, fill=True, stroke=False)
    c.setFillColor(WHITE)
    c.setFont(BOLD, 9)
    c.drawString(58, 94, "TOTAL SOCLE V1")
    c.setFont(BOLD, 15)
    c.drawRightString(W - 58, 91, "4 387,50 € HT")
    footer(c, 1)


def page_options(c):
    background(c)
    heading(c, "Options", "Ce qui reste séparé et soumis à validation.")
    rows = [
        ("Compte client et historique", "450 à 675 €", "À arbitrer"),
        ("Retouche des fonds photo", "225 à 900 €", "Après échantillon HD"),
        ("Boucle vidéo originale", "450 à 900 €", "Selon fichiers sources"),
        ("Version multilingue", "450 à 900 €", "Plus tard"),
        ("Focus macro sur la ceinture", "225 à 450 €", "Nécessite un visuel HD dédié"),
        ("Maintenance mensuelle, 3 h", "180 €/mois", "Optionnelle"),
    ]
    table(c, ["Option", "Fourchette HT", "Condition"], rows, 42, 425, [360, 155, 240], 47)
    c.setFillColor(INPUT)
    c.roundRect(42, 70, W - 84, 52, 4, fill=True, stroke=False)
    c.setFillColor(INK)
    c.setFont(BOLD, 8)
    c.drawString(58, 98, "RÈGLE")
    c.setFont(REGULAR, 8)
    c.drawString(112, 98, "Aucune option n'est incluse ni engagée sans validation écrite et chiffrage confirmé.")
    footer(c, 2)


def page_suppliers(c):
    background(c)
    heading(c, "Coûts externes", "Des services ouverts et payés par AJ Luxury.")
    rows = [
        ("Domaine .fr", "OVHcloud", "5,99 € TTC la 1re année", "9,35 € TTC/an au renouvellement"),
        ("Email Starter", "OVHcloud", "Inclus avec le .fr consulté", "À confirmer lors de la commande"),
        ("Hébergement front", "Cloudflare Pages Free", "0 € au démarrage", "500 builds/mois, statique illimité"),
        ("Analytics", "Cloudflare Web Analytics", "0 €", "Approche sans cookies"),
        ("Paiement", "Stripe standard", "0 € fixe", "1,5 % + 0,25 € / carte EEE"),
        ("Alternative", "Shopify Basic", "29 $US/mois annuel", "39 $US/mois mensuel"),
    ]
    table(c, ["Besoin", "Solution", "Coût", "Lecture"], rows, 42, 425, [185, 190, 180, 200], 43)
    c.setFillColor(INK)
    c.setFont(BOLD, 7.4)
    c.drawString(42, 112, "SOURCES OFFICIELLES CONSULTÉES LE 23.07.2026")
    sources = (
        "ovhcloud.com/fr/domains/tld/fr/  |  pages.cloudflare.com/  |  "
        "cloudflare.com/web-analytics/  |  stripe.com/fr/pricing  |  shopify.com/fr/tarifs"
    )
    paragraph(c, sources, 42, 94, W - 84, 7, 9, MUTED, 2)
    c.setFillColor(INPUT)
    c.roundRect(42, 48, W - 84, 30, 3, fill=True, stroke=False)
    c.setFillColor(INK)
    c.setFont(BOLD, 7.3)
    c.drawString(56, 60, "Tarifs susceptibles d'évoluer. Vérification à refaire le jour de la souscription.")
    footer(c, 3)


def build():
    register_fonts()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    DELIVERABLE_DIR.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(PDF_PATH), pagesize=(W, H))
    c.setTitle("AJ Luxury - Grille tarifaire, base de travail")
    c.setAuthor("Adam Chabbi")
    for index, page in enumerate((page_services, page_options, page_suppliers)):
        page(c)
        if index < 2:
            c.showPage()
    c.save()
    copy2(PDF_PATH, DELIVERABLE_PATH)
    print(PDF_PATH)
    print(DELIVERABLE_PATH)


if __name__ == "__main__":
    build()
