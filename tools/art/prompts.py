import json
BASE = ("Premium 3D rendered mascot character for a cozy mobile game, exactly ONE character, centered, straight front view, full body fully inside the frame with generous margin, on a fully transparent background. "
"Match the reference images' character style and proportions exactly: a squishy stress-ball toy body where the animal head and body are one single round blob, wide bun shape (width to height about 1.15 to 1), bottom slightly flattened and spread, two tiny round nub feet under the body, NO arms, NO hands, no outlines. "
"Body color: light sky blue (#8CC8F2) with slightly deeper blue (#6AAEE0) soft shading toward the bottom; every body part including ears is this same blue. "
"Face placed slightly below the center, eyes set wide apart, dark brown (#4A3426) eyes and mouth, soft pink oval blush cheeks. "
"{animal} {face} {stage} "
"Soft diffuse studio lighting from upper left, pastel, extremely clean edges, high detail, no text, no letters, no ground, no cast shadow, no background objects, no props other than those described.")
ANIMALS = {
 "bear":"Animal: bear - two round ears on top with lighter inner ear, a small white oval muzzle with a tiny dark nose.",
 "pig":"Animal: pig - two small triangular ears folded forward on top, a flat oval snout with two nostrils in slightly deeper blue, snout no larger than a quarter of the face.",
 "chick":"Animal: chick - a tiny tuft of three small feathers on top of the head (same blue), a small orange beak, no ears.",
 "rabbit":"Animal: rabbit - two long upright ears on top (up to 40% of body height) with pale pink inner ear, small Y-shaped mouth.",
 "cat":"Animal: cat - two short triangular ears with slightly rounded tips and pale pink inner ear, a small w-shaped mouth, three short whiskers on each cheek.",
 "fox":"Animal: fox - two large pointed ears with pure white tips, white V-shaped cheek markings around the mouth, a tiny dark nose.",
 "frog":"Animal: frog - two round bumps on top of the head, and the frog's ONLY two eyes are drawn on those top bumps (the expression below applies to these bump eyes); there are NO other eyes anywhere on the face; the face area below has only the pink blush cheeks and a wide gentle mouth; no ears.",
 "sheep":"Animal: sheep - a fluffy cloud-like tuft of curly wool on top of the head in a lighter pale blue, two small droopy oval ears on the sides, a tiny dark nose.",
}
FACES = {
 "happy":"Expression: happy - curved closed crescent smiling eyes (^ ^), small open smiling mouth.",
 "wink":"Expression: wink - left eye a round shiny dark eye, right eye closed in a curved wink line, cheerful smile.",
 "sleepy":"Expression: sleepy - both eyes closed as flat relaxed lines, tiny small o mouth, peaceful drowsy look.",
 "surprised":"Expression: surprised - round shiny dot eyes with small white highlights, small round O mouth.",
}
STAGES = {
 "mallang":"Texture: soft matte velvety flocked surface like a peach-fuzz stress ball, almost no reflections, only one faint blurry highlight at the upper left.",
 "banjjak":"Texture: semi-transparent glossy jelly body filled with many small spherical beads (orbeez) in sky blue and white visible inside, beads denser toward the bottom, crisp curved glossy highlight on the upper left plus two small sparkle dots; the ears are also clear jelly.",
 "rollroll":"Texture: opaque smooth pearlescent coating (no beads visible), subtle iridescent pink and lilac sheen only near the edges, glossy highlight. Accessories: a dark brown (#2E231C) 35mm film-strip scarf wrapped around the lower neck with cream sprocket holes, its frames each printed with a tiny cute {animalname} face, the scarf tail hanging down on the right side; a small silver-and-black rangefinder camera hanging on a strap at the front right of the body.",
}
def prompt(animal, stage, face="happy"):
    return BASE.format(animal=ANIMALS[animal], face=FACES[face], stage=STAGES[stage].replace("{animalname}", animal))
if __name__ == "__main__":
    import sys
    print(prompt(*sys.argv[1:]))
