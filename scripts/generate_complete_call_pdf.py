from pathlib import Path
from shutil import copy2

from PIL import Image
from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "output" / "pdf"
DELIVERABLE_DIR = ROOT / "deliverables" / "2026-07-23-call-18h"
TMP_DIR = ROOT / "tmp" / "pdfs" / "complete"
PDF_PATH = OUT_DIR / "AJ-Luxury-Dossier-Complet-23-07-2026.pdf"
DELIVERABLE_PATH = DELIVERABLE_DIR / PDF_PATH.name

LOGO = ROOT / "public" / "images" / "aj-luxury-logo.png"
MOCKUP = DELIVERABLE_DIR / "AJ-Luxury-Maquette.png"
HERO = ROOT / "public" / "images" / "client" / "hero-pourpre-model.webp"
DUO = ROOT / "public" / "images" / "client" / "campaign-duo-lilas-seated.webp"
DETAIL = ROOT / "public" / "images" / "client" / "product-pourpre-detail.webp"
ROSE = ROOT / "public" / "images" / "client" / "product-card-rose.webp"

W, H = landscape(A4)
INK = HexColor("#0B0B0D")
PAPER = HexColor("#F3F3F0")
WHITE = HexColor("#FFFFFF")
MIST = HexColor("#E4E4E1")
SILVER = HexColor("#B8BBC0")
MUTED = HexColor("#626267")
LINE = HexColor("#CDCDCA")
POURPRE = HexColor("#7D0F52")
ROSE_COLOR = HexColor("#DDA9BD")
LILAS = HexColor("#A9ABD9")
SUCCESS = HexColor("#DCE7DF")
PLANNED = HexColor("#E8E4EF")

REGULAR = "AJ-Regular"
BOLD = "AJ-Bold"


def register_fonts():
    regular = Path(r"C:\Windows\Fonts\arial.ttf")
    bold = Path(r"C:\Windows\Fonts\arialbd.ttf")
    pdfmetrics.registerFont(TTFont(REGULAR, str(regular)))
    pdfmetrics.registerFont(TTFont(BOLD, str(bold)))


def crop_image(source: Path, name: str, ratio: float, anchor_x: float = 0.5, anchor_y: float = 0.5) -> Path:
    target = TMP_DIR / name
    with Image.open(source) as image:
        image = image.convert("RGB")
        width, height = image.size
        current = width / height
        if current > ratio:
            new_width = int(height * ratio)
            left = int((width - new_width) * anchor_x)
            image = image.crop((left, 0, left + new_width, height))
        else:
            new_height = int(width / ratio)
            top = int((height - new_height) * anchor_y)
            image = image.crop((0, top, width, top + new_height))
        image.save(target, "JPEG", quality=91, optimize=True)
    return target


def cover_image(c, path: Path, x, y, width, height, anchor_x=0.5, anchor_y=0.5):
    crop = crop_image(path, f"{path.stem}-{int(width)}x{int(height)}-{anchor_x}-{anchor_y}.jpg", width / height, anchor_x, anchor_y)
    c.drawImage(str(crop), x, y, width, height, preserveAspectRatio=True, mask="auto")


def background(c, color=PAPER):
    c.setFillColor(color)
    c.rect(0, 0, W, H, fill=True, stroke=False)


def page_footer(c, page, dark=False):
    line = Color(1, 1, 1, alpha=0.2) if dark else Color(0, 0, 0, alpha=0.16)
    text = Color(1, 1, 1, alpha=0.58) if dark else MUTED
    c.setStrokeColor(line)
    c.line(34, 24, W - 34, 24)
    c.setFillColor(text)
    c.setFont(BOLD, 6.4)
    c.drawString(34, 12, "AJ LUXURY  |  DOSSIER DE TRAVAIL")
    c.drawRightString(W - 34, 12, f"23.07.2026  |  {page:02d}")


def eyebrow(c, text, x, y, color=MUTED):
    c.setFillColor(color)
    c.setFont(BOLD, 7.2)
    c.drawString(x, y, text.upper())


def title(c, text, x, y, size=34, color=INK):
    c.setFillColor(color)
    c.setFont(REGULAR, size)
    c.drawString(x, y, text)


def wrap_lines(text, max_chars):
    words = text.split()
    lines, current = [], ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) <= max_chars:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def paragraph(c, text, x, y, width, size=9, leading=13, color=MUTED, font=REGULAR, max_lines=None):
    max_chars = max(12, int(width / (size * 0.54)))
    lines = wrap_lines(text, max_chars)
    if max_lines:
        lines = lines[:max_lines]
    c.setFillColor(color)
    c.setFont(font, size)
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def rounded_box(c, x, y, width, height, fill=WHITE, stroke=None, radius=5):
    c.setFillColor(fill)
    c.setStrokeColor(stroke or fill)
    c.roundRect(x, y, width, height, radius, fill=True, stroke=stroke is not None)


