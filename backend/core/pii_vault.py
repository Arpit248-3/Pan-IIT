"""
AyuScout V2 — PII Vault
========================
Deterministic PII masking engine for pharmacovigilance data.
Masks Names, Phone Numbers, Emails, and Addresses while
preserving medical terminology (drug names, symptoms, MedDRA terms).

Uses regex-based detection (lightweight, no NER model download needed).
Interface is compatible with Presidio for future upgrade.
"""

import re
import hashlib
from typing import Tuple


# Medical terms whitelist — these should NEVER be masked
MEDICAL_WHITELIST = {
    # Common drugs
    "metformin", "lisinopril", "atorvastatin", "insulin", "omeprazole",
    "amoxicillin", "ibuprofen", "aspirin", "paracetamol", "acetaminophen",
    "warfarin", "clopidogrel", "amlodipine", "losartan", "hydrochlorothiazide",
    "simvastatin", "gabapentin", "tramadol", "prednisone", "levothyroxine",
    "ciprofloxacin", "azithromycin", "pantoprazole", "sertraline", "fluoxetine",
    "diazepam", "alprazolam", "morphine", "codeine", "naproxen",
    # Common adverse events / symptoms
    "nausea", "dizziness", "headache", "rash", "angioedema", "vomiting",
    "diarrhea", "fatigue", "insomnia", "anxiety", "depression", "seizure",
    "tachycardia", "bradycardia", "hypotension", "hypertension", "edema",
    "hepatotoxicity", "nephrotoxicity", "anaphylaxis", "dyspnea", "cough",
    "myalgia", "arthralgia", "pruritus", "urticaria", "alopecia",
    "thrombocytopenia", "neutropenia", "pancytopenia", "hyperglycemia",
    "hypoglycemia", "swelling", "metallic", "taste",
    # Medical terms
    "mg", "ml", "tablet", "capsule", "injection", "oral", "iv", "bp",
    "blood", "pressure", "sugar", "cholesterol", "liver", "kidney",
    "heart", "lung", "brain", "stomach", "intestine",
}


class PIIVault:
    """
    Deterministic PII masking engine.
    
    Masks PII entities and replaces them with unique identifiers.
    Maintains a vault dictionary for authorized de-masking.
    """
    
    def __init__(self):
        self._counter = {"USER": 0, "PHONE": 0, "EMAIL": 0, "ADDR": 0}
    
    def _generate_token(self, category: str) -> str:
        """Generate a unique token like [USER_452]."""
        self._counter[category] += 1
        return f"[{category}_{self._counter[category]:03d}]"
    
    def _is_medical_term(self, text: str) -> bool:
        """Check if a word/phrase is in the medical whitelist."""
        return text.lower().strip() in MEDICAL_WHITELIST
    
    def mask(self, text: str) -> Tuple[str, dict]:
        """
        Mask PII in text, preserving medical terms.
        
        Returns:
            tuple: (masked_text, vault_map) where vault_map maps tokens to originals
        """
        vault_map = {}
        masked_text = text
        
        # --- 1. Mask Email Addresses ---
        email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        for match in re.finditer(email_pattern, masked_text):
            original = match.group()
            token = self._generate_token("EMAIL")
            vault_map[token] = original
            masked_text = masked_text.replace(original, token, 1)
        
        # --- 2. Mask Phone Numbers ---
        phone_patterns = [
            r'\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}',  # International
            r'\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}',  # US format
            r'\b\d{10}\b',  # 10-digit
        ]
        for pattern in phone_patterns:
            for match in re.finditer(pattern, masked_text):
                original = match.group()
                # Skip if it's already been masked or is too short
                if '[' in original or len(original.replace(' ', '').replace('-', '')) < 7:
                    continue
                token = self._generate_token("PHONE")
                vault_map[token] = original
                masked_text = masked_text.replace(original, token, 1)
        
        # --- 3. Mask Street Addresses ---
        addr_pattern = r'\d{1,5}\s+(?:[A-Z][a-z]+\s*){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Place|Pl)\.?'
        for match in re.finditer(addr_pattern, masked_text):
            original = match.group()
            token = self._generate_token("ADDR")
            vault_map[token] = original
            masked_text = masked_text.replace(original, token, 1)
        
        # --- 4. Mask Person Names (Capitalized word sequences, skip medical terms) ---
        # Pattern: Two or more consecutive capitalized words that aren't at sentence start
        name_pattern = r'(?:(?<=\s)|(?<=,)|(?<=^))([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)'
        for match in re.finditer(name_pattern, masked_text):
            original = match.group().strip()
            # Skip if any word is a medical term
            words = original.split()
            if any(self._is_medical_term(w) for w in words):
                continue
            # Skip if already contains a mask token
            if '[' in original:
                continue
            token = self._generate_token("USER")
            vault_map[token] = original
            masked_text = masked_text.replace(original, token, 1)
        
        # --- 5. Mask standalone ages like "age 45" or "45 years old" ---
        age_pattern = r'\b(?:age\s+)?(\d{1,3})\s*(?:years?\s*old|y/?o)\b'
        for match in re.finditer(age_pattern, masked_text, re.IGNORECASE):
            original = match.group()
            masked_text = masked_text.replace(original, "[AGE_REDACTED]", 1)
        
        return masked_text, vault_map
    
    def unmask(self, masked_text: str, vault_map: dict) -> str:
        """
        Reverse the masking process using the vault map.
        For authorized audit trails only.
        
        Args:
            masked_text: Text containing mask tokens
            vault_map: Dictionary mapping tokens to original values
            
        Returns:
            str: Original text with PII restored
        """
        result = masked_text
        for token, original in vault_map.items():
            result = result.replace(token, original)
        return result
    
    def get_vault_hash(self, vault_map: dict) -> str:
        """Generate a SHA-256 hash of the vault map for integrity verification."""
        content = str(sorted(vault_map.items()))
        return hashlib.sha256(content.encode()).hexdigest()


# Module-level singleton for convenience
_default_vault = PIIVault()

def mask_text(text: str) -> Tuple[str, dict]:
    """Convenience function using the default vault instance."""
    return _default_vault.mask(text)

def unmask_text(masked_text: str, vault_map: dict) -> str:
    """Convenience function using the default vault instance."""
    return _default_vault.unmask(masked_text, vault_map)
