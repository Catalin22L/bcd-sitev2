# pyrefly: ignore [missing-import]
from PIL import Image, ImageEnhance
import os

# Calea către folderul cu logouri
logos_folder = os.path.join('assets', 'logos')
output_folder = os.path.join('assets', 'logos', 'bright')
os.makedirs(output_folder, exist_ok=True)

# Lista fișierelor de procesat
logo_files = [
    os.path.join('logos', 'best-brasov-logo.png'),
    os.path.join('logos', 'best-brasov-logo-clean.png'),
    os.path.join('graphics', 'bcd-2026-hero-logo.png'),
    os.path.join('graphics', 'bcd-2026-hero-logo-clean.png'),
]

for logo in logo_files:
    input_path = os.path.join('assets', logo)
    output_name = f'brighter_{os.path.basename(logo)}'
    output_path = os.path.join(output_folder, output_name)
    if os.path.exists(input_path):
        img = Image.open(input_path).convert('RGBA')
        enhancer = ImageEnhance.Brightness(img)
        bright_img = enhancer.enhance(3.0)  # crește la maxim luminozitatea
        bright_img.save(output_path)
        print(f'Creat: {output_path}')
    else:
        print(f'Fișierul nu există: {input_path}')
