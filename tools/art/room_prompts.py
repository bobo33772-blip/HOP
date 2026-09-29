import json,sys
SP=("A single cozy room decoration item for a mobile game room-decorating screen, pure straight front view (orthographic, like a dollhouse seen from the front), centered, filling about 85% of the frame, on a fully transparent background. "
"Soft 3D clay miniature style matching the reference images, pastel colors, soft light from the upper left, clean edges, high detail, no text, no letters, no characters, no animals, no floor, no cast shadow. Item: ")
TX=("A flat seamless texture that fills the ENTIRE frame edge to edge, straight front view, no objects, no furniture, no text, soft 3D clay miniature style matching the reference images, pastel, soft even lighting. Texture: ")
ITEMS={
 "window-day":("1:1",SP+"a white-framed four-pane cottage window with a small wooden sill, bright clear blue sky with two puffy white clouds seen through the glass."),
 "window-sunset":("1:1",SP+"a white-framed four-pane cottage window with a small wooden sill, a warm orange-pink sunset sky with a low glowing sun seen through the glass."),
 "window-night":("1:1",SP+"a white-framed four-pane cottage window with a small wooden sill, a deep navy night sky with a crescent moon and twinkling stars seen through the glass."),
 "deco-crew":("3:2",SP+"a wooden wall-mounted photo frame board holding exactly three EMPTY vertical photo slots in one row (plain flat light cream rectangles, same size, evenly spaced), with a small blank cream label plate centered below."),
 "deco-poster":("3:4",SP+"a retro poster in a thin wooden frame: navy background with a pastel pink sky, a round yellow sun and a cute simple camera illustration, no text."),
 "deco-garland":("21:9",SP+"a twine garland hanging in one gentle curve holding five small instant film photos with pastel colored pictures, held by tiny wooden clothespins."),
 "light-stand":("2:3",SP+"a slim wooden floor lamp with a round base and a warm cream pleated lampshade glowing softly."),
 "light-string":("21:9",SP+"a draped string of warm fairy lights with round glowing bulbs in soft pastel colors hanging in two gentle swoops across the frame."),
 "rug-cloud":("21:9",SP+"a soft fluffy cloud-shaped rug in pale sky blue and white, seen from a low front angle so it looks like it lies flat on a floor (wide and thin)."),
 "rug-heart":("21:9",SP+"a soft pink heart-shaped plush rug, seen from a low front angle so it looks like it lies flat on a floor (wide and thin)."),
 "rug-film":("21:9",SP+"a rug shaped like a 35mm film strip, dark brown with cream sprocket holes along both edges and four pastel colored frames, seen from a low front angle lying flat (wide and thin)."),
 "left-bed":("4:3",SP+"a cozy single bed seen from the side, rounded wooden frame, fluffy white duvet with a folded sky-blue blanket and one cream pillow."),
 "left-sofa":("16:9",SP+"a squishy rounded pastel pink loveseat sofa with plump cushions and short wooden legs."),
 "left-tent":("1:1",SP+"a small pastel yellow canvas play tent (A-frame triangle) with an open door flap and a tiny pink pennant flag on top."),
 "right-plant":("1:1",SP+"a lush monstera plant in a round terracotta pot."),
 "right-beanbag":("4:3",SP+"a squishy sky-blue beanbag chair."),
 "right-shelf":("1:1",SP+"a small wooden two-tier wall shelf displaying vintage cameras: a silver rangefinder camera, a small sky-blue instant camera, a white toy camera and a pink film canister."),
 "wall-cream":("21:9",TX+"warm cream plaster wallpaper with a very faint tiny polka dot pattern."),
 "wall-sky":("21:9",TX+"pale sky blue wallpaper with a small scattered pattern of tiny white clouds."),
 "wall-pink":("21:9",TX+"pale cherry blossom pink wallpaper with a small scattered pattern of tiny petals."),
 "wall-mint":("21:9",TX+"soft mint green wallpaper with thin vertical cream stripes."),
 "wall-night":("21:9",TX+"deep navy wallpaper with a small scattered pattern of tiny gold stars and crescent moons."),
 "floor-wood":("21:9",TX+"light honey oak wooden floor planks running horizontally, seen straight on from the front."),
 "floor-dark":("21:9",TX+"dark walnut wooden floor planks running horizontally, seen straight on from the front."),
 "floor-check":("21:9",TX+"cream and soft beige checkerboard floor tiles seen straight on from the front."),
}
def req(i,k):
    ar,p=ITEMS[k]; tex=k.startswith(('wall','floor'))
    return {"index":i,"params":{"model":"gpt_image_2_5","prompt":p,"aspect_ratio":ar,"quality":"high","resolution":"1k","background":"opaque" if tex else "transparent",
      "medias":[{"value":"a60c5b7a-f84c-4843-b3d1-51eb71f957e3","role":"image_references"},{"value":"dc677fb2-a877-44e8-8b6d-f62d5d5e6a2f","role":"image_references"}]}}
if __name__=='__main__':
    ks=list(ITEMS)
    if sys.argv[1:]==['list']: print('\n'.join(ks))
    else: print(json.dumps([req(i,k) for i,k in enumerate(sys.argv[1:])],ensure_ascii=False))
