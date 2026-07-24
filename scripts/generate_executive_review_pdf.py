from pathlib import Path

from PIL import Image
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "AJ-Luxury-Delivery-Review-24-07-2026.pdf"
TMP = ROOT / "tmp" / "pdfs" / "executive-review"
PAGE = landscape((540, 960))
W, H = PAGE

BLACK = HexColor("#09090B")
INK = HexColor("#111114")
PAPER = HexColor("#F2F1EE")
SILVER = HexColor("#AEB1B7")
MID = HexColor("#686A70")
LINE = HexColor("#D2D1CE")
WHITE = HexColor("#F8F8F6")
PURPLE = HexColor("#6D153E")
PALE = HexColor("#E6E4E0")
GREEN = HexColor("#355C4A")
AMBER = HexColor("#9A6A22")

pdfmetrics.registerFont(TTFont("AJRegular", r"C:\Windows\Fonts\arial.ttf"))
pdfmetrics.registerFont(TTFont("AJBold", r"C:\Windows\Fonts\arialbd.ttf"))


def background(c, color=PAPER):
    c.setFillColor(color)
    c.rect(0, 0, W, H, fill=1, stroke=0)


def rule(c, x1, y, x2, color=LINE, width=0.6):
    c.setStrokeColor(color)
    c.setLineWidth(width)
    c.line(x1, y, x2, y)


def text(c, value, x, y, size=12, color=INK, font="AJRegular", leading=None):
    c.setFont(font, size)
    c.setFillColor(color)
    leading = leading or size * 1.25
    for line in value.split("\n"):
        c.drawString(x, y, line)
        y -= leading
    return y


def label(c, value, x, y, color=MID, size=7):
    obj = c.beginText(x, y)
    obj.setFont("AJBold", size)
    obj.setCharSpace(1.1)
    obj.setFillColor(color)
    obj.textLine(value.upper())
    c.drawText(obj)


def wrapped(c, value, x, y, width, size=10, color=INK, leading=14, font="AJRegular", max_lines=None):
    words = value.split()
    lines = []
    line = ""
    for word in words:
        candidate = f"{line} {word}".strip()
        if pdfmetrics.stringWidth(candidate, font, size) <= width:
            line = candidate
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    if max_lines:
        lines = lines[:max_lines]
    c.setFont(font, size)
    c.setFillColor(color)
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def image_cover(source, destination, ratio, focus_x=0.5, focus_y=0.5):
    image = Image.open(source).convert("RGB")
    current = image.width / image.height
    if current > ratio:
        width = int(image.height * ratio)
        left = int((image.width - width) * focus_x)
        left = max(0, min(image.width - width, left))
        box = (left, 0, left + width, image.height)
    else:
        height = int(image.width / ratio)
        top = int((image.height - height) * focus_y)
        top = max(0, min(image.height - height, top))
        box = (0, top, image.width, top + height)
    image.crop(box).save(destination, quality=94)
    return destination


def image_box(c, source, x, y, width, height, focus_x=0.5, focus_y=0.5):
    crop = TMP / f"crop-{source.stem}-{int(x)}-{int(y)}-{int(width)}-{int(height)}.jpg"
    image_cover(source, crop, width / height, focus_x, focus_y)
    c.drawImage(str(crop), x, y, width, height, preserveAspectRatio=False, mask="auto")


def footer(c, page, dark=False):
    color = HexColor("#3B3C40") if dark else LINE
    rule(c, 38, 24, W - 38, color=color)
    label(c, "AJ LUXURY - DELIVERY REVIEW - 24.07.2026", 38, 10, SILVER if dark else MID, 6.2)
    label(c, f"{page:02d} / 08", W - 92, 10, SILVER if dark else MID, 6.2)


def status_pill(c, value, x, y, color):
    width = pdfmetrics.stringWidth(value.upper(), "AJBold", 6.4) + 18
    c.setFillColor(color)
    c.roundRect(x, y - 9, width, 16, 8, fill=1, stroke=0)
    label(c, value, x + 9, y - 4, WHITE, 6.4)
    return width


