#!/usr/bin/env python3
"""
Generate animated reel frames for Langhe map.
Creates SVG frames that can be stitched into MP4 by ffmpeg pipeline.
9 villages, 30-45 frames total (15-30 sec at 24-30fps).
"""

import json
import math
from pathlib import Path
from enum import Enum

COLORS = {
    "ink": "#1F1A16",
    "paper": "#FAF5E9",
    "burgundy": "#5A1A1F",
    "rust": "#A14F2A",
    "vine": "#5C6B3F",
    "gold": "#E5C99B",
    "rule": "#C9B98F",
}

FONTS = {
    "cormorant": "Cormorant Garamond",
    "source_serif": "Source Serif Pro",
    "jetbrains": "JetBrains Mono",
}

LANGHE_VILLAGES = [
    {"name": "Verduno", "wijnhuizen": ["G.B. Burlotto"], "x": 118, "y": 329, "side": "left", "order": 1},
    {"name": "La Morra", "wijnhuizen": ["Elio Altare", "Mauro Molino"], "x": 118, "y": 451, "side": "left", "order": 2},
    {"name": "Barolo", "wijnhuizen": ["Bartolo Mascarello", "Damilano"], "x": 118, "y": 573, "side": "left", "order": 3},
    {"name": "Novello", "wijnhuizen": ["Elvio Cogno"], "x": 118, "y": 695, "side": "left", "order": 4},
    {"name": "Monforte d'Alba", "wijnhuizen": ["Giacomo Conterno", "Conterno Fantino"], "x": 118, "y": 817, "side": "left", "order": 5},
    {"name": "Barbaresco", "wijnhuizen": ["Produttori del Barbaresco", "Montaribaldi"], "x": 962, "y": 379, "side": "right", "order": 6},
    {"name": "Neive", "wijnhuizen": ["Bruno Giacosa"], "x": 962, "y": 501, "side": "right", "order": 7},
    {"name": "Castiglione Falletto", "wijnhuizen": ["Vietti"], "x": 962, "y": 623, "side": "right", "order": 8},
    {"name": "Serralunga d'Alba", "wijnhuizen": ["Cappellano"], "x": 962, "y": 745, "side": "right", "order": 9},
]

WIDTH, HEIGHT = 1080, 1920


def svg_header():
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<svg width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}" xmlns="http://www.w3.org/2000/svg">
<defs><style><![CDATA[
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Source+Serif+Pro:wght@400;600&family=Inter:wght@400;500;600&display=swap');
  .h1   {{ font-family:'Cormorant Garamond',Georgia,serif; font-size:78px; font-weight:700; }}
  .h2   {{ font-family:'Cormorant Garamond',Georgia,serif; font-size:52px; font-weight:600; }}
  .h3   {{ font-family:'Cormorant Garamond',Georgia,serif; font-size:38px; font-weight:600; }}
  .big  {{ font-family:'Cormorant Garamond',Georgia,serif; font-size:150px; font-weight:700; }}
  .body {{ font-family:'Source Serif Pro',Georgia,serif; font-size:26px; }}
  .bodys{{ font-family:'Source Serif Pro',Georgia,serif; font-size:22px; }}
  .lbl  {{ font-family:'Inter',Helvetica,sans-serif; font-size:18px; font-weight:600; letter-spacing:2.5px; }}
  .meta {{ font-family:'Inter',Helvetica,sans-serif; font-size:16px; }}
  .metas{{ font-family:'Inter',Helvetica,sans-serif; font-size:14px; }}
  .dorp {{ font-family:'Cormorant Garamond',Georgia,serif; font-size:32px; font-weight:600; }}
  .kop  {{ font-family:'Cormorant Garamond',Georgia,serif; font-size:56px; font-weight:700; letter-spacing:1px; }}
  .fade_in {{ opacity: 0; animation: fadein 0.5s forwards; }}
  @keyframes fadein {{ from {{ opacity: 0; }} to {{ opacity: 1; }} }}
]]></style>
<pattern id="grain" width="4" height="4" patternUnits="userSpaceOnUse">
  <rect width="4" height="4" fill="{COLORS['paper']}"/>
  <circle cx="1" cy="1" r="0.4" fill="#C9B98F" opacity="0.18"/>
  <circle cx="3" cy="3" r="0.3" fill="#A14F2A" opacity="0.10"/>
