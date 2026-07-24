from pathlib import Path
from shutil import copy2

from PIL import Image
from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "output" / "pdf"
DELIVERABLE_DIR = ROOT / "deliverables" / "2026-07-23-call-18h"
TMP_DIR = ROOT / "tmp" / "pdfs"
PDF_PATH = OUT_DIR / "AJ-Luxury-Call-18h.pdf"
DELIVERABLE_PATH = DELIVERABLE_DIR / PDF_PATH.name
LOGO = ROOT / "public" / "images" / "aj-luxury-logo.png"
HERO = ROOT / "inputs_assets" / "client-photos-2026-07-23" / "IMG_5378.jpg"
DETAIL = ROOT / "inputs_assets" / "client-photos-2026-07-23" / "IMG_5621.JPG"

W, H = landscape(A4)
INK = HexColor("#111112")
PAPER = HexColor("#F5F5F2")
MIST = HexColor("#E7E7E5")
SILVER = HexColor("#B8BBC0")
MUTED = HexColor("#66666A")
POURPRE = HexColor("#7D0F52")
ROSE = HexColor("#DDA9BD")
LILAS = HexColor("#A9ABD9")


def crop_image(source: Path, name: str, ratio: float, anchor: float = 0.5) -> Path:
    target = TMP_DIR / name
    with Image.open(source) as image:
        image = image.convert("RGB")
        width, height = image.size
        current = width / height
        if current > ratio:
            new_width = int(height * ratio)
            left = int((width - new_width) * anchor)
            image = image.crop((left, 0, left + new_width, height))
        else:
            new_height = int(width / ratio)
            top = int((height - new_height) * anchor)
            image = image.crop((0, top, width, top + new_height))
        image.save(target, "JPEG", quality=90, optimize=True)
    return target


def draw_cover_image(c, path: Path, x, y, width, height):
    crop = crop_image(path, f"crop-{path.stem}-{int(width)}x{int(height)}.jpg", width / height, 0.46)
    c.drawImage(str(crop), x, y, width, height, preserveAspectRatio=True, mask="auto")


def footer(c, page):
    c.setStrokeColor(Color(0, 0, 0, alpha=0.13))
    c.line(34, 23, W - 34, 23)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 6.8)
    c.drawString(34, 12, "AJ LUXURY  ·  SUPPORT DE TRAVAIL")
    c.drawRightString(W - 34, 12, f"23.07.2026  ·  {page:02d}")


def eyebrow(c, text, x, y, color=MUTED):
    c.setFillColor(color)
    c.setFont("Helvetica-Bold", 7.4)
    c.drawString(x, y, text.upper())


def title(c, text, x, y, size=38, color=INK):
    c.setFillColor(color)
    c.setFont("Helvetica", size)
    c.drawString(x, y, text)


def wrapped(c, text, x, y, width, size=10, leading=14, color=MUTED, font="Helvetica"):
    c.setFillColor(color)
    c.setFont(font, size)
    words = text.split()
    lines = []
    line = ""
    for word in words:
        candidate = f"{line} {word}".strip()
        if stringWidth(candidate, font, size) <= width:
            line = candidate
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    for item in lines:
        c.drawString(x, y, item)
        y -= leading
    return y


def bullet(c, number, heading, body, x, y, width):
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 7.2)
    c.drawString(x, y + 2, f"{number:02d}")
    c.setFont("Helvetica-Bold", 11)
    c.drawString(x + 32, y, heading)
    return wrapped(c, body, x + 32, y - 17, width - 32, 8.5, 12, MUTED)


