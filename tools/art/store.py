import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
FONT=sys.argv[1]
INK=(74,52,38); SKY=(63,147,214)
SLIDES=[
 ('station',  ['일상을 ','필름','에 담아'],['열차에 태워요'],            ((255,244,228),(214,236,252))),
 ('onboarding',['8종 동물, 8가지 색'],['나만의 ','말랑볼'],             ((253,232,238),(255,246,232))),
 ('departure',['8칸이 차면 ','출발!'],['8명의 롤 크루가 탄생'],          ((214,236,252),(255,244,228))),
 ('album',    ['크루 앨범','에서'],['반응과 한 줄 인사'],               ((255,244,228),(232,242,222))),
 ('evolve',   ['친구와 함께 ','자라는'],['말랑볼에서 ','롤롤','까지'],       ((232,226,252),(214,236,252))),
 ('room',     ['모은 아이템으로'],['내 방 ','꾸미기'],                   ((222,240,250),(255,240,226))),
]
HL={'필름','말랑볼','출발!','크루 앨범','자라는','꾸미기','롤롤'}
def grad(W,H,a,b):
    g=Image.new('RGB',(1,H))
    for y in range(H):
        t=y/H; g.putpixel((0,y),tuple(int(a[i]+(b[i]-a[i])*t) for i in range(3)))
    return g.resize((W,H))
def line(d,y,parts,font,W):
    w=sum(d.textlength(p,font=font) for p in parts); x=(W-w)/2
    for p in parts:
        d.text((x,y),p,font=font,fill=SKY if p.strip() in HL else INK); x+=d.textlength(p,font=font)
def compose(key,l1,l2,cols,W,H,out):
    bg=grad(W,H,*cols).convert('RGBA')
    d=ImageDraw.Draw(bg); fs=int(W*0.074); font=ImageFont.truetype(FONT,fs)
    top=int(H*0.055)
    line(d,top,l1,font,W); line(d,top+int(fs*1.3),l2,font,W)
    shot=Image.open(f'ss_{key}.png').convert('RGB'); shot=shot.crop((0,96,shot.width,shot.height))
    pw=int(W*0.78); ph=int(shot.height*pw/shot.width); shot=shot.resize((pw,ph),Image.LANCZOS)
    bez=int(W*0.018); r=int(W*0.07)
    frame=Image.new('RGBA',(pw+2*bez,ph+2*bez),(0,0,0,0))
    ImageDraw.Draw(frame).rounded_rectangle([0,0,frame.width-1,frame.height-1],r,fill=(46,35,28,255))
    m=Image.new('L',(pw,ph),0); ImageDraw.Draw(m).rounded_rectangle([0,0,pw-1,ph-1],r-bez,fill=255)
    frame.paste(shot,(bez,bez),m)
    x=(W-frame.width)//2; y=top+int(fs*2.75)
    sh=Image.new('RGBA',bg.size,(0,0,0,0)); ImageDraw.Draw(sh).rounded_rectangle([x+10,y+30,x+frame.width+10,y+frame.height+30],r,fill=(74,52,38,70))
    bg=Image.alpha_composite(bg,sh.filter(ImageFilter.GaussianBlur(30)))
    bg.alpha_composite(frame,(x,y))
    bg.convert('RGB').save(out,quality=92)
for i,(k,l1,l2,c) in enumerate(SLIDES,1):
    compose(k,l1,l2,c,1290,2796,f'store/appstore_{i:02d}_{k}.png')
    compose(k,l1,l2,c,1080,1920,f'store/play_{i:02d}_{k}.png')
print('done')