</pattern>
</defs>
<rect width="{WIDTH}" height="{HEIGHT}" fill="url(#grain)"/>
'''


def svg_footer():
    return "</svg>"


def render_frame_begin():
    """Frame 1: Title/intro for Langhe"""
    svg = svg_header()

    # Burgundy header
    svg += f'<rect x="60" y="60" width="960" height="132" fill="{COLORS["burgundy"]}"/>'
    svg += f'<text x="540.0" y="140" class="kop" fill="{COLORS["paper"]}" text-anchor="middle">LANGHE</text>'
    svg += f'<text x="540.0" y="242" class="body" fill="{COLORS["ink"]}" text-anchor="middle">Negen dorpen, één druif, Nebbiolo</text>'

    # Decorative lines
    for i in range(1, 7):
        opacity = 0.26 - (i * 0.04)
        svg += f'<path d="M 90 {330 + i*70} Q 330 {272 + i*70} 560 {330 + i*70} T 990 {318 + i*70}" fill="none" stroke="{COLORS["vine"]}" stroke-width="2" opacity="{opacity}"/>'

    # Logo
    svg += f'<text x="70" y="{HEIGHT - 60}" class="lbl" fill="{COLORS["burgundy"]}">VINO·MARTINO</text>'
    svg += f'<text x="{WIDTH - 70}" y="{HEIGHT - 60}" class="meta" fill="{COLORS["rust"]}" text-anchor="end">Een reis door wijngaarden</text>'

    svg += svg_footer()
    return svg


def render_frame_village(village: dict, progress: float):
    """Render a village frame with wine houses.
    progress: 0.0 to 1.0 for animation within village"""
    svg = svg_header()

    # Header with village name
    svg += f'<rect x="60" y="60" width="960" height="100" fill="{COLORS["burgundy"]}"/>'
    svg += f'<text x="540.0" y="125" class="h2" fill="{COLORS["paper"]}" text-anchor="middle">{village["name"]}</text>'

    # Decorative line
    svg += f'<line x1="70" y1="210" x2="{WIDTH - 70}" y2="210" stroke="{COLORS["rule"]}" stroke-width="1.5"/>'

    # Village circle with pulse animation
    circle_x = village["x"]
    circle_y = 350 + (1 - progress) * 200  # Moves up as frame progresses
    circle_r = 8 + progress * 2  # Grows slightly

    svg += f'<circle cx="{circle_x}" cy="{circle_y}" r="{circle_r}" fill="{COLORS["burgundy"]}"/>'

    # Wine house list (appears as village comes into focus)
    opacity = min(progress * 2, 1.0)  # Fade in wine houses
    y_pos = 500
    svg += f'<text x="250" y="{y_pos}" class="h3" fill="{COLORS["ink"]}" opacity="{opacity}">Wijnhuizen:</text>'

    for i, house in enumerate(village["wijnhuizen"]):
        y = y_pos + 100 + (i * 80)
        svg += f'<text x="280" y="{y}" class="body" fill="{COLORS["ink"]}" opacity="{opacity}">{house}</text>'

    # Bottom meta info
    svg += f'<text x="70" y="{HEIGHT - 100}" class="meta" fill="{COLORS["rust"]}">Dorp {village["order"]} van 9</text>'
    svg += f'<text x="{WIDTH - 70}" y="{HEIGHT - 100}" class="meta" fill="{COLORS["rust"]}" text-anchor="end">{village["name"]}</text>'

    # Logo
    svg += f'<text x="70" y="{HEIGHT - 40}" class="lbl" fill="{COLORS["burgundy"]}">VINO·MARTINO</text>'

    svg += svg_footer()
    return svg


def render_frame_slot(total_houses: int):
    """Final frame: Total wine houses count"""
    svg = svg_header()

    # Burgundy background
    svg += f'<rect x="0" y="0" width="{WIDTH}" height="{HEIGHT}" fill="{COLORS["burgundy"]}"/>'

    # Large number
    svg += f'<text x="{WIDTH // 2}" y="{HEIGHT // 2 - 100}" class="big" fill="{COLORS["gold"]}" text-anchor="middle">{total_houses}</text>'
    svg += f'<text x="{WIDTH // 2}" y="{HEIGHT // 2 + 150}" class="h2" fill="{COLORS["paper"]}" text-anchor="middle">Wijnhuizen</text>'
    svg += f'<text x="{WIDTH // 2}" y="{HEIGHT // 2 + 220}" class="body" fill="{COLORS["paper"]}" text-anchor="middle">Negen dorpen, één streek</text>'

    # Bottom text
    svg += f'<text x="70" y="{HEIGHT - 60}" class="lbl" fill="{COLORS["gold"]}">VINO·MARTINO</text>'
    svg += f'<text x="{WIDTH - 70}" y="{HEIGHT - 60}" class="meta" fill="{COLORS["paper"]}" text-anchor="end">vinomartino.com/streken/langhe</text>'

    svg += svg_footer()
    return svg


def generate_reel_frames(output_dir: str = "reel_frames"):
    """Generate complete sequence of reel frames
    Target: 20 seconds at 30fps = 600 frames"""
    out_path = Path(output_dir)
    out_path.mkdir(exist_ok=True)

    frame_num = 1
    total_houses = sum(len(v["wijnhuizen"]) for v in LANGHE_VILLAGES)

    # Intro: 1 sec (30 frames)
    intro_frames = 30
    for i in range(intro_frames):
        svg = render_frame_begin()
        filename = out_path / f"reel_{frame_num:04d}.svg"
        filename.write_text(svg)
        if i == 0:
            print(f"Generated intro frames: {filename} ...")
        frame_num += 1

    # Main content: 18 sec (540 frames) / 9 villages = 60 frames per village
    frames_per_village = 60
    for village in LANGHE_VILLAGES:
        for step in range(frames_per_village):
            progress = step / frames_per_village
            svg = render_frame_village(village, progress)
            filename = out_path / f"reel_{frame_num:04d}.svg"
            filename.write_text(svg)
            if step == 0:
                print(f"  {village['name']}: {filename} ...")
            frame_num += 1

    # Ending: 1 sec (30 frames)
    slot_frames = 30
    for i in range(slot_frames):
        svg = render_frame_slot(total_houses)
        filename = out_path / f"reel_{frame_num:04d}.svg"
        filename.write_text(svg)
        if i == 0:
            print(f"Generated slot frames: {filename} ...")
        frame_num += 1

    print(f"\n✓ Generated {frame_num - 1} frames in {output_dir}/")
    print(f"  Duration at 30fps: {(frame_num - 1) / 30:.1f} seconds")


if __name__ == "__main__":
    import sys
    output_dir = sys.argv[1] if len(sys.argv) > 1 else "reel_frames"
    generate_reel_frames(output_dir)