def draw_cover(c):
    source = TMP / "delivery-hero.jpg"
    image_box(c, source, 0, 0, W, H, 0.5, 0.5)
    c.saveState()
    c.setFillAlpha(0.76)
    c.setFillColor(HexColor("#070709"))
    c.rect(0, 0, W, 176, fill=1, stroke=0)
    c.setFillAlpha(0.34)
    c.rect(0, H - 44, W, 44, fill=1, stroke=0)
    c.restoreState()
    label(c, "CLIENT - AJ LUXURY - JÉRÉMY & ALEX, COFONDATEURS ET DÉCIDEURS MÉTIER", 38, H - 28, WHITE, 6.5)
    text(c, "Design, commerce & delivery review", 38, 142, 25, WHITE)
    text(
        c,
        "Cadrage du besoin, conception de l’expérience,\nprototype fonctionnel, contrôles qualité et backlog\nde mise en production.",
        39,
        111,
        8.4,
        SILVER,
        "AJRegular",
        12,
    )
    label(c, "RESPONSABLE DE LA LIVRAISON", 520, 137, SILVER, 6.2)
    text(c, "Adam CHABBI", 520, 116, 12, WHITE, "AJBold")
    wrapped(c, "Pilotage, cadrage, UX/UI, réalisation, tests et documentation.", 520, 96, 180, 7.4, SILVER, 10)
    label(c, "CONTRIBUTION PRÉVUE", 738, 137, SILVER, 6.2)
    text(c, "Isabelle", 738, 116, 11, WHITE, "AJBold")
    wrapped(c, "Retouche IA et production visuelle. Périmètre à valider et chiffrer.", 738, 96, 178, 7.4, SILVER, 10)
    footer(c, 1, True)
    c.showPage()


def draw_need(c):
    background(c)
    label(c, "01 - BESOIN ET CADRAGE", 42, H - 42)
    text(c, "Un socle e-commerce propriétaire,\ndocumenté et prêt à être industrialisé.", 42, H - 82, 27, INK, "AJRegular", 31)
    rule(c, 42, H - 154, W - 42)

    label(c, "BESOIN COMPRIS", 42, 362, PURPLE)
    text(
        c,
        "Créer pour AJ Luxury un site propriétaire, sobre et premium, inspiré dans son agencement par Abel Pirela sans en reprendre l’identité.\nLa première version doit installer Apollon, trois coloris, les deux cofondateurs et mannequins, la matière, le métal\net un parcours d’achat évolutif.",
        42,
        340,
        9.4,
        MID,
        "AJRegular",
        14,
    )

    columns = [
        (
            "Entrées consolidées",
            "Charte noir, blanc, argent\nManrope et logo transparent\nSlogan fourni par AJ Luxury\n3 descriptions produit\nPhotos et stocks initiaux",
        ),
        (
            "Contraintes intégrées",
            "1 modèle, 3 coloris\nTailles S, M, L et XL\nDeux mannequins à parité\nAssets encore à finaliser\nPrix et domaine non décidés",
        ),
        (
            "Périmètre démontré",
            "Accueil et boutique\n3 fiches produit\nZoom et responsive\nPanier, checkout, compte en démo\nPages de service et documentation",
        ),
    ]
    for index, (title, body) in enumerate(columns):
        x = 42 + index * 298
        c.setFillColor(WHITE)
        c.roundRect(x, 112, 276, 168, 8, fill=1, stroke=0)
        label(c, f"0{index + 1}", x + 16, 256, PURPLE)
        text(c, title, x + 16, 232, 11, INK, "AJBold")
        text(c, body, x + 16, 204, 8.4, MID, "AJRegular", 19)

    c.setFillColor(PALE)
    c.roundRect(42, 51, W - 84, 42, 7, fill=1, stroke=0)
    label(c, "PRINCIPE DE TRANSPARENCE", 57, 75, PURPLE, 6.4)
    text(c, "Le prototype prouve l’expérience. Il ne présente pas comme actifs les paiements, stocks ou services encore à brancher.", 238, 70, 9.2, INK)
    footer(c, 2)
    c.showPage()


