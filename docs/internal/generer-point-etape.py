# -*- coding: utf-8 -*-
"""Point d'étape AJ Luxury pour Jérémy. Blocs courts, phrases simples, aucune ambiguïté."""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas

W, H = A4
ENCRE   = HexColor("#121215")
GRIS    = HexColor("#5F5F67")
GRIS_CL = HexColor("#9C9CA4")
FILET   = HexColor("#E4E4E8")
CREME   = HexColor("#F7F6F3")
SABLE   = HexColor("#FAF5EC")
VERT    = HexColor("#4E7A5E")
AMBRE   = HexColor("#A8834F")
BLEU    = HexColor("#4E6480")

MG = 20 * mm
MD = W - 18 * mm
LARG = MD - MG

SORTIE = r"D:\Adam CHABBI Pro\business-clients\CLIENTS\aj-luxury\docs\AJ-LUXURY-POINT-ETAPE-2026-08-18.pdf"


def titre_bloc(c, y, numero, texte, couleur):
    """Un bandeau de section : pastille numérotée + titre."""
    c.setFillColor(couleur)
    c.circle(MG + 3.4 * mm, y + 1.2 * mm, 3.4 * mm, stroke=0, fill=1)
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(HexColor("#FFFFFF"))
    c.drawCentredString(MG + 3.4 * mm, y - 0.1 * mm, numero)
    c.setFont("Helvetica-Bold", 12.6)
    c.setFillColor(ENCRE)
    c.drawString(MG + 10.5 * mm, y, texte)
    return y - 9.5 * mm


def ligne(c, y, texte, gras=None, indent=10.5 * mm, puce=True, couleur_puce=GRIS_CL):
    """Une ligne de liste : un tiret, une phrase courte."""
    x = MG + indent
    if puce:
        c.setStrokeColor(couleur_puce)
        c.setLineWidth(1)
        c.line(x - 5 * mm, y + 1.3 * mm, x - 2.6 * mm, y + 1.3 * mm)
    larg = MD - x
    if gras:
        c.setFont("Helvetica-Bold", 10)
        c.setFillColor(ENCRE)
        c.drawString(x, y, gras)
        dec = c.stringWidth(gras + " ", "Helvetica-Bold", 10)
        c.setFont("Helvetica", 10)
        c.setFillColor(GRIS)
        mots, courant, premier = texte.split(), "", True
        yy = y
        dispo = larg - dec
        for mot in mots:
            essai = (courant + " " + mot).strip()
            if c.stringWidth(essai, "Helvetica", 10) <= dispo:
                courant = essai
            else:
                c.drawString(x + (dec if premier else 0), yy, courant)
                yy -= 13.8
                premier, dispo, courant = False, larg, mot
        if courant:
            c.drawString(x + (dec if premier else 0), yy, courant)
            yy -= 13.8
        return yy - 1.5
    c.setFont("Helvetica", 10)
    c.setFillColor(GRIS)
    courant, yy = "", y
    for mot in texte.split():
        essai = (courant + " " + mot).strip()
        if c.stringWidth(essai, "Helvetica", 10) <= larg:
            courant = essai
        else:
            c.drawString(x, yy, courant)
            yy -= 13.8
            courant = mot
    if courant:
        c.drawString(x, yy, courant)
        yy -= 13.8
    return yy - 1.5


def pied(c, page):
    c.setStrokeColor(FILET)
    c.setLineWidth(0.5)
    c.line(MG, 14 * mm, MD, 14 * mm)
    c.setFont("Helvetica", 7.2)
    c.setFillColor(GRIS_CL)
    c.drawString(MG, 9.8 * mm, "AJ LUXURY  ·  POINT D'ÉTAPE  ·  18 AOÛT 2026")
    c.drawRightString(MD, 9.8 * mm, "Page %d sur 2" % page)


c = canvas.Canvas(SORTIE, pagesize=A4)
c.setTitle("AJ Luxury — Point d'étape — 18 août 2026")
c.setAuthor("Adam Chabbi")

# ══════════════════════════ PAGE 1 ══════════════════════════
y = H - 22 * mm

c.setFont("Helvetica", 7.8)
c.setFillColor(GRIS_CL)
c.drawString(MG, y, "P O I N T   D ' É T A P E")
c.drawRightString(MD, y, "18 août 2026")
y -= 12 * mm

c.setFont("Helvetica", 28)
c.setFillColor(ENCRE)
c.drawString(MG, y, "AJ Luxury")
y -= 7.6 * mm
c.setFont("Helvetica", 13)
c.setFillColor(GRIS)
c.drawString(MG, y, "Le site est terminé. Il reste à le connecter pour pouvoir vendre.")
y -= 10 * mm

# Le lien
c.setFillColor(ENCRE)
c.rect(MG, y - 17 * mm, LARG, 17 * mm, stroke=0, fill=1)
c.setFont("Helvetica", 7.6)
c.setFillColor(HexColor("#93939C"))
c.drawString(MG + 6 * mm, y - 6.5 * mm, "V O I R   L E   S I T E")
c.setFont("Helvetica-Bold", 9.6)
c.setFillColor(HexColor("#FFFFFF"))
c.drawString(MG + 6 * mm, y - 12.4 * mm,
             "aj-luxury-awwwards-branch-preview.adam-chabbi94.workers.dev")
y -= 25 * mm

