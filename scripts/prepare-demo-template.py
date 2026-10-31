"""Extract the selected template's cover geometry and real DSL fields for the browser demo.

Usage: python scripts/prepare-demo-template.py --source /path/to/minimal-business/v4
The downloadable PPTX is copied byte-for-byte; browser changes never alter it.
"""
import argparse
import hashlib
import json
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile
from html import escape

args = argparse.ArgumentParser()
args.add_argument('--source', type=Path, required=True)
opts = args.parse_args()
root = Path(__file__).resolve().parents[1]
out = root / 'public/demo/minimal-business'
out.mkdir(parents=True, exist_ok=True)
source = opts.source / 'compiled/template.pptx'
manifest = json.loads((opts.source / 'compiled/template-manifest.json').read_text())
ns = {'p': 'http://schemas.openxmlformats.org/presentationml/2006/main', 'a': 'http://schemas.openxmlformats.org/drawingml/2006/main', 'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
page = manifest['slides'][0]
with ZipFile(source) as package:
    doc = ET.fromstring(package.read(page['slidePath']))
    size = ET.fromstring(package.read('ppt/presentation.xml')).find('p:sldSz', ns)
    width, height = int(size.attrib['cx']), int(size.attrib['cy'])
    theme = ET.fromstring(package.read('ppt/theme/theme1.xml'))
    colors = {node.tag.split('}')[-1]: '#' + list(node)[0].attrib.get('val', '202832') for node in theme.find('a:themeElements/a:clrScheme', ns)}
    colors.update(bg1=colors['lt1'], tx1=colors['dk1'])
    def color(fill, default='none'):
        if fill is None: return default
        clr = fill.find('a:schemeClr', ns)
        if clr is not None: return colors[clr.attrib['val']]
        clr = fill.find('a:srgbClr', ns)
        return '#' + clr.attrib['val'] if clr is not None else default
    background = color(doc.find('p:cSld/p:bg/p:bgPr/a:solidFill', ns), '#FFFFFF')
    rels = ET.fromstring(package.read('ppt/slides/_rels/slide1.xml.rels'))
    targets = {r.attrib['Id']: r.attrib['Target'] for r in rels}
    fields = []
    shapes = {s.find('p:nvSpPr/p:cNvPr', ns).attrib['id']: s for s in doc.findall('p:cSld/p:spTree/p:sp', ns)}
    for node in page['nodes']:
        if node['kind'] != 'text': continue
        shape = shapes[node['locator']['shapeId']]
        style = shape.find('.//a:defRPr', ns)
        para = shape.find('.//a:pPr', ns)
        box = node['locator']['box']
        fields.append({
            'key': node['key'], 'shapeId': node['locator']['shapeId'], 'sample': node['sampleContent'],
            'min': node['length']['min'], 'max': node['length']['max'],
            'x': box['x'] / width * 100, 'y': box['y'] / height * 100,
            'width': box['cx'] / width * 100, 'height': box['cy'] / height * 100,
            'fontSize': int(style.attrib['sz']) / 100 / (width / 12700) * 100,
            'bold': style.attrib.get('b') == '1', 'color': color(style.find('a:solidFill', ns), '#202832'),
            'align': 'right' if para.attrib.get('algn') == 'r' else 'left',
        })
    # Only fixed cover shapes are drawn here. Editable text uses the original OOXML boxes above.
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}"><rect width="{width}" height="{height}" fill="{background}"/>']
    image_box = None
    for sid, shape in shapes.items():
        if sid in {f['shapeId'] for f in fields}: continue
        prop = shape.find('p:spPr', ns)
        transform = prop.find('a:xfrm', ns)
        off, extent = transform.find('a:off', ns), transform.find('a:ext', ns)
        x,y = int(off.attrib['x']), int(off.attrib['y'])
        w,h = int(extent.attrib['cx']), int(extent.attrib['cy'])
        geometry = prop.find('a:prstGeom', ns).attrib['prst']
        fill = color(prop.find('a:solidFill', ns))
        alpha = prop.find('a:solidFill/a:schemeClr/a:alpha', ns)
        if alpha is not None and alpha.attrib['val'] == '0': fill = 'none'
        line = prop.find('a:ln', ns)
        stroke = color(line.find('a:solidFill', ns)) if line is not None else 'none'
        line_width = int(line.attrib.get('w','0')) if line is not None else 0
        blip = prop.find('a:blipFill/a:blip', ns)
        if blip is not None:
            target = targets[blip.attrib['{' + ns['r'] + '}embed']]
            media = 'ppt/' + target.removeprefix('../')
            (out / 'cover-photo.jpeg').write_bytes(package.read(media))
            image_box = {'x':x/width*100,'y':y/height*100,'width':w/width*100,'height':h/height*100}
            continue
        attrs = f'fill="{fill}" stroke="{stroke}" stroke-width="{line_width}"'
        if geometry == 'rect': svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" {attrs}/>')
        elif geometry == 'line': svg.append(f'<path d="M{x} {y}h{w}" {attrs}/>')
        elif geometry == 'ellipse': svg.append(f'<ellipse cx="{x+w/2}" cy="{y+h/2}" rx="{w/2}" ry="{h/2}" {attrs}/>')
        else: raise ValueError(f'Unsupported fixed shape: {geometry}')
    svg.append('</svg>')
    (out / 'cover-background.svg').write_text(''.join(svg))
    if image_box is None: raise ValueError('Cover image slot missing')

shutil.copyfile(source, out / 'minimal-business-original.pptx')
shutil.copyfile(opts.source / 'cover.png', out / 'cover.png')
data = {'id':'minimal-business-v4','version':4,'slideCount':manifest['slideCount'],'coverSlide':1,'downloadUrl':'/demo/minimal-business/minimal-business-original.pptx','sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'overview':'/demo/minimal-business/cover.png','background':'/demo/minimal-business/cover-background.svg','photo':'/demo/minimal-business/cover-photo.jpeg','imageBox':image_box,'fields':fields}
(root / 'lib/demo/template.json').write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n')
print(f'Prepared real cover: {len(fields)} text fields; {data["slideCount"]} slides in unchanged download; SHA-256 {data["sha256"]}')
