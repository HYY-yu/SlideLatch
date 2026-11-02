"""Render a 33-page English template overview from its actual PDF output."""
import argparse
import subprocess
import tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser()
parser.add_argument('--pdf', required=True)
parser.add_argument('--out', required=True)
args = parser.parse_args()
fonts = [Path('/System/Library/Fonts/Supplemental/Arial.ttf'), Path('/System/Library/Fonts/ArialHB.ttc'), Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')]
font_path = next((p for p in fonts if p.exists()), None)
if font_path is None:
    raise RuntimeError('A Latin font is required to render the overview')
font = lambda size: ImageFont.truetype(str(font_path), size)
with tempfile.TemporaryDirectory(prefix='slidelatch-overview-') as tmp:
    prefix = Path(tmp) / 'page'
    subprocess.run(['pdftoppm', '-scale-to', '480', '-jpeg', args.pdf, str(prefix)], check=True)
    slides = sorted(Path(tmp).glob('page-*.jpg'), key=lambda p: int(p.stem.split('-')[-1]))
    if len(slides) != 33:
        raise RuntimeError(f'Expected 33 template pages, got {len(slides)}')
    image = Image.new('RGB', (3840, 2160), '#f3f7f5')
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 3840, 18), fill='#176b50')
    draw.text((165, 85), 'Minimal Business', font=font(108), fill='#202832')
    draw.text((170, 240), 'YOUR DESIGN. READY TO REUSE.', font=font(34), fill='#176b50')
    draw.text((3020, 135), '33 SLIDE LAYOUTS', font=font(34), fill='#176b50')
    draw.line((168, 320, 3672, 320), fill='#cbdad3', width=2)
    for i, slide in enumerate(slides):
        row, col = divmod(i, 7)
        if row == 4:
            col += 1
        x, y = 168 + col * 504, 370 + row * 332
        image.paste(Image.open(slide).resize((480, 270), Image.Resampling.LANCZOS), (x, y))
        draw.rectangle((x, y, x + 480, y + 270), outline='#cbdad3', width=1)
        draw.text((x + 226, y + 281), f'{i + 1:02}', font=font(20), fill='#617a6c')
    draw.text((1510, 2085), 'EDITABLE POWERPOINT TEMPLATE', font=font(28), fill='#617a6c')
    image.save(args.out)
print(f'[overview] saved {args.out}')
