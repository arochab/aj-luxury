# =============================================================================
# HERO v6 — photographie vivante par compositing local.
# -----------------------------------------------------------------------------
# Sources : les deux images validees par Adam le 21/08, stockees dans
# `_design-reference/hero-v6-sources/`. Elles ne sont ni recadrees dans leur
# contenu ni retouchees : le paysage est mis a l'echelle 1920x1080 (ecart de
# rapport 0,056 %, aucun rognage), le portrait est fenetre 941x1221 -> 720x934
# (rapports 0,7707 vs 0,7709, aucun rognage lateral — la fenetre verticale
# garde tetes, pieds et reflet, elle sacrifie le haut des arches et la traine
# du reflet, jamais un corps).
#
# CE QUI BOUGE, ET RIEN D'AUTRE :
#   . le sol de marbre poli — un champ de deplacement sinusoidal anime les
#     REFLETS comme un metal liquide ; l'amplitude est nulle a la jonction
#     mur/sol et croit vers le premier plan ;
#   . les hautes lumieres du chrome — une bande douce balaie la scene en une
#     periode, plus une respiration de 2 % ;
#   . rien sur les corps : un masque polygonal feather (sigma 25 px) exclut
#     les deux hommes, le tabouret, les socles et la niche de la lyre du
#     deplacement ET du gain de lumiere. Les ombres de contact restent
#     ancrees parce que l'amplitude est nulle au voisinage des contacts.
#
# BOUCLE PARFAITE PAR CONSTRUCTION : toutes les phases temporelles valent
# 2*pi * k * i / N_FRAMES avec k entier. L'image N est l'image 0 : le raccord
# est un pas de temps ordinaire, pas une coupe. C'est la meme classe de
# garantie que le master aller-retour v5, sans doubler la duree.
#
# CONTRAT DE SORTIE (tests/hero-video.test.mjs) :
#   . 4 MP4 H.264 sans audio, moov avant mdat, sous les plafonds V3 ;
#   . posters webp + avif sous plafonds et au-dessus des planchers ;
#   . poster portrait compact 480x623.
#
# Usage :
#   python scripts/build_hero_v6_motion.py masks     # controle visuel des masques
#   python scripts/build_hero_v6_motion.py preview   # 8 images reparties + raccord
#   python scripts/build_hero_v6_motion.py render    # 4 MP4 + posters + preuves
# =============================================================================

from __future__ import annotations

import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

RACINE = Path(__file__).resolve().parents[1]
SOURCES = RACINE / "_design-reference" / "hero-v6-sources"
TRAVAIL = RACINE / "work" / "hero-v6"
VIDEOS = RACINE / "public" / "videos"
IMAGES = RACINE / "public" / "images" / "client"

N_FRAMES = 168  # 7 s a 24 i/s
FPS = 24

# ----------------------------------------------------------------------------
# Geometrie, en coordonnees SOURCE. Relevee sur grilles work/hero-v6/*.grille.
# ----------------------------------------------------------------------------


@dataclass
class Geometrie:
    fichier: str
    taille: tuple[int, int]  # (w, h) source
    horizon: int  # y de la jonction mur/sol : amplitude nulle au-dessus
    corps: list[list[tuple[int, int]]]  # polygones proteges (corps, socles...)
    fenetre: tuple[int, int, int, int] | None  # (x0, y0, w, h) ou None = tout


PAYSAGE = Geometrie(
    fichier="hero-v6-source-landscape-1672x941.png",
    taille=(1672, 941),
    horizon=655,
    corps=[
        # Les deux hommes + tabouret, du sommet des cranes aux contacts au sol.
        [
            (700, 100), (990, 100), (1015, 240), (1020, 430), (1110, 500),
            (1112, 795), (1015, 820), (860, 825), (690, 820), (608, 785),
            (598, 560), (640, 430), (660, 295), (672, 175),
        ],
        # Socle de la statue, gauche.
        [(50, 590), (320, 590), (320, 680), (50, 680)],
        # Socles des colonnes mediane-gauche et mediane-droite.
        [(322, 588), (565, 588), (565, 675), (322, 675)],
        [(1090, 588), (1325, 588), (1325, 675), (1090, 675)],
        # Bases des colonnes des bords.
        [(0, 550), (100, 550), (100, 710), (0, 710)],
        [(1525, 550), (1672, 550), (1672, 710), (1525, 710)],
        # Niche de la lyre (console + or) : rien n'y ondule.
        [(1380, 260), (1560, 260), (1560, 700), (1380, 700)],
    ],
    fenetre=None,
)

