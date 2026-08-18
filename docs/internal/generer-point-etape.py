# -*- coding: utf-8 -*-
"""Point d'étape AJ Luxury pour Jérémy — fait / en cours / à faire. Deux pages."""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas

W, H = A4
ENCRE   = HexColor("#131316")
GRIS    = HexColor("#6E6E75")
GRIS_CL = HexColor("#A5A5AC")
FILET   = HexColor("#E2E2E6")
CREME   = HexColor("#F7F6F4")
VERT    = HexColor("#5C7F6B")
AMBRE   = HexColor("#B08D5E")
LILAS   = HexColor("#8286A8")

MG = 21 * mm
MD = W - 19 * mm
LARG = MD - MG

SORTIE = r"D:\Adam CHABBI Pro\business-clients\CLIENTS\aj-luxury\docs\AJ-LUXURY-POINT-ETAPE-2026-08-18.pdf"


def label(c, x, y, texte, couleur=GRIS_CL, taille=7.2):
    c.setFont("Helvetica-Bold", taille)
    c.setFillColor(couleur)
    c.drawString(x, y, " ".join(texte.upper()))


def para(c, x, y, texte, larg, taille=10, interligne=14.6,
         police="Helvetica", couleur=ENCRE):
    c.setFont(police, taille)
    c.setFillColor(couleur)
    ligne = ""
    for mot in texte.split():
        essai = (ligne + " " + mot).strip()
        if c.stringWidth(essai, police, taille) <= larg:
            ligne = essai
        else:
            c.drawString(x, y, ligne)
            y -= interligne
            ligne = mot
    if ligne:
        c.drawString(x, y, ligne)
        y -= interligne
    return y


def item(c, x, y, titre, texte, couleur, marque="disque"):
    larg = LARG - 8 * mm
    c.setFillColor(couleur)
    if marque == "disque":
        c.circle(x + 1.7, y + 3.3, 1.7, stroke=0, fill=1)
    else:
        c.setStrokeColor(couleur)
        c.setLineWidth(1.2)
        c.circle(x + 1.7, y + 3.3, 1.7, stroke=1, fill=0)
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(ENCRE)
    c.drawString(x + 6.6 * mm, y, titre)
    y -= 14
    y = para(c, x + 6.6 * mm, y, texte, larg, taille=9.4, interligne=13.4, couleur=GRIS)
    return y - 6


def pied(c, page):
    c.setStrokeColor(FILET)
    c.setLineWidth(0.5)
    c.line(MG, 15 * mm, MD, 15 * mm)
    c.setFont("Helvetica", 7.2)
    c.setFillColor(GRIS_CL)
    c.drawString(MG, 10.6 * mm, "AJ LUXURY  ·  POINT D'ÉTAPE  ·  18 AOÛT 2026")
    c.drawRightString(MD, 10.6 * mm, "%d / 2" % page)


c = canvas.Canvas(SORTIE, pagesize=A4)
c.setTitle("AJ Luxury — Point d'étape — 18 août 2026")
c.setAuthor("Adam Chabbi")
c.setSubject("Ce qui est fait, ce qui est en cours, ce qui reste à faire")

# ═══════════════════════════ PAGE 1 ═══════════════════════════
y = H - 24 * mm

c.setFont("Helvetica", 7.8)
c.setFillColor(GRIS_CL)
c.drawString(MG, y, " ".join("POINT D'ÉTAPE"))
c.drawRightString(MD, y, "18 août 2026")
y -= 13 * mm

c.setFont("Helvetica", 30)
c.setFillColor(ENCRE)
c.drawString(MG, y, "AJ Luxury")
y -= 8.4 * mm
c.setFont("Helvetica", 14.2)
c.setFillColor(GRIS)
c.drawString(MG, y, "Le site est en ligne, et il se visite dès maintenant.")
y -= 6.8 * mm
c.setStrokeColor(ENCRE)
c.setLineWidth(1.1)
c.line(MG, y, MG + 24 * mm, y)
y -= 11 * mm

# Bandeau de chiffres
c.setFillColor(CREME)
c.rect(MG, y - 17 * mm, LARG, 17 * mm, stroke=0, fill=1)
cols = [("15", "pages"), ("3", "coloris"), ("5", "langues"),
        ("51", "séries de tests"), ("99", "versions livrées")]
pas = LARG / len(cols)
for i, (chiffre, mot) in enumerate(cols):
    cx = MG + i * pas + pas / 2
    c.setFont("Helvetica-Bold", 16)
    c.setFillColor(ENCRE)
    c.drawCentredString(cx, y - 8 * mm, chiffre)
    c.setFont("Helvetica", 7.4)
    c.setFillColor(GRIS)
    c.drawCentredString(cx, y - 13 * mm, mot)
y -= 24 * mm

# Lien
c.setFillColor(ENCRE)
c.rect(MG, y - 18 * mm, LARG, 18 * mm, stroke=0, fill=1)
c.setFont("Helvetica-Bold", 7.2)
c.setFillColor(HexColor("#8A8A93"))
c.drawString(MG + 6 * mm, y - 6.8 * mm, " ".join("À VISITER"))
c.setFont("Helvetica-Bold", 9.8)
c.setFillColor(HexColor("#FFFFFF"))
c.drawString(MG + 6 * mm, y - 12.8 * mm,
             "aj-luxury-awwwards-branch-preview.adam-chabbi94.workers.dev")
y -= 26 * mm

label(c, MG, y, "ce qui est fait", VERT)
y -= 8.4 * mm