def numbered_item(c, number, heading, body, x, y, width, accent=INK):
    c.setFillColor(accent)
    c.setFont(BOLD, 7)
    c.drawString(x, y + 2, f"{number:02d}")
    c.setFillColor(INK)
    c.setFont(BOLD, 11)
    c.drawString(x + 30, y, heading)
    return paragraph(c, body, x + 30, y - 16, width - 30, 8.2, 11.5, MUTED)


def node(c, x, y, width, height, heading, body="", fill=WHITE, accent=INK):
    rounded_box(c, x, y, width, height, fill, LINE, 5)
    c.setFillColor(accent)
    c.rect(x, y, 5, height, fill=True, stroke=False)
    c.setFillColor(INK)
    c.setFont(BOLD, 9)
    c.drawString(x + 16, y + height - 20, heading)
    if body:
        paragraph(c, body, x + 16, y + height - 37, width - 27, 7.2, 9.5, MUTED)


def connector(c, x1, y1, x2, y2, color=LINE, width=1):
    c.setStrokeColor(color)
    c.setLineWidth(width)
    mid = (x1 + x2) / 2
    p = c.beginPath()
    p.moveTo(x1, y1)
    p.lineTo(mid, y1)
    p.lineTo(mid, y2)
    p.lineTo(x2, y2)
    c.drawPath(p, stroke=True, fill=False)


def page_cover(c):
    background(c, INK)
    cover_image(c, MOCKUP, W * 0.39, 0, W * 0.61, H, 0.52, 0.5)
    c.setFillColor(Color(0.02, 0.02, 0.025, alpha=0.22))
    c.rect(W * 0.39, 0, W * 0.61, H, fill=True, stroke=False)
    c.setFillColor(INK)
    c.rect(0, 0, W * 0.43, H, fill=True, stroke=False)
    c.drawImage(str(LOGO), 42, H - 145, 144, 104, preserveAspectRatio=True, mask="auto")
    c.setFillColor(WHITE)
    c.setFont(REGULAR, 36)
    c.drawString(44, 207, "Dossier projet")
    c.drawString(44, 164, "AJ Luxury")
    c.setFillColor(SILVER)
    c.setFont(BOLD, 7.4)
    c.drawString(46, 118, "VISION  |  PARCOURS  |  ARCHITECTURE  |  LANCEMENT")
    c.setFillColor(Color(1, 1, 1, alpha=0.64))
    c.setFont(REGULAR, 8)
    c.drawString(46, 82, "Support du premier échange projet")
    c.drawString(46, 64, "Maquette interactive et plan de mise en production")
    c.drawString(46, 46, "23 juillet 2026")


def page_understanding(c):
    background(c)
    eyebrow(c, "Ce que nous avons compris", 42, H - 46)
    title(c, "Un lancement resserré, mais exigeant.", 42, H - 88, 34)
    paragraph(
        c,
        "AJ Luxury lance un premier boxer masculin premium, Apollon, décliné en trois coloris. Le site doit installer une marque forte, rassurer sur le produit et préparer un parcours d'achat simple sans créer une usine à gaz.",
        43, H - 120, 630, 9.2, 13,
    )
    items = [
        ("Produit", "Apollon, coupe boxer classique, ceinture premium de 3,5 cm et logo métallique."),
        ("Matière", "94% modal et 6% élasthanne : douceur, respirabilité et maintien."),
        ("Identité", "Blanc, noir, argenté, Manrope et promesse Reveal Your Inner Beauty."),
        ("Collection", "Pourpre Impérial, Rose Velours et Lilas Céleste, du S au XL."),
        ("Référence", "Un rythme visuel fort et un parcours e-commerce premium, sans copier une autre marque."),
        ("Priorité", "Valider le bon périmètre de lancement, puis connecter paiement, stock et commandes."),
    ]
    cols = 3
    card_w = (W - 108) / cols
    card_h = 122
    for i, (heading, body) in enumerate(items):
        row, col = divmod(i, cols)
        x = 42 + col * (card_w + 12)
        y = 282 - row * (card_h + 13)
        rounded_box(c, x, y, card_w, card_h, WHITE, LINE)
        c.setFillColor((POURPRE, ROSE_COLOR, LILAS)[col])
        c.rect(x, y + card_h - 7, card_w, 7, fill=True, stroke=False)
        c.setFillColor(INK)
        c.setFont(BOLD, 11)
        c.drawString(x + 18, y + 86, heading)
        paragraph(c, body, x + 18, y + 63, card_w - 36, 8.2, 11.5, MUTED)
    page_footer(c, 2)


