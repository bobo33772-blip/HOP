import json, sys

ST = "a60c5b7a-f84c-4843-b3d1-51eb71f957e3"  # 정거장 낮 (최종 스타일 기준)
BEAR = "c24dc341-ffef-4822-a91f-648e9844d634"
DARK = "f6770f8d-4e9d-4de1-b44f-276ba70fe8b3"
DEP = "9621af0e-281e-4c25-afaa-3f851748fafb"
EVO = "44a1230c-c5e2-48f0-9273-845a187113cb"
ONB = "9e34840d-4941-437b-a9ff-8fda91c7a669"
STYLE = "Premium soft 3D clay miniature diorama render, pastel colors, soft warm lighting, gentle ambient occlusion, tidy and uncluttered, very high detail, matching the reference images look. "
NOCH = " Absolutely no characters, no animals, no people, no text, no letters, no numbers, no logos, no UI elements."
ICON = "A single app tab icon object, centered, filling 85 percent of the frame, fully transparent background, no ground, no shadow: "
STK = "A single glossy 3D sticker, centered, filling 80 percent of the frame, fully transparent background, thick white die-cut sticker border around it: "

IT = {
    "bg_darkroom": ("9:16", [DARK, ST], STYLE + "Vertical mobile game background: inside a cozy tiny photo darkroom lit by a warm red safelight lamp hanging at the top center. Just below the top, a twine line stretches across the whole width with a few small EMPTY wooden clothespins. Back wall with wooden shelves holding amber chemical bottles, film canisters and a small photo enlarger at the right; at the very bottom a wooden counter with three shallow developing trays. Deep burgundy and red tones; the middle 60 percent of the frame stays calm, simple and darker so UI cards can be placed on top." + NOCH),
    "bg_departure": ("9:16", [DEP, ST], STYLE + "Vertical mobile game background for a joyful train departure celebration: bright blue sky with soft clouds, colorful paper confetti and pastel bunting flags strung across the top; below, gentle green hills and a railway track running horizontally across the middle of the frame (the track is EMPTY, no train); in the lower third an open sunny cream platform with a few flower pots at the edges, kept mostly empty for UI. Festive, warm, happy." + NOCH),
    "bg_evolve": ("9:16", [EVO, ST], STYLE + "Vertical mobile game background for a character evolution moment: dreamy pastel sky-blue and lilac gradient with a big soft radial burst of light rays from the center, floating 35mm film frames and instant photos drifting around the edges, twinkling star sparkles and small soft clouds, and an empty round glowing cream pedestal stage in the lower middle of the frame. Magical, gentle, celebratory." + NOCH),
    "bg_onboarding": ("4:3", [ONB, ST], STYLE + "Wide header background for a character creation screen: a pastel seaside town at the horizon with a red-and-white lighthouse, calm blue sea, green hills and soft clouds; in the center foreground an empty round cream pedestal stage with a soft sky-blue rim, ready for a character to stand on. Bright and welcoming." + NOCH),
    "dest_sky": ("3:2", [ST], STYLE + "Destination illustration for the sky line: a tiny pastel train crossing an arched bridge high among big fluffy clouds in a vast bright blue sky, a few birds far away and a small hot-air balloon." + NOCH),
    "dest_cup": ("3:2", [ST], STYLE + "Destination illustration for the one-cup line: a cozy miniature cafe town where a giant latte cup with heart latte art stands like a building, a tiny railway track looping around it, steam curling up, pastel cafe awnings." + NOCH),
    "dest_feet": ("3:2", [ST], STYLE + "Destination illustration for the footsteps line: a winding pastel cobblestone footpath through flower fields toward a tiny station, a pair of cute pastel sneakers resting on the path in the foreground, gentle morning light." + NOCH),
    "dest_window": ("3:2", [ST], STYLE + "Destination illustration for the window line: view through a big rounded train window with a wooden frame; outside, a sunny pastel countryside with fields, a river and distant mountains; a small potted plant on the sill." + NOCH),
    "dest_lunch": ("3:2", [ST], STYLE + "Destination illustration for the lunch line: a cheerful miniature picnic on a grassy hill beside a railway, a checkered blanket with a bento box, rice balls, sandwiches and fruit, a small train passing in the background." + NOCH),
    "dest_shadow": ("3:2", [ST], STYLE + "Destination illustration for the light-and-shadow line: a quiet pastel street at golden hour with long soft shadows of lamp posts, a picket fence and a small station roof stretched across the cobblestones, warm sunbeams." + NOCH),
    "dest_green": ("3:2", [ST], STYLE + "Destination illustration for the green line: a lush forest station among pine trees, ferns and moss, a little railway disappearing into a green tunnel of leaves, dappled sunlight, small mushrooms." + NOCH),
    "dest_drift": ("3:2", [ST], STYLE + "Destination illustration for the wandering line: a dreamy misty meadow at dawn with a single railway track wandering off into soft fog, drifting green leaves in the wind, a little wooden signpost with blank arrows." + NOCH),
    "tab_station": ("1:1", [ST], STYLE + ICON + "a tiny cute train station building with a sky-blue roof and a round clock, with the front of a small sky-blue locomotive peeking out at its side. No text, no letters."),
    "tab_darkroom": ("1:1", [ST], STYLE + ICON + "a chunky cute 35mm film canister in warm brown with a cream label area and a little strip of film pulled out, a tiny red safelight glow. No text, no letters."),
    "tab_crew": ("1:1", [BEAR], STYLE + ICON + "three small round squishy mascot balls huddled together: a pink pig ball on the left, a sky-blue bear ball in the front center and a lilac rabbit ball on the right, happy closed-eye smiles, same character style as the reference. No text, no letters."),
    "tab_room": ("1:1", [ST], STYLE + ICON + "a tiny cozy cottage house with a coral-red roof, a round window glowing warm, a little chimney and a heart-shaped wreath on the door. No text, no letters."),
    "st_heart": ("1:1", [ST], STYLE + STK + "a plump puffy pink heart with a small shine. No text."),
    "st_sparkle": ("1:1", [ST], STYLE + STK + "a cluster of three puffy golden-yellow twinkle stars, one big and two small. No text."),
    "st_cloud": ("1:1", [ST], STYLE + STK + "a fluffy soft sky-blue and white cloud with a tiny smiling face. No text."),
    "st_laugh": ("1:1", [BEAR], STYLE + STK + "the face of a round butter-yellow squishy mascot ball laughing hard with squeezed closed eyes, a wide open laughing mouth and one happy tear, pink cheeks, same character style as the reference. No text."),
}


def req(i, k):
    ar, refs, p = IT[k]
    opaque = k.startswith(("bg_", "dest_"))
    return {"index": i, "params": {"model": "gpt_image_2_5", "prompt": p, "aspect_ratio": ar, "quality": "high", "resolution": "2k" if opaque else "1k",
            "background": "opaque" if opaque else "transparent", "medias": [{"value": r, "role": "image_references"} for r in refs]}}


if __name__ == "__main__":
    if sys.argv[1:] == ["list"]:
        print("\n".join(IT))
    else:
        print(json.dumps([req(i, k) for i, k in enumerate(sys.argv[1:])], ensure_ascii=False))
