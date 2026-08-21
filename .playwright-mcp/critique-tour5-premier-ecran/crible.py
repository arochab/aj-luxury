from PIL import Image
import statistics

def crible(path, nom):
    im = Image.open(path).convert('RGB')
    W,H = im.size
    px = im.load()
    print(f"\n===== {nom}  {W}x{H} =====")
    # 1) rangees clonees : une rangee est "clonee" si identique a la precedente
    #    a 0.5 niveau de luminance pres, sur une colonne donnee
    for col_nom, col in (("gauche", int(W*0.12)), ("droite", int(W*0.88))):
        for zone_nom, y0, y1 in (("haut 0-357", 0, min(357,H)), ("photo 357-fin", min(357,H), H)):
            clones = 0; total = 0
            prev = None
            for y in range(y0, y1):
                r,g,b = px[col,y]
                L = 0.2126*r+0.7152*g+0.0722*b
                if prev is not None:
                    total += 1
                    if abs(L-prev) <= 0.5: clones += 1
                prev = L
            if total:
                print(f"  {col_nom:7s} {zone_nom:14s} rangees clonees = {clones/total*100:5.1f} %  ({clones}/{total})")
    # 2) variance chromatique par bande de 100px : de la matiere varie, un degrade non
    print("  -- ecart-type de la teinte par bande horizontale (matiere = eleve) --")
    for y0 in range(0, H, 100):
        y1 = min(y0+100, H)
        ech = [px[x,y] for y in range(y0,y1,4) for x in range(0,W,4)]
        Ls = [0.2126*r+0.7152*g+0.0722*b for r,g,b in ech]
        sats = [max(c)-min(c) for c in ech]
        print(f"  y {y0:4d}-{y1:4d} : ecart-type luminance {statistics.pstdev(Ls):6.2f}   saturation moyenne {statistics.mean(sats):5.1f}")

crible('notre-390.png','LA NOTRE')
crible('etalon-390.png',"L ETALON")