def page_screen_overview(c):
    background(c, INK)
    eyebrow(c, "Parcours de la page d'accueil", 42, H - 46, SILVER)
    title(c, "Un écran, une idée, une progression.", 42, H - 88, 32, WHITE)
    screens = [
        ("01", "Territoire", "Métal liquide, logo, promesse"),
        ("02", "Révélation", "Apollon apparaît pour la première fois"),
        ("03", "Collection", "Trois coloris, trois portes d'entrée"),
        ("04", "Matière", "Preuve produit et composition claire"),
        ("05", "Présence", "Campagne humaine et confiance"),
        ("06", "Détails", "Quatre bénéfices lisibles"),
        ("07", "Conclusion", "Promesse, lancement, conversion"),
    ]
    y = 348
    card_w = (W - 108) / 4
    for i, (number, heading, body) in enumerate(screens):
        row = 0 if i < 4 else 1
        col = i if i < 4 else i - 4
        x = 42 + col * (card_w + 8)
        yy = y - row * 150
        fill = Color(1, 1, 1, alpha=0.07)
        rounded_box(c, x, yy, card_w, 128, fill, Color(1, 1, 1, alpha=0.18))
        c.setFillColor(SILVER)
        c.setFont(BOLD, 7)
        c.drawString(x + 15, yy + 99, number)
        c.setFillColor(WHITE)
        c.setFont(BOLD, 12)
        c.drawString(x + 15, yy + 70, heading)
        paragraph(c, body, x + 15, yy + 47, card_w - 30, 8, 11, Color(1, 1, 1, alpha=0.6))
    c.setFillColor(Color(1, 1, 1, alpha=0.12))
    c.rect(42, 52, W - 84, 46, fill=True, stroke=False)
    c.setFillColor(WHITE)
    c.setFont(BOLD, 8)
    c.drawString(58, 76, "PRINCIPE")
    c.setFont(REGULAR, 8.2)
    c.drawString(130, 76, "Le mouvement sert le récit : identité, produit, preuve, confiance, conversion.")
    page_footer(c, 3, True)


def page_talk_track_1(c):
    background(c)
    eyebrow(c, "Éléments de langage", 42, H - 46)
    title(c, "Présenter les écrans 01 à 04.", 42, H - 88, 32)
    talks = [
        ("01", "Territoire de marque", "On n'affiche pas immédiatement le produit. On installe d'abord AJ Luxury avec le métal liquide, le logo et la promesse. Cela donne à la marque un territoire identifiable avant de vendre."),
        ("02", "Révélation d'Apollon", "Le produit apparaît ensuite volontairement. On reprend le nom Pourpre Impérial et la description transmise, sans ajouter de promesse non validée."),
        ("03", "Les trois coloris", "On présente un seul modèle et trois coloris. Le visiteur comprend immédiatement l'offre et peut entrer par le coloris qui lui correspond, sans catalogue artificiellement gonflé."),
        ("04", "La preuve matière", "Ici, on quitte le discours de marque pour donner des preuves concrètes : 94% modal, 6% élasthanne, ceinture 3,5 cm, toucher doux et liberté de mouvement."),
    ]
    y = H - 145
    for i, (num, heading, body) in enumerate(talks):
        yy = y - i * 94
        rounded_box(c, 42, yy - 62, W - 84, 78, WHITE, LINE)
        c.setFillColor((SILVER, POURPRE, ROSE_COLOR, LILAS)[i])
        c.rect(42, yy - 62, 7, 78, fill=True, stroke=False)
        c.setFillColor(MUTED)
        c.setFont(BOLD, 7)
        c.drawString(62, yy - 3, num)
        c.setFillColor(INK)
        c.setFont(BOLD, 11)
        c.drawString(96, yy - 5, heading)
        paragraph(c, body, 260, yy + 2, W - 318, 8.3, 11.5, MUTED)
    page_footer(c, 4)


def page_talk_track_2(c):
    background(c, INK)
    cover_image(c, DUO, W * 0.52, 0, W * 0.48, H, 0.52, 0.42)
    c.setFillColor(Color(0.02, 0.02, 0.03, alpha=0.45))
    c.rect(W * 0.52, 0, W * 0.48, H, fill=True, stroke=False)
    eyebrow(c, "Éléments de langage", 42, H - 46, SILVER)
    title(c, "Présenter les écrans 05 à 07.", 42, H - 88, 32, WHITE)
    talks = [
        ("05", "Présence et confiance", "Les photos portées montrent la coupe sur des mannequins et donnent une présence humaine à la marque. Le texte reprend la vision transmise sur le confort et la confiance."),
        ("06", "Les caractéristiques", "On hiérarchise les informations fournies : toucher doux et soyeux, matière respirante, maintien, ceinture de 3,5 cm et logo métallique."),
        ("07", "Conclusion et lancement", "Le métal revient pour fermer la boucle. On rappelle la promesse, on renvoie vers les coloris et on prépare la future collecte d'emails sans prétendre qu'elle est déjà connectée."),
    ]
    y = H - 150
    for i, (num, heading, body) in enumerate(talks):
        yy = y - i * 116
        c.setFillColor(SILVER)
        c.setFont(BOLD, 7)
        c.drawString(44, yy, num)
        c.setFillColor(WHITE)
        c.setFont(BOLD, 12)
        c.drawString(78, yy, heading)
        paragraph(c, body, 78, yy - 20, 330, 8.4, 12, Color(1, 1, 1, alpha=0.65))
    c.setFillColor(Color(1, 1, 1, alpha=0.12))
    c.rect(42, 52, 385, 48, fill=True, stroke=False)
    c.setFillColor(WHITE)
    c.setFont(BOLD, 8)
    c.drawString(56, 79, "À RETENIR")
    c.setFont(REGULAR, 8)
    c.drawString(130, 79, "La maquette est une direction à valider, pas un site déjà mis en production.")
    page_footer(c, 5, True)


