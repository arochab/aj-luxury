from __future__ import annotations

from pathlib import Path

from PIL import Image
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
DELIVERABLE_DIR = ROOT / "deliverables" / "customer-journey-demo"
ASSET_DIR = DELIVERABLE_DIR / "guide-assets"
OUTPUT = DELIVERABLE_DIR / "GUIDE-VISUEL-LOT2-AJ-LUXURY.pdf"

PAGE_W, PAGE_H = landscape(A4)

INK = colors.HexColor("#111114")
PAPER = colors.HexColor("#F5F4F0")
WHITE = colors.white
MUTED = colors.HexColor("#626269")
LINE = colors.HexColor("#D8D6D1")
GREEN = colors.HexColor("#2D7B55")
LILAC = colors.HexColor("#8A78B8")
AMBER = colors.HexColor("#B0782A")
SOFT_GREEN = colors.HexColor("#E8F2EC")
SOFT_LILAC = colors.HexColor("#EEEAF6")
SOFT_AMBER = colors.HexColor("#F5EEDF")


def register_fonts() -> tuple[str, str]:
    regular = Path(r"C:\Windows\Fonts\arial.ttf")
    bold = Path(r"C:\Windows\Fonts\arialbd.ttf")
    if regular.exists() and bold.exists():
        pdfmetrics.registerFont(TTFont("AJRegular", str(regular)))
        pdfmetrics.registerFont(TTFont("AJBold", str(bold)))
        return "AJRegular", "AJBold"
    return "Helvetica", "Helvetica-Bold"


FONT, FONT_BOLD = register_fonts()


def style(size: float, leading: float | None = None, color=INK, bold: bool = False) -> ParagraphStyle:
    return ParagraphStyle(
        name=f"s-{size}-{leading}-{bold}",
        fontName=FONT_BOLD if bold else FONT,
        fontSize=size,
        leading=leading or size * 1.25,
        textColor=color,
        alignment=TA_LEFT,
        spaceAfter=0,
        spaceBefore=0,
    )


def para(c: canvas.Canvas, html: str, x: float, y_top: float, width: float, text_style: ParagraphStyle) -> float:
    p = Paragraph(html, text_style)
    _, height = p.wrap(width, PAGE_H)
    p.drawOn(c, x, y_top - height)
    return height


def header(c: canvas.Canvas, page_no: int, kicker: str) -> None:
    c.setFillColor(INK)
    c.rect(0, PAGE_H - 44, PAGE_W, 44, stroke=0, fill=1)
    c.setFillColor(WHITE)
    c.setFont(FONT_BOLD, 12)
    c.drawString(34, PAGE_H - 28, "AJ LUXURY")
    c.setFont(FONT, 8)
    c.drawRightString(PAGE_W - 34, PAGE_H - 27, kicker.upper())
    c.setFillColor(MUTED)
    c.setFont(FONT, 7)
    c.drawRightString(PAGE_W - 34, 16, f"GUIDE VISUEL LOT 2  |  11.08.2026  |  {page_no}/4")


def title(c: canvas.Canvas, text: str, subtitle: str | None = None) -> None:
    para(c, text, 34, PAGE_H - 72, PAGE_W - 68, style(25, 29, INK, True))
    if subtitle:
        para(c, subtitle, 34, PAGE_H - 108, PAGE_W - 68, style(9.3, 12, MUTED))


def image_contain(c: canvas.Canvas, path: Path, x: float, y: float, w: float, h: float, bg=WHITE) -> None:
    c.setFillColor(bg)
    c.roundRect(x, y, w, h, 7, stroke=0, fill=1)
    with Image.open(path) as im:
        iw, ih = im.size
    ratio = min(w / iw, h / ih)
    dw, dh = iw * ratio, ih * ratio
    dx, dy = x + (w - dw) / 2, y + (h - dh) / 2
    c.drawImage(ImageReader(str(path)), dx, dy, width=dw, height=dh, preserveAspectRatio=True, mask="auto")
    c.setStrokeColor(LINE)
    c.setLineWidth(0.6)
    c.roundRect(x, y, w, h, 7, stroke=1, fill=0)


def status_card(
    c: canvas.Canvas,
    x: float,
    y: float,
    w: float,
    h: float,
    number: str,
    heading: str,
    body: str,
    dot_color,
    bg_color,
) -> None:
    c.setFillColor(bg_color)
    c.roundRect(x, y, w, h, 10, stroke=0, fill=1)
    c.setFillColor(dot_color)
    c.circle(x + 22, y + h - 24, 5, stroke=0, fill=1)
    para(c, number.upper(), x + 34, y + h - 17, w - 52, style(7.2, 9, MUTED, True))
    para(c, heading, x + 18, y + h - 48, w - 36, style(13.2, 16, INK, True))
    para(c, body, x + 18, y + h - 85, w - 36, style(8.5, 11.4, INK))