def page_cover(c):
    c.setFillColor(INK)
    c.rect(0, 0, W, H, fill=True, stroke=False)
    draw_cover_image(c, HERO, W * 0.53, 0, W * 0.47, H)
    c.setFillColor(Color(0.05, 0.04, 0.06, alpha=0.18))
    c.rect(W * 0.53, 0, W * 0.47, H, fill=True, stroke=False)
    c.setFillColor(Color(1, 1, 1, alpha=0.06))
    c.rect(0, 0, W * 0.53, H, fill=True, stroke=False)
    c.drawImage(str(LOGO), 42, H - 150, 155, 112, preserveAspectRatio=True, mask="auto")
    c.setFillColor(white)
    c.setFont("Helvetica", 38)
    c.drawString(44, 180, "Collection Apollon")
    c.setFont("Helvetica", 38)
    c.drawString(44, 136, "Première direction")
    c.setFillColor(SILVER)
    c.setFont("Helvetica-Bold", 7.6)
    c.drawString(46, 92, "MAQUETTE E-COMMERCE  ·  SUPPORT DU PREMIER ÉCHANGE")
    c.setFillColor(Color(1, 1, 1, alpha=0.62))
    c.setFont("Helvetica", 8)
    c.drawString(46, 63, "Animation originale · Photos client · Parcours responsive")
    c.drawString(46, 47, "23 juillet 2026")


def page_base(c):
    c.setFillColor(PAPER)
    c.rect(0, 0, W, H, fill=True, stroke=False)
    eyebrow(c, "La base de travail", 42, H - 48)
    title(c, "Le projet est désormais concret.", 42, H - 92, 34)
    wrapped(
        c,
        "La maquette ne repose plus sur une gamme fictive. Elle traduit le produit réel, ses trois coloris, les contenus reçus et l’univers communiqué par AJ Luxury.",
        43,
        H - 122,
        470,
        9.5,
        14,
    )
    y = H - 175
    y = bullet(c, 1, "Vraies photos", "60 fichiers haute définition triés par usage : hero, campagne, coloris et détails matière.", 43, y, 330) - 24
    y = bullet(c, 2, "Vrai catalogue", "Un modèle Apollon, trois coloris commerciaux et douze variantes taille/couleur.", 43, y, 330) - 24
    y = bullet(c, 3, "Vraie promesse", "94% modal, 6% élasthanne, toucher soyeux, respirabilité et ceinture signature de 3,5 cm.", 43, y, 330) - 24
    bullet(c, 4, "Parcours cohérent", "Accueil éditorial, fiches produit, panier, checkout et espace client de démonstration.", 43, y, 330)
    c.setFillColor(INK)
    c.roundRect(W - 300, 50, 252, H - 100, 4, fill=True, stroke=False)
    c.drawImage(str(LOGO), W - 252, H - 170, 155, 112, preserveAspectRatio=True, mask="auto")
    c.setFillColor(white)
    c.setFont("Helvetica", 26)
    c.drawString(W - 274, 142, "Reveal Your")
    c.drawString(W - 274, 112, "Inner Beauty.")
    c.setFillColor(SILVER)
    c.setFont("Helvetica", 8)
    c.drawString(W - 274, 82, "BLANC · NOIR · ARGENTÉ · MANROPE")
    footer(c, 2)


def page_catalog(c):
    c.setFillColor(PAPER)
    c.rect(0, 0, W, H, fill=True, stroke=False)
    eyebrow(c, "Collection inaugurale", 42, H - 48)
    title(c, "Apollon, en trois coloris.", 42, H - 90, 34)
    cards = [
        ("Pourpre Impérial", POURPRE, "S 26  ·  M 103  ·  L 87  ·  XL 36", "252 unités"),
        ("Rose Velours", ROSE, "S 26  ·  M 103  ·  L 87  ·  XL 36", "252 unités"),
        ("Lilas Céleste", LILAS, "S 26  ·  M 102  ·  L 88  ·  XL 36", "252 unités"),
    ]
    card_w = (W - 106) / 3
    for index, (name, color, sizes, total) in enumerate(cards):
        x = 42 + index * (card_w + 11)
        c.setFillColor(white)
        c.roundRect(x, 188, card_w, 238, 4, fill=True, stroke=False)
        c.setFillColor(color)
        c.rect(x, 350, card_w, 76, fill=True, stroke=False)
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 14)
        c.drawString(x + 18, 317, name)
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 8)
        c.drawString(x + 18, 290, "APOLLON · BOXER CLASSIQUE")
        c.drawString(x + 18, 261, sizes)
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 19)
        c.drawString(x + 18, 220, total)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(42, 140, "756 unités au total")
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8.5)
    c.drawString(42, 116, "Prix de vente : à confirmer  ·  Tailles : S, M, L, XL  ·  12 variantes")
    c.drawString(42, 94, "Répartition en trois lots et quantité influenceurs : à arbitrer avant paramétrage du stock vendable.")
    footer(c, 3)


