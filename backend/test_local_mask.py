import sys
sys.path.append('c:/Users/archi/Desktop/AI-BHARAT-2-main/AI-BHARAT-2-main/backend')
from core.pii_vault import mask_text

texts = [
    "I am Arpit from Bangalore and had vomiting after paracetamol",
    "My brother Rahul from Delhi had chest pain after aspirin",
    "Mai Bangalore se hu aur mujhe fever hai",
    "My number is 9876543210 and I feel dizzy",
    "My mom is experiencing nausea after taking jardiance."
]

for t in texts:
    masked, vmap = mask_text(t, "test")
    print(f"RAW: {t}")
    print(f"MASKED: {masked}")
    print(f"VAULT: {vmap}")
    print("-" * 40)
