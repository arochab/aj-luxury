from PIL import Image
a = Image.open('notre-390.png').convert('RGB')
b = Image.open('etalon-390.png').convert('RGB')
G = 24
W = a.width + b.width + G*3
H = max(a.height, b.height) + G*2
c = Image.new('RGB', (W,H), (18,18,20))
c.paste(a, (G, G)); c.paste(b, (G*2 + a.width, G))
c.save('cote-a-cote.png')
print('cote-a-cote.png', c.size)

# contraste reel sur pixels rendus : fond le plus clair sous chaque texte
def lum(rgb):
    def f(v):
        v/=255
        return v/12.92 if v<=0.04045 else ((v+0.055)/1.055)**2.4
    r,g,bb = rgb
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(bb)
px = a.load()
def fond_le_plus_clair(x0,y0,x1,y1):
    # on ignore les pixels de texte (tres clairs) : on prend le 60e centile
    vals = sorted(lum(px[x,y]) for y in range(y0,y1) for x in range(x0,x1))
    return vals[int(len(vals)*0.60)]
zones = {
  'surtitre  (y 75-117)': (200,75,356,117),
  'APOLLON   (y 117-192)': (0,117,375,192),
  'phrase    (y 228-315)': (82,228,356,315),
}
for nom,(x0,y0,x1,y1) in zones.items():
    L = fond_le_plus_clair(x0,y0,x1,y1)
    ratio = (1.0+0.05)/(L+0.05)
    print(f"  {nom}: blanc sur fond -> {ratio:.1f}:1")
