"""Convert the approved raster mark into matching SVG and browser icon formats."""
from pathlib import Path
import json
import cv2
import numpy as np
from PIL import Image

root=Path(__file__).resolve().parents[1]
public=root/'frontend/public'
im=Image.open(public/'decupa-logo.png').convert('RGBA')
pixels=np.array(im)
mask=((pixels[:,:,3]>128)&(pixels[:,:,:3].mean(axis=2)<128)).astype('uint8')*255


def trace(binary,box,target):
    x,y,w,h=box
    cropped=binary[y:y+h,x:x+w]
    contours,_=cv2.findContours(cropped,cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)
    paths=[]
    for contour in contours:
        if cv2.contourArea(contour)<3:continue
        pts=cv2.approxPolyDP(contour,.45,True).reshape(-1,2)
        paths.append('M'+' L'.join(f'{a},{b}' for a,b in pts)+' Z')
    target.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" role="img" aria-label="Decupa"><path fill="currentColor" fill-rule="evenodd" d="'+ ' '.join(paths)+'"/></svg>',encoding='utf-8')


trace(mask,cv2.boundingRect(mask),public/'decupa-logo.svg')
count,labels,stats,_=cv2.connectedComponentsWithStats(mask)
mark=min([row for row in stats[1:] if row[4]>1000],key=lambda row:row[0])
x,y,w,h=map(int,mark[:4])
trace(mask,(x,y,w,h),public/'decupa-icon.svg')
symbol=im.crop((x,y,x+w,y+h))
for size,name in [(16,'favicon-16x16.png'),(32,'favicon-32x32.png'),(180,'apple-touch-icon.png'),(192,'icon-192.png'),(512,'icon-512.png')]:
    side=round(size*.72)
    piece=symbol.copy();piece.thumbnail((side,side),Image.Resampling.LANCZOS)
    canvas=Image.new('RGBA',(size,size),'white')
    canvas.alpha_composite(piece,((size-piece.width)//2,(size-piece.height)//2))
    canvas.convert('RGB').save(public/name)
Image.open(public/'icon-192.png').save(public/'favicon.ico',sizes=[(16,16),(32,32),(48,48)])
manifest=json.loads((public/'manifest.json').read_text(encoding='utf-8'))
manifest.update(name='Decupa',short_name='Decupa',theme_color='#171719',background_color='#ffffff')
(public/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print('Logo traced to SVG; favicon and application icon formats generated from the approved mark.')