def page_one(c: canvas.Canvas) -> None:
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    header(c, 1, "Vue dirigeant")
    title(
        c,
        "Où est-on exactement ?",
        "Une lecture sans jargon : production, démonstration et backend réel sont trois états distincts.",
    )

    card_w = (PAGE_W - 68 - 24) / 3
    card_y, card_h = 250, 205
    status_card(
        c,
        34,
        card_y,
        card_w,
        card_h,
        "1. Production",
        "Frontend validé",
        "ajluxurystore.com contient le front validé et la vidéo d'accueil approuvée.<br/><br/><b>Aucun backend transactionnel n'y est actif.</b>",
        GREEN,
        SOFT_GREEN,
    )
    status_card(
        c,
        34 + card_w + 12,
        card_y,
        card_w,
        card_h,
        "2. Démo locale",
        "Parcours simulé et testé",
        "Checkout France/Canada, confirmation, compte fictif, suivi DHL, retour et remboursement.<br/><br/><b>Données fixes, sans service externe.</b>",
        LILAC,
        SOFT_LILAC,
    )
    status_card(
        c,
        34 + (card_w + 12) * 2,
        card_y,
        card_w,
        card_h,
        "3. Backend réel",
        "Chantier séparé en cours",
        "Une fondation SQL Cloudflare D1 et ses migrations sont développées séparément.<br/><br/><b>Rien n'est encore connecté ni déployé.</b>",
        AMBER,
        SOFT_AMBER,
    )

    c.setFillColor(INK)
    c.roundRect(34, 145, PAGE_W - 68, 75, 8, stroke=0, fill=1)
    para(c, "SUPABASE", 52, 199, 95, style(7.5, 9, colors.HexColor("#B9AFD1"), True))
    para(c, "Supabase n'a pas été utilisé.", 150, 201, 280, style(16, 19, WHITE, True))
    para(
        c,
        "La démo n'utilise ni base de données, ni paiement, ni transporteur, ni e-mail réels.",
        150,
        177,
        PAGE_W - 215,
        style(8.8, 11, colors.HexColor("#D6D4D0")),
    )

    c.setFillColor(WHITE)
    c.roundRect(34, 56, PAGE_W - 68, 64, 8, stroke=0, fill=1)
    para(c, "VERDICT", 52, 101, 70, style(7.5, 9, MUTED, True))
    para(
        c,
        "Le design est live. Le parcours e-commerce est visible et éprouvé en local. L'e-commerce réel n'est pas encore live.",
        132,
        103,
        PAGE_W - 184,
        style(11.3, 15, INK, True),
    )


def page_two(c: canvas.Canvas) -> None:
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    header(c, 2, "Parcours visible")
    title(c, "1. Du front validé au checkout", "À gauche : l'accueil validé. À droite : le scénario Canada de la démo locale.")

    image_contain(c, ASSET_DIR / "00-production-accueil.png", 34, 65, 215, 400, bg=INK)
    image_contain(c, ASSET_DIR / "02-checkout-canada.jpg", 270, 175, PAGE_W - 304, 290, bg=WHITE)

    c.setFillColor(WHITE)
    c.roundRect(270, 65, PAGE_W - 304, 88, 8, stroke=0, fill=1)
    para(c, "CE QUE LA DÉMO PROUVE", 288, 135, 160, style(7.4, 9, LILAC, True))
    para(
        c,
        "Le client peut choisir le Canada, voir une adresse fictive, un DHL marqué <b>SIMULATION</b>, 18,90 € de livraison, 48,89 € au total et la règle douanière DAP.",
        288,
        116,
        PAGE_W - 340,
        style(9.3, 12.5, INK),
    )
    para(
        c,
        "Cible de lancement : UE, Royaume-Uni, États-Unis et Canada. Démo visible : France et Canada uniquement.",
        288,
        80,
        PAGE_W - 340,
        style(7.8, 10, MUTED),
    )