def page_experience(c):
    c.setFillColor(INK)
    c.rect(0, 0, W, H, fill=True, stroke=False)
    draw_cover_image(c, DETAIL, 0, 0, W * 0.42, H)
    c.setFillColor(Color(0.05, 0.05, 0.06, alpha=0.22))
    c.rect(0, 0, W * 0.42, H, fill=True, stroke=False)
    x = W * 0.48
    eyebrow(c, "Expérience proposée", x, H - 48, SILVER)
    title(c, "Du mouvement,", x, H - 92, 32, white)
    title(c, "puis le produit.", x, H - 128, 32, white)
    points = [
        ("Intro originale", "Animation métallique calculée en temps réel, sans source iStock ni watermark."),
        ("Hero porté", "Un vrai mannequin et la collection réelle dès l’arrivée sur le site."),
        ("Scroll éditorial", "Mosaïque campagne, coloris, détails matière et histoire de marque."),
        ("Commerce lisible", "Trois fiches Apollon reliées, tailles S à XL et prix signalé comme non validé."),
    ]
    y = H - 194
    for i, (heading, body) in enumerate(points, 1):
        c.setFillColor(SILVER)
        c.setFont("Helvetica-Bold", 7)
        c.drawString(x, y + 2, f"{i:02d}")
        c.setFillColor(white)
        c.setFont("Helvetica-Bold", 10.5)
        c.drawString(x + 30, y, heading)
        wrapped(c, body, x + 30, y - 15, 300, 8, 11, Color(1, 1, 1, alpha=0.62))
        y -= 62
    c.setFillColor(Color(1, 1, 1, alpha=0.16))
    c.line(x, 56, W - 42, 56)
    c.setFillColor(Color(1, 1, 1, alpha=0.6))
    c.setFont("Helvetica", 7.5)
    c.drawString(x, 38, "INSPIRATION DE RYTHME : ABEL P  ·  IDENTITÉ ET CONTENUS : AJ LUXURY")