def page_catalog(c):
    background(c)
    eyebrow(c, "Catalogue et stock reçus", 42, H - 46)
    title(c, "Apollon : 756 unités, 12 variantes.", 42, H - 88, 32)
    cards = [
        ("Pourpre Impérial", POURPRE, [26, 103, 87, 36]),
        ("Rose Velours", ROSE_COLOR, [26, 103, 87, 36]),
        ("Lilas Céleste", LILAS, [26, 102, 88, 36]),
    ]
    card_w = (W - 108) / 3
    for i, (name, color, values) in enumerate(cards):
        x = 42 + i * (card_w + 12)
        rounded_box(c, x, 188, card_w, 245, WHITE, LINE)
        c.setFillColor(color)
        c.rect(x, 357, card_w, 76, fill=True, stroke=False)
        c.setFillColor(INK)
        c.setFont(BOLD, 13)
        c.drawString(x + 18, 324, name)
        c.setFillColor(MUTED)
        c.setFont(REGULAR, 8)
        c.drawString(x + 18, 298, "S       M       L       XL")
        c.setFillColor(INK)
        c.setFont(BOLD, 12)
        c.drawString(x + 18, 272, f"{values[0]}      {values[1]}      {values[2]}      {values[3]}")
        c.setFont(BOLD, 22)
        c.drawString(x + 18, 220, f"{sum(values)}")
        c.setFont(REGULAR, 8)
        c.setFillColor(MUTED)
        c.drawString(x + 68, 226, "unités")
    c.setFillColor(INK)
    c.setFont(BOLD, 10)
    c.drawString(42, 145, "POINT À ARBITRER")
    paragraph(
        c,
        "Le stock physique sera divisé en plusieurs lots et une partie sera offerte à des influenceurs. Avant la mise en ligne, il faut définir le stock réellement vendable, la réserve de sécurité et la règle de réassort.",
        42, 122, W - 84, 8.7, 12, MUTED,
    )
    page_footer(c, 6)


def draw_tree(c, x, y, width, title_text, lines, accent):
    rounded_box(c, x, y, width, 370, WHITE, LINE)
    c.setFillColor(accent)
    c.rect(x, y + 330, width, 40, fill=True, stroke=False)
    c.setFillColor(WHITE)
    c.setFont(BOLD, 10)
    c.drawString(x + 16, y + 345, title_text)
    yy = y + 306
    for depth, label, state in lines:
        xx = x + 18 + depth * 18
        if depth:
            c.setStrokeColor(LINE)
            c.line(xx - 10, yy + 2, xx - 2, yy + 2)
        c.setFillColor(INK if depth == 0 else MUTED)
        c.setFont(BOLD if depth == 0 else REGULAR, 7.7)
        c.drawString(xx, yy, label)
        if state:
            c.setFillColor(accent)
            c.circle(x + width - 18, yy + 2, 2.5, fill=True, stroke=False)
        yy -= 22


def page_tree(c):
    background(c)
    eyebrow(c, "Arborescence", 42, H - 46)
    title(c, "Ce qui existe et ce qui est visé.", 42, H - 88, 32)
    current = [
        (0, "Accueil one-page", True),
        (1, "7 écrans éditoriaux", True),
        (0, "Collection Apollon", True),
        (1, "Pourpre Impérial", True),
        (1, "Rose Velours", True),
        (1, "Lilas Céleste", True),
        (0, "Panier de démonstration", True),
        (0, "Commande simulée", True),
        (0, "Projection espace client", True),
    ]
    target = [
        (0, "Accueil", True),
        (0, "Boutique", True),
        (1, "Apollon et ses 3 coloris", True),
        (1, "Guide des tailles", False),
        (0, "Notre histoire", False),
        (0, "Panier et paiement", False),
        (0, "Espace client", False),
        (1, "Commandes et suivi", False),
        (1, "Retours", False),
        (0, "Livraison et retours", False),
        (0, "Contact et pages légales", False),
    ]
    draw_tree(c, 42, 70, 350, "À DATE", current, POURPRE)
    draw_tree(c, 448, 70, 350, "CIBLE DE MISE EN LIGNE", target, LILAS)
    page_footer(c, 7)


