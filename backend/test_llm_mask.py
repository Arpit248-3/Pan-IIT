import json
import os
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage
from dotenv import load_dotenv

load_dotenv()

llm = ChatGoogleGenerativeAI(
    model="gemini-1.5-flash",
    temperature=0,
    google_api_key=os.environ.get("GOOGLE_API_KEY")
)

def extract_pii(text):
    prompt = f"""
Extract all Personally Identifiable Information (PII) from the following text.
PII includes: Person names, Addresses, Cities, Locations, Phone numbers, Emails, IDs, Hospital names, Organization names, Relatives (e.g., "my brother", "my uncle", "my mom").
DO NOT extract medical conditions, symptoms, medications, or side effects.

Return ONLY a valid JSON dictionary mapping the exact substring from the text to its entity type.
Example:
{{"Arpit": "PERSON", "Bangalore": "LOCATION", "9876543210": "PHONE", "my brother": "RELATION"}}

Text: "{text}"
"""
    res = llm.invoke([HumanMessage(content=prompt)])
    content = res.content.replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(content)
    except:
        return {}

texts = [
    "I am Arpit from Bangalore and had vomiting after paracetamol",
    "My brother Rahul from Delhi had chest pain after aspirin",
    "Mai Bangalore se hu aur mujhe fever hai",
    "My number is 9876543210 and I feel dizzy"
]

for t in texts:
    print("INPUT:", t)
    print("PII:", extract_pii(t))
    print()