for titre, texte in [
    ("L'expérience Apollon",
     "Le boxer seul et le boxer porté apparaissent côte à côte, sur le même décor de marbre. "
     "En faisant défiler la page, l'un devient l'autre, coloris après coloris. C'est le geste "
     "signature du site — celui qu'on ne trouve nulle part ailleurs."),
    ("La boutique et les trois fiches produit",
     "Rose Velours, Lilas Céleste et Pourpre Impérial. Prix de 29,99 €, tailles S à XL, et la "
     "disponibilité de chaque taille affichée avant même de cliquer."),
    ("Le parcours d'achat, de bout en bout",
     "Panier, commande, confirmation, compte client. Le chemin complet existe et se teste."),
    ("Le reste du site",
     "L'histoire de la marque, le contact, et toutes les pages légales : conditions de vente, "
     "confidentialité, cookies, livraison et retours, rétractation."),
    ("Le soin du détail",
     "Tout fonctionne sur ordinateur, tablette et téléphone. Le site est lisible au clavier et "
     "pour les lecteurs d'écran, et il respecte les personnes sensibles aux animations."),
]:
    y = item(c, MG, y, titre, texte, VERT)

y -= 3 * mm
label(c, MG, y, "ce qui est en cours", LILAS)
y -= 8.4 * mm

for titre, texte in [
    ("Faire vivre l'univers Apollon dans le design",
     "La lyre, l'arc et le laurier vivent aujourd'hui dans les photos. Ils vont devenir un "
     "vocabulaire graphique à part entière — filets, transitions, motifs — pour que le site "
     "porte la marque même sans les images."),
    ("La revue qualité, à chaque version",
     "Chaque livraison passe une revue exigeante : direction artistique, navigation, lisibilité, "
     "parcours d'achat, performance. La version actuelle est notée 8,5 sur 10 en interne."),
]:
    y = item(c, MG, y, titre, texte, LILAS, marque="cercle")

pied(c, 1)
c.showPage()

# ═══════════════════════════ PAGE 2 ═══════════════════════════
y = H - 26 * mm

label(c, MG, y, "ce qui reste à faire", AMBRE)
y -= 9.5 * mm

c.setFont("Helvetica-Bold", 8.8)
c.setFillColor(GRIS)
c.drawString(MG, y, "De notre côté")
y -= 7.4 * mm
for titre, texte in [
    ("Brancher le paiement, la livraison et les e-mails",
     "Une fois le prestataire choisi et les tarifs arrêtés, nous connectons et testons chaque cas : "
     "paiement accepté, refusé, remboursé, colis expédié, e-mail de confirmation reçu."),
    ("Mettre en ligne sur votre domaine",
     "Bascule sur l'adresse définitive, surveillance en place, et remise des accès."),
]:
    y = item(c, MG, y, titre, texte, AMBRE, marque="cercle")

y -= 3 * mm
c.setFont("Helvetica-Bold", 8.8)
c.setFillColor(GRIS)
c.drawString(MG, y, "De votre côté")
y -= 7.4 * mm
for titre, texte in [
    ("Valider ce que vous voyez",
     "Votre retour avec Alex sur le site en ligne. C'est ce qui débloque tout le reste."),
    ("Le stock réellement vendable",
     "756 unités enregistrées. Combien réservez-vous aux cadeaux, aux influenceurs et à la "
     "marge de sécurité ? Le site vendra la différence."),
    ("Paiement, livraison et douane",
     "Le prestataire de paiement à choisir ensemble. Pour l'export, il nous faut la composition "
     "exacte du boxer et son pays de fabrication, à faire confirmer par la douane ou le transporteur."),
    ("Les informations légales",
     "Identité de la société et conditions de vente à confirmer, pour figer les pages déjà écrites."),
]:
    y = item(c, MG, y, titre, texte, AMBRE, marque="cercle")

# Encadré vente fermée
y -= 3 * mm
c.setFillColor(HexColor("#FBF7F1"))
c.rect(MG, y - 23 * mm, LARG, 23 * mm, stroke=0, fill=1)
c.setFillColor(AMBRE)
c.rect(MG, y - 23 * mm, 2.4, 23 * mm, stroke=0, fill=1)
c.setFont("Helvetica-Bold", 10.4)
c.setFillColor(ENCRE)
c.drawString(MG + 7 * mm, y - 7.6 * mm, "La vente n'est pas encore ouverte, et c'est voulu.")
para(c, MG + 7 * mm, y - 14 * mm,
     "Aucun paiement réel, aucun transporteur, aucun e-mail automatique n'est connecté. "
     "On teste tout sans qu'aucun client ne puisse commander. La boutique n'ouvrira qu'une fois "
     "les points ci-dessus tranchés.",
     LARG - 14 * mm, taille=9.4, interligne=13, couleur=GRIS)
y -= 31 * mm

label(c, MG, y, "la prochaine étape", VERT)
y -= 9 * mm
y = para(c, MG, y,
         "Votre retour sur le site, avec Alex. Tout le reste en découle : dès qu'il est acquis, "
         "nous branchons le paiement et la livraison, puis nous testons la vente réelle de bout en "
         "bout avant d'ouvrir la boutique au public.",
         LARG, taille=10.4, interligne=15.8)

y -= 7 * mm
c.setStrokeColor(FILET)
c.setLineWidth(0.5)
c.line(MG, y, MD, y)
y -= 8 * mm
c.setFont("Helvetica-Oblique", 9.4)
c.setFillColor(GRIS)
c.drawString(MG, y, "Adam Chabbi  ·  conception, réalisation et coordination")

pied(c, 2)
c.save()
print("PDF ecrit :", SORTIE)