PORTRAIT = Geometrie(
    fichier="hero-v6-source-portrait-941x1672.png",
    taille=(941, 1672),
    horizon=905,
    corps=[
        # Les deux hommes + tabouret + jambe tendue jusqu'au pied bas droit.
        [
            (350, 375), (580, 370), (615, 550), (700, 700), (705, 1150),
            (545, 1155), (490, 1085), (300, 1090), (215, 1025), (222, 800),
            (320, 755), (330, 550),
        ],
        # Socle de la statue, gauche.
        [(55, 855), (260, 855), (260, 950), (55, 950)],
        # Bases des colonnes des bords.
        [(0, 870), (85, 870), (85, 1000), (0, 1000)],
        [(790, 870), (941, 870), (941, 985), (790, 985)],
        # Niche de la lyre, droite.
        [(705, 390), (915, 390), (915, 960), (705, 960)],
    ],
    fenetre=(0, 270, 941, 1221),  # -> 720x934, rapport 0,7707 vs 0,7709
)


@dataclass
class Rendu:
    nom: str
    geometrie: Geometrie
    taille: tuple[int, int]  # (w, h) de sortie
    crf: int
    plafond_video: int
    poster_webp_q: int
    plafond_poster: int
    avif: bool = False
    avif_crf: int = 0
    plafond_avif: int = 0
    compact: tuple[int, int] | None = None  # taille du poster compact


RENDUS: list[Rendu] = [
    Rendu("desktop-1920x1080", PAYSAGE, (1920, 1080), 22, 2_923_443, 88, 346_814,
          avif=True, avif_crf=30, plafond_avif=166_742),
    Rendu("xl-native-1920x1080", PAYSAGE, (1920, 1080), 19, 5_095_439, 90, 548_472,
          avif=True, avif_crf=27, plafond_avif=242_352),
    Rendu("tablet-1440x810", PAYSAGE, (1440, 810), 22, 2_281_803, 88, 224_974,
          avif=True, avif_crf=30, plafond_avif=111_961),
    Rendu("portrait-720x934", PORTRAIT, (720, 934), 22, 1_123_698, 90, 103_202,
          compact=(480, 623)),
]

# ----------------------------------------------------------------------------
# Preparation d'un rendu : image de base, rampe d'amplitude, masque protege.
# ----------------------------------------------------------------------------


def microcontraste(img: np.ndarray, quantite: float = 0.14) -> np.ndarray:
    """Meme logique retenue que scripts/upscale_hero_still.py : identite sauve,
    juste un micro-contraste en espace lineaire apres remise a l'echelle."""
    rgb = img.astype(np.float32) / 255.0
    lineaire = np.power(rgb, 2.2)
    doux = cv2.GaussianBlur(lineaire, (0, 0), sigmaX=1.15, sigmaY=1.15)
    restaure = np.clip(lineaire + quantite * (lineaire - doux), 0.0, 1.0)
    return np.round(np.power(restaure, 1.0 / 2.2) * 255.0).astype(np.uint8)


@dataclass
class Scene:
    base: np.ndarray  # image de base a la taille du rendu (BGR uint8)
    amplitude: np.ndarray  # amplitude du deplacement par pixel (float32)
    lumiere: np.ndarray  # masque des hautes lumieres hors corps (float32)
    grille_x: np.ndarray
    grille_y: np.ndarray
    echelle: float  # px de rendu par px vertical de reference 1080


