import numpy as np
from PIL import Image
def srgb2lin(c): return np.where(c<=0.04045,c/12.92,((c+0.055)/1.055)**2.4)
def lin2srgb(c): c=np.clip(c,0,1); return np.where(c<=0.0031308,c*12.92,1.055*c**(1/2.4)-0.055)
def to_oklab(rgb):
    r,g,b=[srgb2lin(rgb[...,i]) for i in range(3)]
    l=0.4122214708*r+0.5363325363*g+0.0514459929*b
    m=0.2119034982*r+0.6806995451*g+0.1073969566*b
    s=0.0883024619*r+0.2817188376*g+0.6299787005*b
    l,m,s=np.cbrt(l),np.cbrt(m),np.cbrt(s)
    return np.stack([0.2104542553*l+0.7936177850*m-0.0040720468*s,1.9779984951*l-2.4285922050*m+0.4505937099*s,0.0259040371*l+0.7827717662*m-0.8086757660*s],-1)
def from_oklab(lab):
    L,a,b=lab[...,0],lab[...,1],lab[...,2]
    l=(L+0.3963377774*a+0.2158037573*b)**3; m=(L-0.1055613458*a-0.0638541728*b)**3; s=(L-0.0894841775*a-1.2914855480*b)**3
    return np.stack([lin2srgb(4.0767416621*l-3.3077115913*m+0.2309699292*s),lin2srgb(-1.2684380046*l+2.6097574011*m-0.3413193965*s),lin2srgb(-0.0041960771*l-0.7034186147*m+1.7076147940*s)],-1)
def hexlab(h): return to_oklab(np.array([[int(h[i:i+2],16)/255 for i in (1,3,5)]]))[0]
MASTER=hexlab('#8CC8F2')
def recolor(img, target):
    a=np.asarray(img.convert('RGBA')).astype(np.float64)/255
    lab=to_oklab(a[...,:3]); T=hexlab(target)
    C=np.hypot(lab[...,1],lab[...,2]); h=np.arctan2(lab[...,2],lab[...,1])
    mh=np.arctan2(MASTER[2],MASTER[1]); mC=np.hypot(MASTER[1],MASTER[2])
    dh=np.abs(np.angle(np.exp(1j*(h-mh))))
    w=np.clip((0.6-dh)/0.3,0,1)*np.clip((C-0.02)/0.03,0,1)
    tC=np.hypot(T[1],T[2]); ta=np.arctan2(T[2],T[1])
    k=C/mC
    nL=lab[...,0]+(T[0]-MASTER[0])*np.clip(lab[...,0]/MASTER[0],0,1.2)
    na=np.cos(ta)*tC*k; nb=np.sin(ta)*tC*k
    out=lab.copy(); out[...,0]=lab[...,0]*(1-w)+nL*w; out[...,1]=lab[...,1]*(1-w)+na*w; out[...,2]=lab[...,2]*(1-w)+nb*w
    rgb=from_oklab(out)
    return Image.fromarray((np.dstack([rgb,a[...,3:]])*255).round().astype(np.uint8),'RGBA')
COLORS=['#8CC8F2','#F8BCCB','#FBE38E','#C9B6F2','#FBC9A4','#A9E3C4','#F5ECDD','#C9CCD3']
if __name__=='__main__':
    import sys
    rows=[]
    for s in ['mallang','banjjak','rollroll']:
        im=Image.open(f'raw/bear_{s}_happy.png').resize((256,256))
        row=Image.new('RGBA',(256*8,256),(255,248,236,255))
        for i,c in enumerate(COLORS): row.alpha_composite(recolor(im,c),(256*i,0))
        rows.append(row)
    sheet=Image.new('RGB',(2048,768))
    for i,r in enumerate(rows): sheet.paste(r.convert('RGB'),(0,256*i))
    sheet.save('check_recolor.jpg',quality=85)
