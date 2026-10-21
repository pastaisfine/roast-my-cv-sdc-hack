"""Generate tiny synthetic-only fixtures; no real CVs and no downloaded documents."""
import io
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parents[3] / "generated-artifacts" / "cv-fixtures"
PHRASES = ["SYNTHETIC CV SAMPLE", "Business Analytics Graduate", "Skills: Python SQL Excel", "Built a sales dashboard", "Education: University 2025"]


def image():
    font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    # Pillow bundles a scalable default font if the OS has no DejaVu installation.
    try:
        font = ImageFont.truetype(font_path, 32)
    except OSError:
        font = ImageFont.load_default(size=32)
    im = Image.new("RGB", (1000, 560), "white")
    draw = ImageDraw.Draw(im)
    for i, phrase in enumerate(PHRASES):
        draw.text((45, 45 + 85 * i), phrase, font=font, fill="black")
    return im


def pdf(pages, encrypted=False):
    """Minimal PDF with selectable text and/or JPEG image pages; deterministic fixtures."""
    objects = [b"", b""]
    page_ids = []
    for kind in pages:
        page_id = len(objects) + 1
        page_ids.append(page_id)
        objects.append(b"")
        content_id = len(objects) + 1
        if kind == "text":
            content = b"BT /F1 20 Tf 40 740 Td " + b" 0 -45 Td ".join(b"(" + p.encode() + b") Tj" for p in PHRASES) + b" ET"
            objects.append(b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream")
            resource = b"/Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >>"
        else:
            data = io.BytesIO()
            image().save(data, "JPEG")
            raw = data.getvalue()
            content = b"q 540 0 0 303 35 400 cm /Im1 Do Q"
            objects.append(b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream")
            image_id = len(objects) + 1
            objects.append(b"<< /Type /XObject /Subtype /Image /Width 1000 /Height 560 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + str(len(raw)).encode() + b" >>\nstream\n" + raw + b"\nendstream")
            resource = b"/XObject << /Im1 " + str(image_id).encode() + b" 0 R >>"
        objects[page_id - 1] = b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << " + resource + b" >> /Contents " + str(content_id).encode() + b" 0 R >>"
    objects[0] = b"<< /Type /Catalog /Pages 2 0 R >>"
    objects[1] = b"<< /Type /Pages /Count " + str(len(pages)).encode() + b" /Kids [" + b" ".join(str(p).encode() + b" 0 R" for p in page_ids) + b"] >>"
    # Password-protected empty document using standard security revision 2.
    encrypt_id = None
    if encrypted:
        import hashlib
        from struct import pack
        padding = bytes.fromhex("28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a")
        def padded(password):
            return (password + padding)[:32]
        def rc4(key, data):
            s = list(range(256)); j = 0
            for i in range(256):
                j = (j + s[i] + key[i % len(key)]) % 256
                s[i], s[j] = s[j], s[i]
            i = j = 0; out = []
            for b in data:
                i = (i + 1) % 256; j = (j + s[i]) % 256
                s[i], s[j] = s[j], s[i]
                out.append(b ^ s[(s[i] + s[j]) % 256])
            return bytes(out)
        owner = rc4(hashlib.md5(padded(b"fixture-owner")).digest()[:5], padded(b"fixture-password"))
        key = hashlib.md5(padded(b"fixture-password") + owner + pack("<i", -4) + b"synthetic-id").digest()[:5]
        user = rc4(key, padding)
        encrypt_id = len(objects) + 1
        objects.append(b"<< /Filter /Standard /V 1 /R 2 /Length 40 /P -4 /O <" + owner.hex().encode() + b"> /U <" + user.hex().encode() + b"> >>")
    data = b"%PDF-1.4\n"; offsets = [0]
    for number, obj in enumerate(objects, 1):
        offsets.append(len(data))
        data += str(number).encode() + b" 0 obj\n" + obj + b"\nendobj\n"
    xref = len(data)
    data += b"xref\n0 " + str(len(objects) + 1).encode() + b"\n0000000000 65535 f \n"
    data += b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets[1:])
    trailer = b" /Encrypt " + str(encrypt_id).encode() + b" 0 R /ID [<73796e7468657469632d6964><73796e7468657469632d6964>]" if encrypted else b""
    return data + b"trailer\n<< /Size " + str(len(objects) + 1).encode() + b" /Root 1 0 R" + trailer + b" >>\nstartxref\n" + str(xref).encode() + b"\n%%EOF\n"


def generate():
    OUT.mkdir(parents=True, exist_ok=True)
    im = image()
    im.save(OUT / "clean.png"); im.save(OUT / "clean.jpg")
    im.rotate(90, expand=True).save(OUT / "rotated.png")
    im.resize((250, 140)).resize(im.size).save(OUT / "low-quality.jpg")
    Image.new("RGB", (800, 600), "white").save(OUT / "blank.png")
    Image.new("RGB", (4001, 40), "white").save(OUT / "too-wide.png")
    Image.new("RGB", (2100, 2100), "white").save(OUT / "too-many-pixels.png")
    (OUT / "text.pdf").write_bytes(pdf(["text"]))
    (OUT / "scanned.pdf").write_bytes(pdf(["scan"]))
    (OUT / "mixed.pdf").write_bytes(pdf(["text", "scan", "text"]))
    (OUT / "too-many-pages.pdf").write_bytes(pdf(["text"] * 11))
    (OUT / "encrypted.pdf").write_bytes(pdf([], encrypted=True))
    (OUT / "corrupt.pdf").write_bytes(b"%PDF-1.4\nnot a document")
    (OUT / "unsupported.txt").write_text("Synthetic unsupported file")
    (OUT / "oversized.png").write_bytes(b"x" * (10 * 1024 * 1024 + 1))


if __name__ == "__main__":
    generate()
    print("Synthetic CV fixtures generated.")