def draw_work(c):
    background(c)
    label(c, "02 - TRAVAIL OBJECTIVÉ", 42, H - 42)
    text(c, "Le travail est structuré en lots,\npreuves et décisions vérifiables.", 42, H - 82, 27, INK, "AJRegular", 31)

    metrics = [
        ("16/16", "tests techniques validés"),
        ("03", "produits et coloris structurés"),
        ("02", "mannequins gouvernés à parité"),
        ("06", "lots de travail documentés"),
    ]
    for i, (value, caption) in enumerate(metrics):
        x = 42 + i * 222
        y = 351
        text(c, value, x, y, 22, PURPLE, "AJRegular")
        wrapped(c, caption, x + 70, y + 2, 128, 8.2, MID, 11)
    rule(c, 42, 322, W - 42)

    items = [
        ("01", "Cadrage & benchmark", "Brief, référence, périmètre et risques.", "Preuve : PROJECT-BASELINE.md"),
        ("02", "Direction artistique", "Métal, hiérarchie, contraste et rythme.", "Preuve : accueil livré"),
        ("03", "Contenus & assets", "Tri photo, logo, textes et parité.", "Preuve : COPY-SOURCE-REGISTER.md"),
        ("04", "UX & responsive", "Navigation, zoom, mobile et motion.", "Preuve : routes et captures"),
        ("05", "Fondation commerce", "Catalogue, variantes et parcours simulé.", "Preuve : lib/products.ts"),
        ("06", "Qualité & reprise", "Build, tests, documentation et backlog.", "Preuve : 16/16 tests"),
    ]
    for i, (num, title, body, proof) in enumerate(items):
        col = i % 3
        row = i // 3
        x = 42 + col * 298
        y = 280 - row * 112
        c.setFillColor(WHITE)
        c.roundRect(x, y - 72, 276, 94, 7, fill=1, stroke=0)
        label(c, num, x + 14, y + 2, PURPLE)
        text(c, title, x + 50, y + 2, 10.5, INK, "AJBold")
        wrapped(c, body, x + 14, y - 22, 245, 8.2, MID, 11)
        text(c, proof, x + 14, y - 55, 7.2, PURPLE, "AJBold")

    footer(c, 3)
    c.showPage()


def draw_before_after(c):
    background(c, BLACK)
    label(c, "03 - AVANT / APRÈS", 38, H - 38, SILVER)
    text(c, "De l’effet graphique à une expérience de marque.", 38, H - 76, 25, WHITE)

    before = TMP / "before-hero.png"
    after = TMP / "delivery-hero.jpg"
    image_box(c, before, 38, 172, 420, 236, 0.5, 0.48)
    image_box(c, after, 502, 172, 420, 236, 0.5, 0.5)
    label(c, "AVANT - EXPLORATION", 38, 152, SILVER)
    label(c, "APRÈS - LIVRABLE ACTUEL", 502, 152, SILVER)
    before_points = [
        "01  Slogan au premier niveau",
        "02  Produit absent de l’ouverture",
        "03  Navigation encore minimale",
        "04  Métal traité comme décor",
    ]
    after_points = [
        "01  Slogan ramené à une signature",
        "02  Produit et duo immédiatement visibles",
        "03  Navigation commerce + Instagram",
        "04  Métal intégré au langage de marque",
    ]
    for i, value in enumerate(before_points):
        text(c, value, 38, 126 - i * 18, 8.5, SILVER)
    for i, value in enumerate(after_points):
        text(c, value, 502, 126 - i * 18, 8.5, SILVER)
    footer(c, 4, True)
    c.showPage()


