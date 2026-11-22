"""Compare unaltered Chromium RGB/RGBA PNG pixels using the Python standard library."""
import json, struct, zlib
from pathlib import Path

def pixels(path):
    data=path.read_bytes(); offset=8; compressed=b''
    while offset<len(data):
        length=struct.unpack('>I',data[offset:offset+4])[0]; kind=data[offset+4:offset+8]; body=data[offset+8:offset+8+length]; offset+=length+12
        if kind==b'IHDR': width,height,depth,color,_,_,interlace=struct.unpack('>IIBBBBB',body)
        if kind==b'IDAT':compressed+=body
    assert depth==8 and color in (2,6) and interlace==0
    channels=3 if color==2 else 4;stride=width*channels;raw=zlib.decompress(compressed);previous=bytearray(stride);decoded=[]
    for y in range(height):
        start=y*(stride+1); method=raw[start];row=bytearray(raw[start+1:start+1+stride])
        for x in range(stride):
            left=row[x-channels] if x>=channels else 0;up=previous[x];upperleft=previous[x-channels] if x>=channels else 0
            if method==1:prediction=left
            elif method==2:prediction=up
            elif method==3:prediction=(left+up)//2
            elif method==4:
                p=left+up-upperleft;distances=[abs(p-left),abs(p-up),abs(p-upperleft)];prediction=[left,up,upperleft][distances.index(min(distances))]
            else:assert method==0;prediction=0
            row[x]=(row[x]+prediction)&255
        decoded.append(bytes(row));previous=row
    return width,height,channels,decoded

root=Path(__file__).resolve().parent;results=[]
for before in sorted(root.glob('before-*.png')):
    after=root/('after-'+before.name[7:])
    if not after.exists():continue
    w,h,c,a=pixels(before);ww,hh,cc,b=pixels(after);assert (w,h,c)==(ww,hh,cc)
    differences=[(x,y) for y in range(h) for x in range(w) if a[y][x*c:x*c+c]!=b[y][x*c:x*c+c]]
    results.append({'before':before.name,'after':after.name,'size':[w,h],'differentPixels':len(differences),'bounds':None if not differences else [min(x for x,y in differences),min(y for x,y in differences),max(x for x,y in differences),max(y for x,y in differences)]})
(root/'image-parity.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results))