def preparer(rendu: Rendu) -> Scene:
    geo = rendu.geometrie
    src = cv2.imread(str(SOURCES / geo.fichier))
    if src is None:
        raise SystemExit(f"source introuvable : {geo.fichier}")

    if geo.fenetre is not None:
        x0, y0, fw, fh = geo.fenetre
        vue = src[y0 : y0 + fh, x0 : x0 + fw]
        decale = (x0, y0)
    else:
        vue = src
        decale = (0, 0)

    w, h = rendu.taille
    sx = w / vue.shape[1]
    sy = h / vue.shape[0]
    base = microcontraste(
        cv2.resize(vue, (w, h), interpolation=cv2.INTER_LANCZOS4)
    )

    # Masque protege : polygones en coordonnees source -> rendu, feather large.
    protege = np.zeros((h, w), np.float32)
    for poly in geo.corps:
        pts = np.array(
            [
                [
                    int(round((px - decale[0]) * sx)),
                    int(round((py - decale[1]) * sy)),
                ]
                for px, py in poly
            ],
            np.int32,
        )
        cv2.fillPoly(protege, [pts], 1.0)
    # Dilatation AVANT le feather : sans elle, le flou laisse ~50 % de gain
    # sur le contour exact des corps — un liseré qui respire sur le dos de
    # Jeremy, mesure sur la carte de diff f000/f084. Dilate de ~14 px rendus,
    # la protection vaut 1,0 sur le contour et decroit a l'EXTERIEUR seulement.
    rayon = max(3, int(round(14 * sy)))
    noyau = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * rayon + 1, 2 * rayon + 1))
    protege = cv2.dilate(protege, noyau)
    protege = cv2.GaussianBlur(protege, (0, 0), sigmaX=25 * sy, sigmaY=25 * sy)
    protege = np.clip(protege, 0.0, 1.0)

    # Rampe d'amplitude : nulle a l'horizon, pleine en bas de cadre.
    yh = (geo.horizon - decale[1]) * sy
    ys = np.arange(h, dtype=np.float32)[:, None]
    rampe = np.clip((ys - yh) / max(h - yh, 1.0), 0.0, 1.0) ** 1.4
    rampe = np.repeat(rampe, w, axis=1)

    echelle = h / 1080.0 if geo is PAYSAGE else 934.0 / 1080.0
    amplitude = (2.6 * echelle if geo is PAYSAGE else 2.2) * rampe * (1.0 - protege)

    # Masque des hautes lumieres du decor (chrome), hors corps proteges.
    luma = cv2.cvtColor(base, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
    bas, haut = 0.60, 0.85
    lumiere = np.clip((luma - bas) / (haut - bas), 0.0, 1.0) ** 2
    lumiere *= 1.0 - protege

    gx, gy = np.meshgrid(
        np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32)
    )
    return Scene(base, amplitude.astype(np.float32), lumiere.astype(np.float32),
                 gx, gy, echelle)


# ----------------------------------------------------------------------------
# Une image de la boucle. i dans [0, N_FRAMES) ; i = N_FRAMES redonne i = 0.
# ----------------------------------------------------------------------------


def image(scene: Scene, i: int) -> np.ndarray:
    t = i / N_FRAMES  # phase de boucle dans [0, 1)
    h, w = scene.base.shape[:2]
    e = scene.echelle
    gx, gy, amp = scene.grille_x, scene.grille_y, scene.amplitude

    # Sol de metal liquide : ondulation verticale dominante (les reflets
    # s'etirent), cisaillement lateral secondaire. Frequences temporelles
    # ENTIERES (1 et -2 cycles par boucle) : periodicite exacte.
    l1, l2, l3 = 96.0 * e, 51.0 * e, 240.0 * e
    dy = amp * (
        0.70 * np.sin(2 * np.pi * (gy / l1 + t) + gx * (2 * np.pi / (1300 * e)))
        + 0.30 * np.sin(2 * np.pi * (gy / l2 - 2 * t) + gx * (2 * np.pi / (760 * e)))
    )
    dx = 0.45 * amp * np.sin(
        2 * np.pi * (gx / l3 + t) + gy * (2 * np.pi / (520 * e))
    )

    anime = cv2.remap(
        scene.base,
        gx + dx,
        gy + dy,
        interpolation=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REFLECT101,
    )

    # Hautes lumieres mobiles : une bande douce diagonale traverse la scene en
    # une periode (enveloppee, donc continue au raccord), plus une respiration.
    theta = np.deg2rad(18.0)
    axe = (gx * np.cos(theta) + gy * np.sin(theta)) / (w * 0.95)
    bande = np.maximum(0.0, np.sin(2 * np.pi * (axe - t))) ** 2
    gain = (
        1.0
        + 0.085 * scene.lumiere * bande
        + 0.020 * scene.lumiere * np.sin(2 * np.pi * t + np.pi / 3)
    )
    sortie = np.clip(anime.astype(np.float32) * gain[..., None], 0.0, 255.0)
    return sortie.astype(np.uint8)