def draw_ux(c):
    background(c)
    label(c, "04 - RÉFÉRENCES ET PRINCIPES RETENUS", 42, H - 42)
    text(c, "Une filiation d’agencement.\nUne identité propre à AJ Luxury.", 42, H - 80, 27, INK, "AJRegular", 31)
    image_box(c, ROOT / "tmp" / "reference-abel-home.png", 42, 146, 410, 232, 0.5, 0.15)
    label(c, "RÉFÉRENCE CLIENT - ABEL PIRELA", 42, 128, PURPLE)
    wrapped(c, "Repris : logique d’agencement, rythme éditorial, découverte produit et navigation directe.", 42, 108, 410, 8.5, MID, 12)
    wrapped(c, "Non repris : identité, textes, direction artistique, assets et exécution graphique.", 42, 78, 410, 8.5, INK, 12, "AJBold")

    label(c, "PRINCIPES UX ET MOTION", 500, 367, PURPLE)
    principles = [
        ("Baymard", "Rendre la découverte produit continue et les accès commerce explicites."),
        ("W3C", "Respecter prefers-reduced-motion et éviter les mouvements non essentiels."),
        ("web.dev", "Animer transform et opacity, protéger LCP, INP et CLS."),
        ("NN/G", "Utiliser proximité, contraste et hiérarchie pour donner une fonction à l’espace."),
    ]
    for i, (name, body) in enumerate(principles):
        y = 335 - i * 56
        text(c, name, 500, y, 9.5, INK, "AJBold")
        wrapped(c, body, 574, y, 326, 8.2, MID, 11)

    metrics = [
        ("Apollon", "1008 px", "860 px"),
        ("Boutique", "1200 px", "1020 px"),
        ("Duo", "1078 px", "833 px"),
        ("Histoire", "828 px", "612 px"),
    ]
    for i, (name, before, after) in enumerate(metrics):
        x = 500 + (i % 2) * 214
        y = 108 - (i // 2) * 34
        text(c, name, x, y, 8.5, INK, "AJBold")
        text(c, f"{before}  >  {after}", x + 78, y, 8.2, MID)
    text(c, "Sources : baymard.com · w3.org/WAI/WCAG21 · web.dev/vitals · nngroup.com", 500, 42, 7.2, MID)
    footer(c, 5)
    c.showPage()


def draw_architecture(c):
    background(c)
    label(c, "05 - PRODUIT À DATE", 42, H - 42)
    text(c, "Un parcours e-commerce cohérent en démonstration.", 42, H - 82, 25)
    wrapped(c, "Les interfaces sont testées. Les services transactionnels restent à sélectionner, configurer et recetter.", 42, H - 116, 780, 9.5, MID, 13)

    labels = ["Accueil", "Boutique", "Produit", "Panier", "Checkout", "Compte"]
    x = 42
    y = 292
    for index, value in enumerate(labels):
        c.setFillColor(WHITE)
        c.setStrokeColor(LINE)
        c.roundRect(x, y, 124, 54, 8, fill=1, stroke=1)
        text(c, value, x + 13, y + 20, 10, INK, "AJBold")
        if index < len(labels) - 1:
            c.setStrokeColor(PURPLE)
            c.setLineWidth(1.2)
            c.line(x + 124, y + 27, x + 146, y + 27)
        x += 146

    bands = [
        ("DÉMONTRÉ", GREEN, "Interfaces, contenus, responsive, zoom, catalogue, navigation, panier et checkout simulés."),
        ("DOCUMENTÉ", PURPLE, "Code propriétaire, données catalogue centralisées et couche commerce conçue pour évoluer."),
        ("À CONNECTER", AMBER, "Paiement réel, commandes, stock synchronisé, e-mails, analytics et logistique."),
    ]
    for i, (title, color, body) in enumerate(bands):
        x = 42 + i * 294
        c.setFillColor(WHITE)
        c.roundRect(x, 132, 272, 108, 8, fill=1, stroke=0)
        status_pill(c, title, x + 14, 216, color)
        body_lines = [
            "Interfaces, contenus, responsive,\nzoom, catalogue, navigation,\npanier et checkout simulés.",
            "Code propriétaire, catalogue\ncentralisé et couche commerce\nconçue pour évoluer.",
            "Paiement réel, commandes,\nstock, e-mails, analytics\net logistique.",
        ]
        text(c, body_lines[i], x + 14, 185, 7.8, MID, "AJRegular", 11)

    label(c, "SOCLE TECHNIQUE VULGARISÉ", 42, 104, PURPLE)
    text(
        c,
        "Le front gère ce que le client voit et utilise. Le catalogue centralise les produits et variantes.\nLa couche commerce simule les actions et pourra être raccordée au prestataire retenu sans reconstruire l’expérience.",
        42,
        84,
        8.2,
        INK,
        "AJRegular",
        12,
    )
    footer(c, 6)
    c.showPage()


def backlog_row(c, y, code, task, proof, status, owner, color):
    c.setFillColor(WHITE)
    c.rect(42, y - 33, W - 84, 42, fill=1, stroke=0)
    label(c, code, 55, y - 7, PURPLE, 6.2)
    wrapped(c, task, 118, y - 4, 350, 8.1, INK, 10.5, "AJBold", 2)
    wrapped(c, proof, 485, y - 4, 145, 7.2, MID, 9.5, "AJRegular", 2)
    status_pill(c, status, 650, y - 1, color)
    text(c, owner, 815, y - 6, 7.2, MID)


def draw_backlog_done(c):
    background(c)
    label(c, "06 - REGISTRE DE LIVRAISON", 42, H - 42)
    text(c, "Backlog - travaux terminés dans le prototype.", 42, H - 80, 25)
    label(c, "ID", 55, 410)
    label(c, "TÂCHE / LIVRABLE", 118, 410)
    label(c, "PREUVE", 485, 410)
    label(c, "STATUT", 650, 410)
    label(c, "OWNER", 815, 410)
    rows = [
        ("AJ-001", "Consolider besoin, charte, catalogue et référence", "PROJECT-BASELINE.md", "Terminé", "Adam CHABBI"),
        ("AJ-003", "Inventorier et préparer logo, photos et contenus", "public/images/client", "Terminé", "Adam CHABBI"),
        ("AJ-004", "Recomposer l’accueil et supprimer les vides artificiels", "Route / + captures", "Terminé", "Adam CHABBI"),
        ("AJ-006", "Déployer la direction métal liquide", "MetallicField", "Terminé", "Adam CHABBI"),
        ("AJ-007", "Garantir la parité visuelle entre Jérémy et Alex", "MODEL-PARITY.md", "Terminé", "Adam CHABBI"),
        ("AJ-010", "Structurer Apollon, trois coloris et S à XL", "lib/products.ts", "Terminé", "Adam CHABBI"),
        ("AJ-012", "Simuler panier, checkout et compte", "3 routes testées", "Terminé", "Adam CHABBI"),
        ("AJ-014", "Valider build et tests automatisés", "16 tests sur 16", "Terminé", "Adam CHABBI"),
    ]
    y = 382
    for row in rows:
        backlog_row(c, y, *row, GREEN)
        y -= 45
    label(c, "PIÈCE JOINTE - REGISTRE COMPLET", 42, 35, PURPLE, 6.2)
    text(c, "docs/PROJECT-BACKLOG.md contient les 28 tickets, critères d’acceptation, preuves et dépendances.", 235, 34, 8, MID)
    footer(c, 7)
    c.showPage()


def draw_next(c):
    background(c, BLACK)
    label(c, "07 - PROCHAINE SÉQUENCE ET OWNERSHIP", 42, H - 42, SILVER)
    text(c, "Priorités de la prochaine séquence.", 42, H - 82, 28, WHITE)
    text(c, "8 priorités ci-dessous. Les 13 tickets ouverts figurent dans le registre exhaustif joint.", 42, H - 118, 8.5, SILVER)

    remaining = [
        ("AJ-101", "Valider direction visuelle et cadrages", "AJ Luxury"),
        ("AJ-102", "Confirmer prix et politique promotionnelle", "AJ Luxury"),
        ("AJ-104", "Produire les retouches photo HD finales", "Adam + Isabelle"),
        ("AJ-105", "Produire le master vidéo d’accueil", "Adam + Isabelle"),
        ("AJ-106", "Acheter domaine au nom d’AJ Luxury", "AJ Luxury"),
        ("AJ-108", "Choisir et connecter le paiement", "AJ Luxury + Adam"),
        ("AJ-103 / 109", "Confirmer stock vendable, livraison et retours", "AJ Luxury"),
        ("AJ-112 / 113", "Recetter, déployer et documenter", "Adam + AJ Luxury"),
    ]
    for i, (code, task, owner) in enumerate(remaining):
        col = i // 4
        row = i % 4
        x = 42 + col * 450
        y = 298 - row * 55
        label(c, code, x, y + 16, SILVER, 6.2)
        wrapped(c, task, x + 68, y + 16, 260, 8.7, WHITE, 12, "AJBold", 2)
        text(c, owner, x + 335, y + 15, 7.5, SILVER)

    rule(c, 42, 91, W - 42, HexColor("#3B3C40"))
    label(c, "RESPONSABLE DE LA LIVRAISON", 42, 70, SILVER, 6.2)
    text(c, "Adam CHABBI", 42, 49, 11, WHITE, "AJBold")
    text(c, "Pilotage, UX/UI, réalisation, tests et documentation.", 42, 34, 6.8, SILVER)
    label(c, "CLIENT ET DÉCISION MÉTIER", 350, 70, SILVER, 6.2)
    text(c, "AJ Luxury - Jérémy & Alex", 350, 49, 10.5, WHITE, "AJBold")
    text(c, "Validation, prix, stock, domaine, paiement, logistique et légal.", 350, 34, 6.8, SILVER)
    label(c, "CONTRIBUTION PRÉVUE", 680, 70, SILVER, 6.2)
    text(c, "Isabelle", 680, 49, 10.5, WHITE, "AJBold")
    text(c, "Retouche IA et production visuelle, après validation et chiffrage.", 680, 34, 6.8, SILVER)
    footer(c, 8, True)
    c.showPage()


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    TMP.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT), pagesize=PAGE, pageCompression=1)
    c.setTitle("AJ Luxury - Delivery Review - 24 July 2026")
    c.setAuthor("Adam CHABBI")
    c.setSubject("Cadrage, réalisation, contrôle qualité et backlog de livraison")
    draw_cover(c)
    draw_need(c)
    draw_work(c)
    draw_before_after(c)
    draw_ux(c)
    draw_architecture(c)
    draw_backlog_done(c)
    draw_next(c)
    c.save()
    print(OUT)


if __name__ == "__main__":
    main()
