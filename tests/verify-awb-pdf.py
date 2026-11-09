from pathlib import Path
import pymupdf, zxingcpp
from PIL import Image
for path in Path('management-evidence').glob('awb-*.pdf'):
    document=pymupdf.open(path)
    assert len(document)==1
    page=document[0]
    assert abs(page.rect.width-100*72/25.4)<.01 and abs(page.rect.height-150*72/25.4)<.01
    text=page.get_text()
    assert '081234567890' not in text and '+628******7890' in text
    assert text.index('Order ID:')<text.index('Jumlah:')
    target=path.with_suffix('.png')
    page.get_pixmap(matrix=pymupdf.Matrix(3,3)).save(target)
    codes=zxingcpp.read_barcodes(Image.open(target))
    assert {r.format.name for r in codes}>={'QRCode','Code128'}
    assert all(r.text=='JO1234567890' for r in codes)
    print(path.name,'PASS fixed size, masking, QR, Code128')