def page_mindmap_current(c):
    background(c)
    eyebrow(c, "Architecture à date", 42, H - 46)
    title(c, "Une maquette fonctionnelle, sans données réelles.", 42, H - 88, 31)
    root_x, root_y, root_w, root_h = W / 2 - 85, H / 2 - 34, 170, 68
    rounded_box(c, root_x, root_y, root_w, root_h, INK, INK)
    c.setFillColor(WHITE)
    c.setFont(BOLD, 12)
    c.drawCentredString(W / 2, root_y + 39, "AJ LUXURY")
    c.setFont(REGULAR, 7)
    c.drawCentredString(W / 2, root_y + 22, "MAQUETTE ACTUELLE")
    front_nodes = [
        (42, 348, "Accueil one-page", "7 écrans, responsive, animations"),
        (42, 248, "Fiches Apollon", "3 coloris, tailles S à XL"),
        (42, 148, "Panier et commande", "Parcours simulé et vérifiable"),
    ]
    back_nodes = [
        (610, 348, "Catalogue structuré", "3 produits, 12 variantes"),
        (610, 248, "Stocks intégrés", "Valeurs reçues, non décrémentées"),
        (610, 148, "Données simulées", "Pas de paiement ni compte actif"),
    ]
    for x, y, h, b in front_nodes:
        node(c, x, y, 190, 72, h, b, SUCCESS, POURPRE)
        connector(c, x + 190, y + 36, root_x, root_y + root_h / 2)
    for x, y, h, b in back_nodes:
        node(c, x, y, 190, 72, h, b, MIST, LILAS)
        connector(c, root_x + root_w, root_y + root_h / 2, x, y + 36)
    c.setFillColor(POURPRE)
    c.setFont(BOLD, 8)
    c.drawString(42, 112, "FRONT : CE QUE LE CLIENT VOIT")
    c.setFillColor(LILAS)
    c.drawRightString(W - 42, 112, "BACK : CE QUI TOURNE EN COULISSES")
    page_footer(c, 8)


def page_mindmap_target(c):
    background(c, INK)
    eyebrow(c, "Architecture cible", 42, H - 46, SILVER)
    title(c, "Vendre, suivre et faire évoluer.", 42, H - 88, 31, WHITE)
    root_x, root_y, root_w, root_h = W / 2 - 85, H / 2 - 34, 170, 68
    rounded_box(c, root_x, root_y, root_w, root_h, WHITE, WHITE)
    c.setFillColor(INK)
    c.setFont(BOLD, 12)
    c.drawCentredString(W / 2, root_y + 39, "AJ LUXURY")
    c.setFont(REGULAR, 7)
    c.drawCentredString(W / 2, root_y + 22, "SITE EN PRODUCTION")
    front_nodes = [
        (42, 358, "Expérience finale", "Responsive, rapide, accessible"),
        (42, 258, "Achat réel", "Prix, disponibilité, paiement"),
        (42, 158, "Compte client", "Commandes, suivi, retours"),
    ]
    back_nodes = [
        (610, 358, "Gestion commerce", "Produits, prix, commandes"),
        (610, 258, "Stock opérationnel", "Vente, réserve, influenceurs"),
        (610, 158, "Services connectés", "Paiement, emails, analytics"),
    ]
    for x, y, h, b in front_nodes:
        node(c, x, y, 190, 72, h, b, Color(1, 1, 1, alpha=0.08), POURPRE)
        connector(c, x + 190, y + 36, root_x, root_y + root_h / 2, Color(1, 1, 1, alpha=0.22))
    for x, y, h, b in back_nodes:
        node(c, x, y, 190, 72, h, b, Color(1, 1, 1, alpha=0.08), LILAS)
        connector(c, root_x + root_w, root_y + root_h / 2, x, y + 36, Color(1, 1, 1, alpha=0.22))
    c.setFillColor(Color(1, 1, 1, alpha=0.12))
    c.rect(42, 64, W - 84, 46, fill=True, stroke=False)
    c.setFillColor(WHITE)
    c.setFont(BOLD, 8)
    c.drawString(58, 88, "RÈGLE DE PROPRIÉTÉ")
    c.setFont(REGULAR, 8)
    c.drawString(172, 88, "Domaine, paiement, hébergement et données ouverts au nom d'AJ Luxury.")
    page_footer(c, 9, True)


