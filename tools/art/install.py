# out/*.webp → 앱 assets/characters 로 복사하고 src/lib/character-art.ts 레지스트리 생성
import os,shutil,glob
APP=os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
dst=f'{APP}/assets/characters'; os.makedirs(dst,exist_ok=True)
A=['bear','pig','chick','rabbit','cat','fox','frog','sheep']; S=['mallang','banjjak','rollroll']; E=['happy','wink','sleepy','surprised']
have=set()
for f in glob.glob('out/*.webp'):
    n=os.path.basename(f); shutil.copyfile(f,f'{dst}/{n}'); have.add(n[:-5])
L=["// 자동 생성 파일 (scratchpad/final/install.py). 직접 고치지 말 것.",
   "// 하늘색(#8CC8F2) 3D 렌더. 다른 몸 색은 lib/tint가 기기에서 입힌다.",
   "import type { Stage } from '@/lib/rules';","import type { AnimalId } from '@/lib/types';","",
   "export type Expression = 'happy' | 'wink' | 'sleepy' | 'surprised';","",
   "type StageArt = { happy: number } & Partial<Record<Expression, number>>;","",
   "export const CHARACTER_ART: Record<AnimalId, Record<Stage, StageArt>> = {"]
missing=[]
for a in A:
    L.append(f"  {a}: {{")
    for s in S:
        parts=[]
        for e in E:
            k=f'{a}_{s}_{e}'
            if k in have: parts.append(f"{e}: require('@/assets/characters/{k}.webp')")
            else: missing.append(k)
        L.append(f"    {s}: {{ {', '.join(parts)} }},")
    L.append("  },")
L.append("};"); L.append("")
open(f'{APP}/src/lib/character-art.ts','w',encoding='utf-8').write('\n'.join(L))
print('files',len(have),'missing',missing)
