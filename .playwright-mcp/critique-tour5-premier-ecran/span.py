from PIL import Image
import statistics
im=Image.open('notre-390.png').convert('RGB'); px=im.load(); W,H=im.size
# bande de torses : y 480-620. La peau est chaude (R nettement > B).
y0,y1=470,640
cols=[]
for x in range(W):
    chaud=0
    for y in range(y0,y1,3):
        r,g,b=px[x,y]
        if r>90 and r-b>28: chaud+=1
    cols.append(chaud)
seuil=max(cols)*0.18
xs=[x for x,c in enumerate(cols) if c>seuil]
gauche,droite=min(xs),max(xs)
print(f"largeur de la plaque rendue : {W} px")
print(f"empreinte des deux corps    : x {gauche} -> {droite}  = {droite-gauche} px  ({(droite-gauche)/W*100:.0f} % de la largeur)")
# fenetre necessaire pour remplir un ecran 844 de haut a cette largeur
ratio_master=650/843
besoin = W*(W/844)/ratio_master
print(f"fenetre de recadrage pour un plein ecran 844 : {besoin:.0f} px de large sur {W}")
print(f"  -> il faudrait jeter {W-besoin:.0f} px de largeur, or les corps en occupent {droite-gauche}")
print("  VERDICT :", "recadrage plein ecran POSSIBLE" if besoin >= (droite-gauche) else "recadrage plein ecran IMPOSSIBLE — il couperait les corps")
