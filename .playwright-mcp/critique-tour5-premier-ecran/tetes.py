from PIL import Image
import statistics
im = Image.open('notre-390.png').convert('RGB'); px=im.load(); W,H=im.size
# la plaque commence a y=357. On cherche la premiere rangee ou la structure
# horizontale casse (cheveux) : ecart-type de luminance sur la rangee.
print("y    ecart-type luminance de la rangee (mur lisse = bas, cheveux = haut)")
base=None
for y in range(358, 470, 4):
    e=[px[x,y] for x in range(0,W,2)]
    L=[0.2126*r+0.7152*g+0.0722*b for r,g,b in e]
    sd=statistics.pstdev(L)
    if base is None: base=sd
    marq = "  <-- rupture" if sd > base*1.6 else ""
    print(f"{y:4d}  {sd:6.1f}{marq}")