# ----------------------------------------------------------------------------
# Etapes.
# ----------------------------------------------------------------------------


def etape_masques() -> None:
    TRAVAIL.mkdir(parents=True, exist_ok=True)
    for rendu in [RENDUS[0], RENDUS[3]]:
        scene = preparer(rendu)
        surcouche = scene.base.copy().astype(np.float32)
        # Amplitude en rouge, lumiere en bleu : controle a l'oeil.
        norme = scene.amplitude / max(scene.amplitude.max(), 1e-6)
        surcouche[..., 2] = np.clip(surcouche[..., 2] + 160 * norme, 0, 255)
        surcouche[..., 0] = np.clip(surcouche[..., 0] + 120 * scene.lumiere, 0, 255)
        chemin = TRAVAIL / f"masques-{rendu.nom}.png"
        cv2.imwrite(str(chemin), surcouche.astype(np.uint8))
        print("masques ->", chemin)


def etape_preview() -> None:
    TRAVAIL.mkdir(parents=True, exist_ok=True)
    for rendu in [RENDUS[0], RENDUS[3]]:
        scene = preparer(rendu)
        for i in [0, 21, 42, 84, 126, 167]:
            cv2.imwrite(str(TRAVAIL / f"preview-{rendu.nom}-f{i:03d}.png"),
                        image(scene, i))
        a, b = image(scene, 167).astype(np.int16), image(scene, 0).astype(np.int16)
        adj = image(scene, 1).astype(np.int16)
        raccord = float(np.abs(a - b).mean())
        pas = float(np.abs(b - adj).mean())
        print(f"{rendu.nom} : raccord 167->0 = {raccord:.3f} ; "
              f"pas adjacent 0->1 = {pas:.3f} (les deux doivent se valoir)")


def encoder(rendu: Rendu, scene: Scene) -> Path:
    """Rend les 168 images et les pousse dans ffmpeg par tube rawvideo."""
    VIDEOS.mkdir(parents=True, exist_ok=True)
    sortie = VIDEOS / f"aj-luxury-hero-v6-{rendu.nom}.mp4"
    w, h = rendu.taille
    crf = rendu.crf
    while True:
        proc = subprocess.Popen(
            [
                "ffmpeg", "-y", "-loglevel", "error",
                "-f", "rawvideo", "-pix_fmt", "bgr24",
                "-s", f"{w}x{h}", "-r", str(FPS), "-i", "-",
                "-an", "-c:v", "libx264", "-preset", "veryslow",
                "-crf", str(crf), "-pix_fmt", "yuv420p",
                "-profile:v", "high", "-movflags", "+faststart",
                str(sortie),
            ],
            stdin=subprocess.PIPE,
        )
        assert proc.stdin is not None
        for i in range(N_FRAMES):
            proc.stdin.write(image(scene, i).tobytes())
        proc.stdin.close()
        if proc.wait() != 0:
            raise SystemExit(f"ffmpeg a echoue sur {sortie.name}")
        taille = sortie.stat().st_size
        if taille <= rendu.plafond_video:
            print(f"{sortie.name} : {taille} o (plafond {rendu.plafond_video}, crf {crf})")
            return sortie
        crf += 2
        print(f"{sortie.name} : {taille} o > plafond, nouvel essai crf {crf}")