# ── Bloc 1
y = titre_bloc(c, y, "1", "Ce qui fonctionne déjà", VERT)
for gras, texte in [
    ("Les 15 pages du site.",
     "Accueil, boutique, fiches produit, panier, commande, compte client, notre histoire, "
     "contact et pages légales."),
    ("Les trois coloris.",
     "Rose Velours, Lilas Céleste et Pourpre Impérial, au prix de 29,99 €, en tailles S à XL."),
    ("Le choix de la taille.",
     "Le client voit si sa taille est disponible avant de cliquer."),
    ("L'animation d'accueil.",
     "Le boxer seul et le boxer porté sont montrés côte à côte sur le même décor. En faisant "
     "défiler la page, l'un se transforme en l'autre."),
    ("Ordinateur, tablette et téléphone.",
     "Le site s'adapte aux trois. Il est aussi lisible par les logiciels pour malvoyants."),
    ("Cinq langues.",
     "Français, anglais, allemand, espagnol et italien."),
]:
    y = ligne(c, y, texte, gras=gras, couleur_puce=VERT)

y -= 4 * mm

# ── Bloc 2
y = titre_bloc(c, y, "2", "Ce que nous faisons en ce moment", BLEU)
for gras, texte in [
    ("Trois retouches visuelles.",
     "Un espace vide en haut de l'accueil, des photos où les visages sont coupés, et un ensemble "
     "un peu trop sombre. Les trois sont en cours de correction."),
    ("L'identité de la marque.",
     "La lyre, l'arc et le laurier n'existent aujourd'hui que dans les photos. Nous allons les "
     "intégrer au dessin du site lui-même."),
    ("Le contrôle qualité.",
     "Chaque nouvelle version est relue et notée avant d'être mise en ligne."),
]:
    y = ligne(c, y, texte, gras=gras, couleur_puce=BLEU)

y -= 5 * mm

# ── Bloc 3
y = titre_bloc(c, y, "3", "Ce qu'il nous reste à faire", AMBRE)
for gras, texte in [
    ("Brancher le paiement.", "Pour que les clients puissent payer par carte."),
    ("Brancher la livraison et les retours.", "Pour créer les étiquettes et suivre les colis."),
    ("Brancher les e-mails automatiques.",
     "Confirmation de commande, avis d'expédition, confirmation de retour."),
    ("Installer le site sur votre adresse définitive.", "À la place de l'adresse de test ci-dessus."),
    ("Tester une vraie commande, du début à la fin.", "Avant d'ouvrir la boutique au public."),
]:
    y = ligne(c, y, texte, gras=gras, couleur_puce=AMBRE)

y -= 4 * mm

pied(c, 1)
c.showPage()

# ══════════════════════════ PAGE 2 ══════════════════════════
y = H - 26 * mm

# ── Bloc 4 : les questions
y = titre_bloc(c, y, "4", "Ce dont nous avons besoin de vous", ENCRE)
y = ligne(c, y, "Cinq réponses. Ce sont elles qui déclenchent tout le reste.", puce=False)
y -= 2 * mm

for num, gras, texte in [
    ("1", "Le site vous convient-il ?",
     "Votre accord et celui d'Alex, par écrit, sur ce que vous voyez en ligne."),
    ("2", "Combien d'unités mettons-nous en vente ?",
     "Vous avez 756 unités. Dites-nous combien vous gardez de côté pour les cadeaux, les "
     "influenceurs et la sécurité. Nous mettrons le reste en vente."),
    ("3", "Quel prestataire de paiement choisissez-vous ?",
     "Nous pouvons vous conseiller, mais le compte doit être ouvert à votre nom."),
    ("4", "Quelle est la composition exacte du boxer et son pays de fabrication ?",
     "C'est obligatoire pour expédier hors de l'Union européenne."),
    ("5", "Confirmez-vous l'identité de la société et les conditions de vente ?",
     "Les pages légales sont écrites. Il ne manque que votre validation."),
]:
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(AMBRE)
    c.drawString(MG + 10.5 * mm, y, num + ".")
    y = ligne(c, y, texte, gras=gras, indent=16 * mm, puce=False)

y -= 3 * mm

# ── Encadré
c.setFillColor(SABLE)
c.rect(MG, y - 22 * mm, LARG, 22 * mm, stroke=0, fill=1)
c.setFillColor(AMBRE)
c.rect(MG, y - 22 * mm, 2.6, 22 * mm, stroke=0, fill=1)
c.setFont("Helvetica-Bold", 11)
c.setFillColor(ENCRE)
c.drawString(MG + 7 * mm, y - 7.5 * mm, "Aujourd'hui, personne ne peut acheter sur le site.")
c.setFont("Helvetica", 9.6)
c.setFillColor(GRIS)
c.drawString(MG + 7 * mm, y - 13.5 * mm,
             "C'est voulu. Tant que le paiement et la livraison ne sont pas branchés, nous pouvons")
c.drawString(MG + 7 * mm, y - 18.5 * mm,
             "tout tester sans qu'aucune commande réelle ne parte.")
y -= 30 * mm

# ── Bloc 5
y = titre_bloc(c, y, "5", "Ce qui se passe ensuite", VERT)
y = ligne(c, y, "Dès que nous avons vos réponses, nous branchons le paiement et la livraison. "
                "Nous testons une commande réelle du début à la fin. Puis nous ouvrons la boutique.",
          puce=False)

y -= 6 * mm
c.setStrokeColor(FILET)
c.setLineWidth(0.5)
c.line(MG, y, MD, y)
y -= 7.5 * mm
c.setFont("Helvetica-Oblique", 9.4)
c.setFillColor(GRIS)
c.drawString(MG, y, "Adam Chabbi  ·  conception, réalisation et coordination")

pied(c, 2)
c.save()
print("PDF ecrit :", SORTIE)