def page_infrastructure(c):
    c.setFillColor(PAPER)
    c.rect(0, 0, W, H, fill=True, stroke=False)
    eyebrow(c, "Lancement digital", 42, H - 48)
    title(c, "Démarrer léger, rester propriétaire.", 42, H - 90, 32)
    wrapped(
        c,
        "AJ Luxury ne dispose encore d’aucun domaine ni compte technique. La priorité est de créer un socle économique, propre et transférable, sans multiplier les abonnements.",
        43,
        H - 120,
        620,
        9,
        13,
    )
    rows = [
        ("Domaine .fr", "OVHcloud", "5,99 € TTC la 1re année", "9,35 € TTC/an au renouvellement"),
        ("E-mail", "Starter OVHcloud", "Inclus avec le .fr consulté", "Adresse professionnelle de départ"),
        ("Hébergement", "Cloudflare Pages", "0 $", "Domaine personnalisé et SSL"),
        ("Paiement", "Stripe Checkout", "0 € d’abonnement", "1,5% + 0,25 € / carte EEE"),
    ]
    x_positions = [42, 225, 370, 555]
    widths = [180, 140, 180, 235]
    labels = ["Besoin", "Solution", "Coût fixe", "Point d’attention"]
    c.setFillColor(INK)
    c.rect(42, 348, W - 84, 34, fill=True, stroke=False)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 7.5)
    for x, label in zip(x_positions, labels):
        c.drawString(x + 10, 361, label.upper())
    y = 304
    for index, row in enumerate(rows):
        c.setFillColor(white if index % 2 == 0 else MIST)
        c.rect(42, y, W - 84, 44, fill=True, stroke=False)
        for x, width, value in zip(x_positions, widths, row):
            wrapped(c, value, x + 10, y + 26, width - 14, 8, 10, INK if x == 42 else MUTED)
        y -= 44
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(42, 94, "Tous les comptes au nom d’AJ Luxury.")
    wrapped(
        c,
        "Domaine, DNS, paiement, analytics et données appartiennent au client. Le prestataire intervient comme administrateur ou collaborateur.",
        42,
        73,
        550,
        8,
        11,
        MUTED,
    )
    c.setFillColor(POURPRE)
    c.roundRect(W - 238, 55, 196, 62, 3, fill=True, stroke=False)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(W - 220, 91, "ARBITRAGE À FAIRE")
    c.setFont("Helvetica", 7.4)
    c.drawString(W - 220, 73, "Coût récurrent minimal ou back-office")
    c.drawString(W - 220, 61, "commerce prêt à l’emploi.")
    footer(c, 5)


def page_call(c):
    c.setFillColor(PAPER)
    c.rect(0, 0, W, H, fill=True, stroke=False)
    eyebrow(c, "Objectif de l’échange", 42, H - 48)
    title(c, "Valider la direction.\nDélimiter la première version.", 42, H - 90, 32)
    left = [
        ("01", "Direction visuelle", "Valider le niveau de sobriété, l’animation d’entrée et le rôle de chaque coloris."),
        ("02", "Première version", "Confirmer les pages et fonctions indispensables pour lancer sans construire une usine à gaz."),
        ("03", "Prix et contenus", "Fixer le prix, les consignes d’entretien et le barème de tailles à publier."),
    ]
    right = [
        ("04", "Stock vendable", "Définir les trois lots, la réserve de sécurité et la quantité réellement dédiée aux influenceurs."),
        ("05", "Production visuelle", "Distinguer l’intégration au site de la retouche des fonds et de la production vidéo, chiffrées séparément."),
        ("06", "Suite du projet", "Après validation : périmètre, planning par étapes, livrables, responsabilités et validations attendues."),
    ]
    for col, items in enumerate((left, right)):
        x = 44 + col * 390
        y = H - 185
        for number, heading, body in items:
            c.setFillColor(INK)
            c.setFont("Helvetica-Bold", 7)
            c.drawString(x, y, number)
            c.setFont("Helvetica-Bold", 12)
            c.drawString(x + 30, y, heading)
            wrapped(c, body, x + 30, y - 17, 305, 8.5, 12, MUTED)
            y -= 92
    c.setFillColor(INK)
    c.roundRect(42, 46, W - 84, 52, 3, fill=True, stroke=False)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(58, 74, "SORTIE ATTENDUE")
    c.setFont("Helvetica", 8.5)
    c.drawString(172, 74, "Une direction validée, des décisions nommées et un prochain lot de travail clair.")
    footer(c, 6)


def build():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    DELIVERABLE_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(PDF_PATH), pagesize=(W, H))
    c.setTitle("AJ Luxury - Support du call")
    pages = (
        page_cover,
        page_base,
        page_catalog,
        page_experience,
        page_infrastructure,
        page_call,
    )
    for index, page in enumerate(pages):
        page(c)
        if index < len(pages) - 1:
            c.showPage()
    c.save()
    copy2(PDF_PATH, DELIVERABLE_PATH)
    print(PDF_PATH)
    print(DELIVERABLE_PATH)


if __name__ == "__main__":
    build()