def ecrire_webp(img: np.ndarray, chemin: Path, qualite: int, plafond: int,
                plancher: int) -> None:
    q = qualite
    while True:
        cv2.imwrite(str(chemin), img, [cv2.IMWRITE_WEBP_QUALITY, q])
        taille = chemin.stat().st_size
        if taille <= plafond and taille > plancher:
            print(f"{chemin.name} : {taille} o (q {q})")
            return
        if taille > plafond:
            q -= 4
        else:
            q += 4
        if not 30 <= q <= 100:
            raise SystemExit(f"budget introuvable pour {chemin.name} ({taille} o)")


def ecrire_avif(png: Path, chemin: Path, crf: int, plafond: int) -> None:
    c = crf
    while True:
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(png),
             "-frames:v", "1", "-c:v", "libaom-av1", "-still-picture", "1",
             "-crf", str(c), "-b:v", "0", str(chemin)],
            check=True,
        )
        taille = chemin.stat().st_size
        if 48 * 1024 < taille <= plafond:
            print(f"{chemin.name} : {taille} o (crf {c})")
            return
        c += 4 if taille > plafond else -4
        if not 8 <= c <= 55:
            raise SystemExit(f"budget introuvable pour {chemin.name} ({taille} o)")


def etape_render() -> None:
    TRAVAIL.mkdir(parents=True, exist_ok=True)
    IMAGES.mkdir(parents=True, exist_ok=True)
    scenes: dict[str, Scene] = {}
    for rendu in RENDUS:
        scene = scenes.setdefault(f"{rendu.geometrie.fichier}-{rendu.taille}",
                                  preparer(rendu))
        encoder(rendu, scene)

        affiche = image(scene, 0)
        png = TRAVAIL / f"poster-{rendu.nom}.png"
        cv2.imwrite(str(png), affiche)
        ecrire_webp(affiche, IMAGES / f"hero-v6-{rendu.nom}-poster.webp",
                    rendu.poster_webp_q, rendu.plafond_poster, 32 * 1024)
        if rendu.avif:
            ecrire_avif(png, IMAGES / f"hero-v6-{rendu.nom}-poster.avif",
                        rendu.avif_crf, rendu.plafond_avif)
        if rendu.compact:
            compacte = cv2.resize(affiche, rendu.compact,
                                  interpolation=cv2.INTER_AREA)
            cw, ch = rendu.compact
            ecrire_webp(compacte,
                        IMAGES / f"hero-v6-portrait-{cw}x{ch}-poster.webp",
                        86, 64_562, 24 * 1024)

    # Preuves : raccord de boucle et structure des reflets au zoom 6x.
    scene = scenes[f"{PAYSAGE.fichier}-{(1920, 1080)}"]
    a = image(scene, 167).astype(np.int16)
    b = image(scene, 0).astype(np.int16)
    adj = image(scene, 1).astype(np.int16)
    print(f"raccord 167->0 : {np.abs(a - b).mean():.3f} ; "
          f"pas 0->1 : {np.abs(b - adj).mean():.3f}")

    milieu = image(scene, 84)
    # Reflet du mannequin debout vs reflet du tabouret, agrandis 6x.
    zones = {"reflet-mannequin": (1000, 880, 200, 140),
             "reflet-tabouret": (700, 880, 200, 140)}
    for nom, (x, y, zw, zh) in zones.items():
        crop = milieu[y : y + zh, x : x + zw]
        cv2.imwrite(str(TRAVAIL / f"zoom6x-{nom}.png"),
                    cv2.resize(crop, (zw * 6, zh * 6),
                               interpolation=cv2.INTER_NEAREST))
    print("preuves zoom 6x ->", TRAVAIL)


if __name__ == "__main__":
    etage = sys.argv[1] if len(sys.argv) > 1 else "preview"
    {"masks": etape_masques, "preview": etape_preview,
     "render": etape_render}[etage]()
