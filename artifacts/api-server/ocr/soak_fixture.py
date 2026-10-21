"""Create one maximum-pixel, synthetic-only image for repeatable OCR load checks."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parents[3] / "generated-artifacts" / "cv-ocr-soak.png"
WIDTH = HEIGHT = 2000


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGB", (WIDTH, HEIGHT), "white")
    draw = ImageDraw.Draw(image)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 39)
    except OSError:
        font = ImageFont.load_default(size=39)
    lines = [
        "SYNTHETIC CV SOAK TEST",
        "Business Analytics Graduate",
        "Skills: Python SQL Excel Power BI",
        "Built a sales dashboard for a fictional retailer",
        "Education: Sample University 2025",
    ]
    for index in range(24):
        draw.text((95, 60 + index * 78), lines[index % len(lines)], font=font, fill="black")
        if index % 4 == 3:
            draw.line((90, 60 + index * 78 + 58, 1880, 60 + index * 78 + 58), fill="#dddddd", width=2)
    image.save(OUT, format="PNG", optimize=True)
    print(OUT)


if __name__ == "__main__":
    main()
