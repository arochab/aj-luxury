from PIL import Image
import statistics
def prof(path, nom):
    im = Image.open(path).convert('RGB'); px=im.load(); W,H=im.size
    print(f"\n--- {nom} ({W}x{H}) ---")
    def bande(y):
        e=[px[x,y] for x in range(0,W,2)]
        L=[0.2126*r+0.7152*g+0.0722*b for r,g,b in e]
        S=[max(c)-min(c) for c in e]
        return statistics.mean(L), statistics.mean(S)
    for y in (330,345,352,355,356,357,358,360,365,380,400):
        if y<H:
            L,S=bande(y); print(f"  y={y:4d}  luminance {L:6.1f}   saturation {S:5.1f}")
    # saut maximal sur 2 rangees dans la fenetre 340-375
    saut=0; ysaut=0
    for y in range(340, min(376,H-2)):
        a,_=bande(y); b,_=bande(y+2)
        if abs(b-a)>saut: saut=abs(b-a); ysaut=y
    print(f"  >> saut maximal sur 2 rangees : {saut:.1f} niveaux a y={ysaut}")
prof('../tour5-avant/390-ecran1.png','AVANT son tour')
prof('notre-390.png','APRES son tour')
