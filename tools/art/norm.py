# 캐릭터 프레임 맞추기: 발밑을 같은 높이에, 아랫몸 폭을 같은 크기로
import numpy as np, glob, os, sys
from PIL import Image
S=512; BODY_W=0.72*S; FOOT_Y=0.93*S
def body_row(a, frac):
    ys=np.where(a.max(1)>40)[0]; top,bot=ys[0],ys[-1]
    y=int(bot-(bot-top)*frac); xs=np.where(a[y]>128)[0]
    return xs[0],xs[-1],top,bot
def norm(src,dst):
    im=Image.open(src).convert('RGBA'); a=np.asarray(im)[...,3]
    ys=np.where(a.max(1)>40)[0]; top,bot=ys[0],ys[-1]; h=bot-top
    # 몸 중심 = 발 사이 중앙(맨 아래 5% 행), 반폭 = 왼쪽 몸 가장자리(목도리 꼬리는 오른쪽)
    foot=a[int(bot-h*0.05):bot+1]>128; xs=np.where(foot.any(0))[0]; cx=(xs[0]+xs[-1])/2
    left=min(np.where(a[y]>128)[0][0] for y in range(int(bot-h*0.6),int(bot-h*0.2)))
    w=2*(cx-left)
    sc=BODY_W/w
    if h*sc>FOOT_Y-6: sc=(FOOT_Y-6)/h
    im2=im.resize((round(im.width*sc),round(im.height*sc)),Image.LANCZOS)
    ox,oy=round(S/2-cx*sc),round(FOOT_Y-bot*sc)
    out=Image.new('RGBA',(S,S),(0,0,0,0)); out.paste(im2,(ox,oy),im2)
    out.save(dst,'WEBP',quality=90,method=6)
os.makedirs('out',exist_ok=True)
for f in sorted(glob.glob('raw/*.png')):
    d='out/'+os.path.basename(f)[:-4]+'.webp'
    if not os.path.exists(d) or '-f' in sys.argv: norm(f,d)
print(len(glob.glob('out/*.webp')))