def page_code(c):
    background(c)
    eyebrow(c, "Ce que contient le code", 42, H - 46)
    title(c, "Un site lisible, modifiable et transférable.", 42, H - 88, 31)
    parts = [
        ("Structure", "Les pages et les blocs du site. C'est l'équivalent du plan et des pièces d'un bâtiment.", "HTML / composants"),
        ("Identité visuelle", "Les couleurs, typographies, positions, formats mobiles et mouvements.", "CSS / animations"),
        ("Comportements", "Les choix de taille, les variantes, le panier et les interactions.", "Logique du site"),
        ("Données commerce", "Les produits, tailles, stocks et futures connexions avec paiement et commandes.", "Catalogue / back"),
    ]
    card_w = (W - 108) / 2
    for i, (heading, body, label) in enumerate(parts):
        row, col = divmod(i, 2)
        x = 42 + col * (card_w + 12)
        y = 278 - row * 150
        rounded_box(c, x, y, card_w, 128, WHITE, LINE)
        c.setFillColor((POURPRE, LILAS)[col])
        c.setFont(BOLD, 7)
        c.drawString(x + 18, y + 95, label.upper())
        c.setFillColor(INK)
        c.setFont(BOLD, 12)
        c.drawString(x + 18, y + 66, heading)
        paragraph(c, body, x + 18, y + 43, card_w - 36, 8.2, 11.5, MUTED)
    c.setFillColor(INK)
    c.roundRect(42, 48, W - 84, 56, 4, fill=True, stroke=False)
    c.setFillColor(WHITE)
    c.setFont(BOLD, 8.2)
    c.drawString(58, 80, "EN CLAIR")
    c.setFont(REGULAR, 8.2)
    c.drawString(130, 80, "AJ Luxury pourra confier le site à un autre développeur sans repartir de zéro ni dépendre d'un éditeur fermé.")
    page_footer(c, 10)


def page_method(c):
    background(c, INK)
    eyebrow(c, "Méthode et responsabilité", 42, H - 46, SILVER)
    title(c, "L'IA accélère. La responsabilité reste humaine.", 42, H - 88, 30, WHITE)
    steps = [
        ("01", "Explorer", "Comparer rapidement des directions visuelles et techniques."),
        ("02", "Produire", "Créer le code, les variantes et les supports plus vite."),
        ("03", "Contrôler", "Auditer le rendu, tester les parcours et corriger les écarts."),
        ("04", "Documenter", "Laisser une base claire, compréhensible et réutilisable."),
    ]
    card_w = (W - 108) / 4
    for i, (num, heading, body) in enumerate(steps):
        x = 42 + i * (card_w + 8)
        rounded_box(c, x, 246, card_w, 170, Color(1, 1, 1, alpha=0.06), Color(1, 1, 1, alpha=0.16))
        c.setFillColor(SILVER)
        c.setFont(BOLD, 7)
        c.drawString(x + 16, 385, num)
        c.setFillColor(WHITE)
        c.setFont(BOLD, 12)
        c.drawString(x + 16, 343, heading)
        paragraph(c, body, x + 16, 316, card_w - 32, 8.1, 11.5, Color(1, 1, 1, alpha=0.62))
    c.setFillColor(WHITE)
    c.setFont(BOLD, 11)
    c.drawString(42, 192, "Livrables de réversibilité")
    paragraph(
        c,
        "Code source complet, guide d'installation, procédure de déploiement, architecture, inventaire des services, guide de modification des contenus et passation.",
        42, 168, 690, 8.6, 12, Color(1, 1, 1, alpha=0.64),
    )
    c.setFillColor(POURPRE)
    c.roundRect(42, 62, W - 84, 54, 4, fill=True, stroke=False)
    c.setFillColor(WHITE)
    c.setFont(BOLD, 8.3)
    c.drawString(58, 92, "TRANSPARENCE")
    c.setFont(REGULAR, 8.3)
    c.drawString(150, 92, "Premier projet client conduit de bout en bout avec une organisation agentique, sous contrôle technique humain.")
    c.setFillColor(Color(1, 1, 1, alpha=0.56))
    c.setFont(REGULAR, 7.2)
    c.drawString(42, 42, "Textes de marque : contenus AJ Luxury. Toute proposition éditoriale complémentaire reste séparée et soumise à validation.")
    page_footer(c, 11, True)