def page_three(c: canvas.Canvas) -> None:
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    header(c, 3, "Compte et suivi")
    title(c, "2. Une continuité complète et cohérente", "Le même client, la même commande et le même total suivent tout le parcours.")

    gap = 14
    shot_w = (PAGE_W - 68 - gap) / 2
    image_contain(c, ASSET_DIR / "04-compte-canada.jpg", 34, 200, shot_w, 265)
    image_contain(c, ASSET_DIR / "05-suivi-dhl-simule.jpg", 34 + shot_w + gap, 200, shot_w, 265)

    c.setFillColor(WHITE)
    c.roundRect(34, 65, PAGE_W - 68, 108, 8, stroke=0, fill=1)
    para(c, "PARCOURS SYNTHÉTIQUE", 52, 151, 160, style(7.4, 9, LILAC, True))
    para(
        c,
        "Alex Martin  ->  commande AJ-DEMO-1042  ->  Canada  ->  total 48,89 €  ->  suivi DEMO-DHL-1042",
        52,
        129,
        PAGE_W - 104,
        style(12, 15, INK, True),
    )
    para(
        c,
        "Aucun compte, paiement, colis ou suivi réel n'est créé. Le logo DHL désigne uniquement un transporteur hypothétique pour la démonstration.",
        52,
        96,
        PAGE_W - 104,
        style(8.8, 11.5, MUTED),
    )


def matrix_card(c: canvas.Canvas, x: float, y: float, w: float, h: float, heading: str, body: str, color) -> None:
    c.setFillColor(WHITE)
    c.roundRect(x, y, w, h, 8, stroke=0, fill=1)
    c.setFillColor(color)
    c.rect(x, y + h - 5, w, 5, stroke=0, fill=1)
    para(c, heading, x + 14, y + h - 22, w - 28, style(9.4, 12, INK, True))
    para(c, body, x + 14, y + h - 49, w - 28, style(7.7, 10.1, INK))


def page_four(c: canvas.Canvas) -> None:
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    header(c, 4, "Réel, simulé, restant")
    title(c, "3. Ce qui est fait, et ce qui manque encore", "Le remboursement et le mobile sont testés, mais restent volontairement sans effet réel.")

    gap = 14
    shot_w = (PAGE_W - 68 - gap) / 2
    image_contain(c, ASSET_DIR / "08-remboursement.jpg", 34, 300, shot_w, 165)
    image_contain(c, ASSET_DIR / "11-mobile-duo.jpg", 34 + shot_w + gap, 300, shot_w, 165, bg=INK)

    card_gap = 10
    card_w = (PAGE_W - 68 - 2 * card_gap) / 3
    matrix_card(
        c,
        34,
        108,
        card_w,
        166,
        "DÉJÀ RÉEL",
        "- Front et vidéo d'accueil en production<br/>- Code de démo et tests automatisés<br/>- Contrôle indépendant : 9,7/10 sur la démo",
        GREEN,
    )
    matrix_card(
        c,
        34 + card_w + card_gap,
        108,
        card_w,
        166,
        "VOLONTAIREMENT SIMULÉ",
        "- Alex Martin et carte 4242<br/>- Commande, stock et tarifs<br/>- DHL, e-mails, retour et remboursement",
        LILAC,
    )
    matrix_card(
        c,
        34 + (card_w + card_gap) * 2,
        108,
        card_w,
        166,
        "À BRANCHER AVANT LE LIVE",
        "- Données produit, stock et colis réels<br/>- Comptes paiement, livraison et e-mail<br/>- Légal/fiscal, D1, sandbox, préproduction et validations",
        AMBER,
    )

    c.setFillColor(INK)
    c.roundRect(34, 39, PAGE_W - 68, 46, 7, stroke=0, fill=1)
    para(c, "PROCHAINE PORTE", 50, 70, 100, style(7.1, 9, colors.HexColor("#B9AFD1"), True))
    para(
        c,
        "Durcir le backend -> renseigner les données et comptes -> tester sandbox/préproduction -> validation Adam + Jérémy -> production.",
        152,
        72,
        PAGE_W - 202,
        style(8.6, 11, WHITE, True),
    )


def build() -> None:
    required = [
        ASSET_DIR / "00-production-accueil.png",
        ASSET_DIR / "02-checkout-canada.jpg",
        ASSET_DIR / "04-compte-canada.jpg",
        ASSET_DIR / "05-suivi-dhl-simule.jpg",
        ASSET_DIR / "08-remboursement.jpg",
        ASSET_DIR / "11-mobile-duo.jpg",
    ]
    missing = [str(path) for path in required if not path.exists()]
    if missing:
        raise FileNotFoundError("Missing guide assets: " + ", ".join(missing))

    DELIVERABLE_DIR.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(OUTPUT), pagesize=(PAGE_W, PAGE_H), pageCompression=1)
    pdf.setTitle("AJ Luxury - Guide visuel Lot 2")
    pdf.setAuthor("Adam CHABBI")
    pdf.setSubject("État du front, de la démo locale et du backend e-commerce")

    for render_page in (page_one, page_two, page_three, page_four):
        render_page(pdf)
        pdf.showPage()

    pdf.save()
    print(OUTPUT)


if __name__ == "__main__":
    build()
