import json,re,sys
u=json.load(open('urls.json'))
ids={k:re.search(r'_([0-9a-f-]{36})\.png',v).group(1) for k,v in u.items()}
F={"wink":"wink - the character's left eye is an open round shiny dark eye with a small white highlight, the right eye is closed in a curved wink line, cheerful smile",
   "sleepy":"sleepy - both eyes closed as flat relaxed horizontal lines, a tiny small 'o' mouth, peaceful drowsy look",
   "surprised":"surprised - both eyes are round shiny dark dot eyes with small white highlights, a small round 'O' mouth"}
def req(i,key):
    a,s,e=key.split('_')
    frog=" (the frog's only eyes are on the two top bumps; keep no eyes on the face)" if a=='frog' else ""
    p=(f"Edit this exact image. Keep the character 100% identical: same animal, same body shape and size, same position in the frame, same texture, beads, pearl sheen, film scarf and camera, same colors and lighting, transparent background. "
       f"Change ONLY the eyes and mouth to this expression: {F[e]}{frog}. Keep the pink blush cheeks. Do not add text, symbols or anything else.")
    return {"index":i,"params":{"model":"gpt_image_2_5","prompt":p,"aspect_ratio":"1:1","quality":"high","resolution":"1k","background":"transparent","medias":[{"value":ids[f"{a}_{s}_happy"],"role":"image_references"}]}}
print(json.dumps([req(i,k) for i,k in enumerate(sys.argv[1:])],ensure_ascii=False))