def page_workstreams(c):
    background(c)
    eyebrow(c, "Organisation proposée", 42, H - 46)
    title(c, "Avancer par lots, avec une validation à chaque étape.", 42, H - 88, 29)
    lots = [
        ("01", "Cadrage", "Périmètre, priorités, décisions manquantes", "Validation du socle"),
        ("02", "Design final", "Écrans, responsive, contenus, motion", "Validation visuelle"),
        ("03", "Commerce", "Prix, stock, paiement, livraison", "Validation fonctionnelle"),
        ("04", "Lancement", "Tests, domaine, analytics, documentation", "Mise en ligne"),
    ]
    y = 350
    for i, (num, heading, body, gate) in enumerate(lots):
        x = 42 + i * 198
        rounded_box(c, x, y, 180, 126, WHITE, LINE)
        c.setFillColor((POURPRE, ROSE_COLOR, LILAS, SILVER)[i])
        c.rect(x, y + 119, 180, 7, fill=True, stroke=False)
        c.setFillColor(MUTED)
        c.setFont(BOLD, 7)
        c.drawString(x + 16, y + 94, num)
        c.setFillColor(INK)
        c.setFont(BOLD, 11)
        c.drawString(x + 16, y + 68, heading)
        paragraph(c, body, x + 16, y + 47, 148, 7.7, 10.5, MUTED)
        c.setFillColor(INK)
        c.setFont(BOLD, 7)
        c.drawString(x + 16, y + 16, gate.upper())
    c.setFillColor(INK)
    c.setFont(BOLD, 11)
    c.drawString(42, 282, "Ce qui reste séparé du développement")
    boundaries = [
        "Retouche ou remplacement des fonds photo",
        "Création d'une vidéo originale de campagne",
        "Rédaction juridique ou conseil légal",
        "Production continue de contenus marketing",
    ]
    for i, body in enumerate(boundaries):
        x = 42 + (i % 2) * 398
        yy = 240 - (i // 2) * 58
        c.setFillColor(MIST)
        c.roundRect(x, yy, 370, 42, 3, fill=True, stroke=False)
        c.setFillColor(INK)
        c.setFont(BOLD, 8.2)
        c.drawString(x + 16, yy + 17, body)
    paragraph(
        c,
        "Chaque besoin complémentaire est examiné sur les fichiers réels, validé sur un échantillon, puis chiffré avant production.",
        42, 91, W - 84, 8.4, 12, MUTED,
    )
    page_footer(c, 12)


def page_opportunities(c):
    background(c)
    eyebrow(c, "Pistes de progression à valider", 42, H - 46)
    title(c, "Renforcer le produit sans alourdir la V1.", 42, H - 88, 30)
    ideas = [
        (
            "01",
            "Faire de la ceinture un moment fort",
            "Un plan macro, un zoom au scroll ou une courte boucle peuvent mettre en valeur le logo métallique.",
            "Nécessite une photo ou vidéo macro en haute définition.",
            POURPRE,
        ),
        (
            "02",
            "Uniformiser les fonds produit",
            "Tester un fond blanc-gris avec relief et lumière sur un échantillon avant de traiter toute la série.",
            "Production visuelle distincte, chiffrée après test.",
            SILVER,
        ),
        (
            "03",
            "Rassurer sur la taille",
            "Ajouter un guide court, une méthode de mesure et une correspondance simple entre tailles.",
            "Nécessite le barème réel du fabricant.",
            LILAS,
        ),
        (
            "04",
            "Séparer stock vendable et dotations",
            "Réserver les unités influenceurs hors du stock disponible afin d'éviter les surventes.",
            "Faisable directement dans la logique de stock cible.",
            ROSE_COLOR,
        ),
        (
            "05",
            "Traiter les trois coloris comme un lancement",
            "Créer un rythme éditorial commun, puis donner à chaque coloris sa propre entrée produit.",
            "Piste de présentation, sans inventer de nouveaux produits.",
            INK,
        ),
    ]
    for i, (num, heading, body, condition, accent) in enumerate(ideas):
        col, row = i % 2, i // 2
        x = 42 + col * 396
        y = 376 - row * 112
        width = 360 if i < 4 else 756
        rounded_box(c, x if i < 4 else 42, y, width, 94, WHITE, LINE)
        box_x = x if i < 4 else 42
        c.setFillColor(accent)
        c.rect(box_x, y, 6, 94, fill=True, stroke=False)
        c.setFillColor(MUTED)
        c.setFont(BOLD, 7)
        c.drawString(box_x + 18, y + 68, num)
        c.setFillColor(INK)
        c.setFont(BOLD, 10.4)
        c.drawString(box_x + 48, y + 67, heading)
        paragraph(c, body, box_x + 48, y + 48, width - 68, 7.6, 10.2, MUTED, max_lines=2)
        c.setFillColor(accent)
        c.setFont(BOLD, 6.7)
        c.drawString(box_x + 48, y + 14, condition.upper())
    c.setFillColor(MIST)
    c.roundRect(42, 46, W - 84, 36, 3, fill=True, stroke=False)
    c.setFillColor(INK)
    c.setFont(BOLD, 7.5)
    c.drawString(56, 61, "Ces pistes ne sont ni promises ni incluses tant que leur intérêt, leurs fichiers sources et leur charge ne sont pas validés.")
    page_footer(c, 13)


def page_infrastructure(c):
    background(c)
    eyebrow(c, "Coûts fournisseurs vérifiés", 42, H - 46)
    title(c, "Un socle léger, sans abonnement inutile.", 42, H - 88, 31)
    rows = [
        ("Nom de domaine .fr", "OVHcloud", "5,99 € TTC la 1re année", "9,35 € TTC/an au renouvellement"),
        ("Email professionnel", "OVHcloud Starter", "Inclus avec le .fr consulté", "À confirmer au moment de la commande"),
        ("Hébergement front", "Cloudflare Pages Free", "0 € au démarrage", "500 builds/mois, bande passante statique illimitée"),
        ("Analytics essentiels", "Cloudflare Web Analytics", "0 €", "Mesures essentielles, approche sans cookies"),
        ("Paiement", "Stripe standard", "0 € fixe", "1,5% + 0,25 € par carte EEE standard"),
        ("Alternative tout-en-un", "Shopify Basic", "29 $US/mois annuel", "39 $US/mois en paiement mensuel"),
    ]
    x = [42, 260, 410, 575]
    widths = [210, 145, 160, 220]
    c.setFillColor(INK)
    c.rect(42, 377, W - 84, 32, fill=True, stroke=False)
    c.setFillColor(WHITE)
    c.setFont(BOLD, 7)
    for xx, label in zip(x, ("Besoin", "Solution", "Coût", "Lecture")):
        c.drawString(xx + 9, 389, label.upper())
    y = 337
    for i, row in enumerate(rows):
        c.setFillColor(WHITE if i % 2 == 0 else MIST)
        c.rect(42, y, W - 84, 40, fill=True, stroke=False)
        for xx, ww, value in zip(x, widths, row):
            paragraph(c, value, xx + 9, y + 24, ww - 14, 7.4, 9.5, INK if xx == 42 else MUTED, max_lines=2)
        y -= 40
    c.setFillColor(INK)
    c.setFont(BOLD, 8)
    c.drawString(42, 78, "SOURCES OFFICIELLES CONSULTÉES LE 23.07.2026")
    sources = [
        "ovhcloud.com/fr/domains/tld/fr/",
        "pages.cloudflare.com/",
        "cloudflare.com/web-analytics/",
        "stripe.com/fr/pricing",
        "shopify.com/fr/tarifs",
    ]
    c.setFont(REGULAR, 6.8)
    c.setFillColor(MUTED)
    c.drawString(42, 60, "  |  ".join(sources))
    page_footer(c, 14)


def page_call(c):
    background(c, INK)
    eyebrow(c, "Sortie attendue du call", 42, H - 46, SILVER)
    title(c, "Décider assez pour avancer proprement.", 42, H - 88, 31, WHITE)
    decisions = [
        ("01", "Direction visuelle", "Valider le rythme one-page, l'identité métallique et le niveau de sobriété."),
        ("02", "Rôle du site", "Aligner l'image de marque attendue et l'objectif du premier lancement."),
        ("03", "Contenus", "Lister les éléments validés, manquants et à produire séparément."),
        ("04", "Périmètre V1", "Confirmer ce qui doit être prêt pour une première version exploitable."),
        ("05", "Organisation", "Définir les interlocuteurs, le rythme de validation et l'espace de partage."),
        ("06", "Prochaine étape", "Transformer les décisions en planning, livrables, responsabilités et chiffrage."),
    ]
    for i, (num, heading, body) in enumerate(decisions):
        col, row = i % 2, i // 2
        x = 42 + col * 396
        y = 380 - row * 102
        c.setFillColor(SILVER)
        c.setFont(BOLD, 7)
        c.drawString(x, y, num)
        c.setFillColor(WHITE)
        c.setFont(BOLD, 11)
        c.drawString(x + 34, y, heading)
        paragraph(c, body, x + 34, y - 19, 320, 8.2, 11.5, Color(1, 1, 1, alpha=0.62))
    c.setFillColor(POURPRE)
    c.roundRect(42, 52, W - 84, 56, 4, fill=True, stroke=False)
    c.setFillColor(WHITE)
    c.setFont(BOLD, 8.3)
    c.drawString(58, 84, "APRÈS LE CALL")
    c.setFont(REGULAR, 8.3)
    c.drawString(152, 84, "Compte rendu de décisions, périmètre de la V1, planning par lots et chiffrage final.")
    page_footer(c, 15, True)


def build():
    register_fonts()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    DELIVERABLE_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)

    c = canvas.Canvas(str(PDF_PATH), pagesize=(W, H))
    c.setTitle("AJ Luxury - Dossier projet complet")
    c.setAuthor("Adam Chabbi")
    pages = (
        page_cover,
        page_understanding,
        page_screen_overview,
        page_talk_track_1,
        page_talk_track_2,
        page_catalog,
        page_tree,
        page_mindmap_current,
        page_mindmap_target,
        page_code,
        page_method,
        page_workstreams,
        page_opportunities,
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
