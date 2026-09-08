# Langhe Map Animated Reel — Frame Sequence

**Status:** SVG frames ready for mp4 render  
**Duration:** 20 seconds at 30fps (600 frames)  
**Dimensions:** 1080×1920 (Instagram Reels format)  
**Live date:** 2026-09-15

## Sequence Breakdown

- **Frames 0001–0030:** Intro / title (Langhe, Neben​biolo druif)
- **Frames 0031–0090:** Verduno + wine house (G.B. Burlotto)
- **Frames 0091–0150:** La Morra + wine houses (Elio Altare, Mauro Molino)
- **Frames 0151–0210:** Barolo + wine houses (Bartolo Mascarello, Damilano)
- **Frames 0211–0270:** Novello + wine house (Elvio Cogno)
- **Frames 0271–0330:** Monforte d'Alba + wine houses (Giacomo Conterno, Conterno Fantino)
- **Frames 0331–0390:** Barbaresco + wine houses (Produttori del Barbaresco, Montaribaldi)
- **Frames 0391–0450:** Neive + wine house (Bruno Giacosa)
- **Frames 0451–0510:** Castiglione Falletto + wine house (Vietti)
- **Frames 0511–0570:** Serralunga d'Alba + wine house (Cappellano)
- **Frames 0571–0600:** Slot / total (19 wine houses, "Negen dorpen, één streek")

## Animation Details

**Per-village animation (60 frames each):**
- Circle moves from y=550 → y=350 (upward pan effect)
- Circle radius grows from 8 → 10px (focus effect)
- Wine house text fades in (opacity 0 → 1)

**Design consistency:**
- Color palette from tokens.css (burgundy header, cream background)
- Typography: Cormorant Garamond (heads), Source Serif Pro (body), Inter (labels)
- Grain texture pattern (paper aesthetic)

## Render Instructions (LAT-9301)

### Via ffmpeg (local):

```bash
# Convert SVG frames to PNG (requires rsvg-convert or similar)
for i in social/reel_frames/reel_*.svg; do
  rsvg-convert "$i" -o "${i%.svg}.png" --width=1080 --height=1920
done

# Stitch to mp4 at 30fps
ffmpeg -framerate 30 -pattern_type glob -i "social/reel_frames/reel_*.png" \
  -c:v libx264 -pix_fmt yuv420p -preset fast \
  output/langhe_reel.mp4
```

### For ig_publish.py:

Add to job object:
```json
{
  "type": "reel",
  "content_type": "REELS",
  "video_file": "output/langhe_reel.mp4",
  "caption": "[From LAT-3288]",
  "region": "Langhe"
}
```

## Design References

- Template base: `social-templates/ronde2/01_de-kaart_langhe.svg`
- Frame generator: `social/generate_langhe_reel_frames.py`
- Render script: `social/ig_render_card.py` (KaartFrameData)

## Notes

- All 600 frames are stateless SVGs (~2.4MB total)
- Frames use relative positioning (no absolute coordinates beyond wine house data)
- Ready for Instagram Reels 1:2 crop (safe zone: center 90%)
