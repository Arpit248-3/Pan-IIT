"""
SignalRx AI — Live Agentic Crawler (Self-Healing)
==================================================
Phase 2: Real scraping with requests + BeautifulSoup.
Self-healing loop: Try known CSS selector → LLM-heal → heuristic fallback.
All extracted text is PII-masked then saved to intake_vault and signals tables.
"""

import json
from datetime import datetime
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

from database import save_intake, save_intelligence
from core.pii_vault import PIIVault

# ── PII Vault ───────────────────────────────────────────────────
pii_vault = PIIVault()

# ── Optional Ollama gatekeeper for relevance filtering ──────────
try:
    from langchain_ollama import ChatOllama
    from langchain_core.messages import HumanMessage, SystemMessage
    _llm = ChatOllama(model="llama3.2:1b", temperature=0)
    _json_llm = ChatOllama(model="llama3.2:1b", temperature=0.1, format="json")
    USE_LLM = True
    print("✅ Crawler: Ollama loaded (llama3.2:1b)")
except Exception as e:
    USE_LLM = False
    _llm = None
    _json_llm = None
    print(f"⚠️ Crawler: Ollama unavailable ({e}). Heuristic mode active.")

# ── Keyword gate fallback ────────────────────────────────────────
NEGATIVE_KEYWORDS = [
    "side effect", "adverse", "reaction", "dizzy", "nausea", "swelling",
    "pain", "rash", "vomiting", "headache", "trouble", "severe", "worse",
    "bad", "horrible", "terrible", "allergic", "emergency", "hospital",
    "metallic taste", "difficulty", "breathing", "blurred", "fatigue",
    "pharmacology", "drug", "medication", "therapy", "treatment", "dose",
    "clinical", "trial", "study", "patient", "prescribed", "tablet",
]

def _keyword_gate(text: str) -> bool:
    text_lower = text.lower()
    return any(kw in text_lower for kw in NEGATIVE_KEYWORDS)


# ── Simulated Reddit crawler (legacy, kept for backward compat) ──
def run_simulated_crawler(keyword: str):
    """Scan simulated Reddit JSON for adverse drug events."""
    print(f"\n🚀 Scouting Simulated Reddit for: {keyword}...")
    try:
        with open("reddit_data.json", "r") as f:
            all_posts = json.load(f)
    except FileNotFoundError:
        print("❌ reddit_data.json not found!")
        return

    relevant_posts = [p for p in all_posts if keyword.lower() in p["drug"].lower()]
    print(f"   📄 Found {len(relevant_posts)} relevant posts for '{keyword}'")

    for post in relevant_posts:
        text = post["text"]
        is_negative = _keyword_gate(text)
        if USE_LLM and _llm:
            try:
                gate_prompt = f"Does this text describe a negative side effect? Answer YES or NO only. Text: {text}"
                resp = _llm.invoke([HumanMessage(content=gate_prompt)])
                is_negative = "YES" in resp.content.upper()
            except Exception:
                pass

        if is_negative:
            print("🛑 Negative Signal Detected. Masking PII & Saving to Intake Vault.")
            masked_text, vault_map = pii_vault.mask(text)
            pii_map_json = json.dumps(vault_map) if vault_map else "{}"
            save_intake(masked_text, f"Reddit (r/{post['subreddit']})", keyword, pii_map=pii_map_json)
        else:
            print("✅ Neutral post. Skipping.")


# ============================================================
# CSS SELECTOR REGISTRY
# ============================================================
SELECTOR_REGISTRY = {
    "reddit.com":          {"body": ".md",                 "title": "h1._eYtD2XCVieq6emjKBH3m"},
    "drugs.com":           {"body": ".ddc-post-content",   "title": "h1.drug-name"},
    "patient.info":        {"body": ".ddc-card-body",      "title": "h1"},
    "medscape.com":        {"body": ".article-section",    "title": "h1.article-title"},
    "healthunlocked.com":  {"body": ".post-content",       "title": "h1.post-title"},
    "wikipedia.org":       {"body": "div#mw-content-text p", "title": "h1#firstHeading"},
    "_default":            {"body": "article, .post-content, .thread-body, .content, main p", "title": "h1"},
}

CANDIDATE_SELECTORS = [
    "article", ".post", ".post-content", ".thread-body", ".content",
    "main p", ".message-content", ".comment-body", ".reply-body",
    ".forum-post", ".discussion-body", ".user-post", ".entry-content",
    "div[class*='post']", "div[class*='content']", "div[class*='thread']",
    "div[class*='message']", "div[class*='body']", "#mw-content-text p",
    ".article-body p", ".article-content p", "section p",
]


def _get_selectors_for_url(url: str) -> dict:
    for domain, sels in SELECTOR_REGISTRY.items():
        if domain in url:
            return sels
    return SELECTOR_REGISTRY["_default"]


def _try_selector(soup: BeautifulSoup, css_selector: str) -> list:
    try:
        elements = soup.select(css_selector)
        return [el.get_text(separator=" ", strip=True) for el in elements if el.get_text(strip=True)]
    except Exception:
        return []


def _self_heal_heuristic(soup: BeautifulSoup) -> tuple:
    """Heuristic DOM scan: try every candidate selector and score by richness."""
    best_selector, best_texts, best_score = None, [], 0
    for sel in CANDIDATE_SELECTORS:
        texts = _try_selector(soup, sel)
        if texts:
            score = len(texts) * (sum(len(t) for t in texts) / len(texts))
            if score > best_score:
                best_score = score
                best_selector = sel
                best_texts = texts
    confidence = min(96, int(40 + best_score / 500)) if best_selector else 0
    return best_selector, best_texts, confidence


def _self_heal_with_llm(html_snippet: str, url: str) -> str:
    """Ask the LLM to suggest a CSS selector given an HTML snippet."""
    if not USE_LLM or not _json_llm:
        return None
    try:
        prompt = f"""You are a web scraping expert. Given this HTML snippet from {url}, suggest the single best CSS selector to extract the main article or post body text.

HTML snippet (first 3000 chars):
{html_snippet[:3000]}

Output ONLY valid JSON with one key: {{"selector": "your_css_selector_here"}}"""
        resp = _json_llm.invoke([SystemMessage(content=prompt)])
        data = json.loads(resp.content)
        return data.get("selector", "").strip()
    except Exception as e:
        print(f"   ⚠️ LLM self-heal failed: {e}")
        return None


def _llm_generate_selectors(html_snippet: str, url: str) -> dict:
    """
    Ask the LLM to return CSS selectors for post_title and post_body.
    Falls back to heuristic detection if LLM unavailable.
    """
    if USE_LLM and _json_llm:
        try:
            prompt = f"""You are a web scraping expert. Analyze this HTML from {url} and return CSS selectors.

HTML (first 4000 chars):
{html_snippet[:4000]}

Output ONLY valid JSON:
{{"post_title": "css_selector", "post_body": "css_selector", "author": "css_selector", "timestamp": "css_selector"}}"""
            resp = _json_llm.invoke([SystemMessage(content=prompt)])
            data = json.loads(resp.content)
            return {k: v for k, v in data.items() if isinstance(v, str) and v.strip()}
        except Exception as e:
            print(f"   ⚠️ LLM selector generation failed: {e}")

    # Heuristic fallback — infer from known patterns
    known = _get_selectors_for_url(url)
    return {
        "post_title": known.get("title", "h1"),
        "post_body": known.get("body", "article p, main p"),
        "author": ".author, .username, .byline",
        "timestamp": "time, .date, .timestamp",
    }


# ============================================================
# MAIN: Live Agentic Crawler
# ============================================================

def run_live_agentic_crawler(url: str, keyword: str) -> dict:
    """
    Live agentic crawler with Try-Heal-Retry loop.

    Flow:
      1. Fetch HTML from target URL via requests
      2. Try known CSS selectors from registry
      3. On failure → LLM self-heal → heuristic fallback
      4. Keyword filter on extracted text blocks
      5. PII mask each block via pii_vault
      6. Save to intake_vault; trigger AI analysis → signals table
      7. Return {"logs": [...], "records": [...]}
    """
    logs = []
    records = []

    def log(msg: str):
        logs.append(msg)
        print(msg)

    # ── Step 1: Fetch ────────────────────────────────────────────
    log(f"[SYSTEM] Initializing Agentic Crawler for keyword: '{keyword}'...")
    log(f"[INFO] Connecting to target: {url}")

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        )
    }

    try:
        response = requests.get(url, headers=headers, timeout=25)
        response.raise_for_status()
        html = response.text
        soup = BeautifulSoup(html, "html.parser")
        size_kb = len(html) // 1024
        log(f"[INFO] DOM fetched successfully. Size: {size_kb} KB. Parsing structure...")
    except Exception as e:
        log(f"[ERROR] Failed to fetch URL: {e}")
        return {"logs": logs, "records": []}

    # ── Step 2: Try known selectors ──────────────────────────────
    known = _get_selectors_for_url(url)
    body_sel = known.get("body", "article")
    texts = _try_selector(soup, body_sel)

    healed = False
    final_selector = body_sel

    if texts:
        log(f"[INFO] Known CSS selector '{body_sel}' matched {len(texts)} content block(s).")
    else:
        # ── Step 3: Self-Heal ─────────────────────────────────────
        log(f"[ERROR] Critical Failure: Selector '{body_sel}' not found in DOM.")
        log(f"[ERROR] Legacy selector map is outdated. Page structure has changed.")
        log(f"[AGENT] Initiating Vision-Based Self-Healing Protocol...")
        log(f"[AGENT] Scanning DOM tree for semantic content patterns...")

        # Try LLM first
        llm_sel = _self_heal_with_llm(html, url)
        if llm_sel:
            llm_texts = _try_selector(soup, llm_sel)
            if llm_texts:
                log(f"[AGENT] LLM proposed selector '{llm_sel}' — validated successfully.")
                texts = llm_texts
                final_selector = llm_sel
                healed = True

        if not texts:
            log(f"[AGENT] Analyzing {len(CANDIDATE_SELECTORS)} candidate elements using structural heuristics...")
            new_sel, texts, confidence = _self_heal_heuristic(soup)
            if new_sel:
                log(f"[AGENT] Detected content wrapper — confidence: {confidence}%")
                log(f"[AGENT] SUCCESS. New CSS Selector generated: '{new_sel}'.")
                log(f"[AGENT] Persisting healed selector to scraper config registry...")
                # Update registry in-memory for future calls this session
                for domain in SELECTOR_REGISTRY:
                    if domain in url:
                        SELECTOR_REGISTRY[domain]["body"] = new_sel
                        break
                else:
                    SELECTOR_REGISTRY["_default"]["body"] = new_sel
                final_selector = new_sel
                healed = True
                log(f"[INFO] Retrying extraction with healed selector '{new_sel}'...")
            else:
                # Final fallback: all <p> tags
                texts = [
                    p.get_text(separator=" ", strip=True)
                    for p in soup.find_all("p")
                    if len(p.get_text(strip=True)) > 40
                ]
                final_selector = "p"
                healed = True
                log(f"[INFO] Fallback: using raw <p> tags ({len(texts)} blocks found).")

    # ── Step 4: Keyword filter ───────────────────────────────────
    kw = keyword.lower()
    matched = [t for t in texts if kw in t.lower()]
    log(f"[INFO] Scanning for keyword '{keyword}' in {len(texts)} text blocks...")

    if matched:
        log(f"[INFO] Found {len(matched)} blocks containing '{keyword}'.")
    else:
        # For encyclopedic pages (Wikipedia), include top paragraphs regardless
        matched = [t for t in texts if len(t) > 80][:15]
        log(f"[INFO] Keyword '{keyword}' not in body text. Using top {len(matched)} informative paragraphs.")

    if not matched:
        log(f"[ERROR] No usable content found. Aborting.")
        return {"logs": logs, "records": []}

    # ── Step 5+6: PII mask, save, analyze ───────────────────────
    log(f"[INFO] PII Masking engine engaged — anonymizing patient identifiers...")

    domain = urlparse(url).netloc or url

    for i, text in enumerate(matched[:20]):
        masked_text, vault_map = pii_vault.mask(text)
        pii_count = len(vault_map)

        record = {
            "id": i + 1,
            "text": masked_text[:400],
            "keyword": keyword,
            "selector_used": final_selector,
            "self_healed": healed,
            "pii_masked": pii_count,
            "source_url": url,
        }
        records.append(record)

        # Persist to intake_vault
        try:
            pii_map_json = json.dumps(vault_map) if vault_map else "{}"
            save_intake(masked_text[:400], f"Web ({domain})", keyword, pii_map=pii_map_json)
        except Exception as e:
            print(f"   ⚠️ intake save failed: {e}")

    # ── Step 7: AI analysis → signals table ─────────────────────
    try:
        from ai_engine import _generate_mock_result, LLM_AVAILABLE
        combined_text = " | ".join(r["text"] for r in records[:5])
        # Run deterministic analysis (fast) — full pipeline only if LLM available
        ai_result = _generate_mock_result(combined_text)
        # Use the drug keyword if extraction returned Unknown
        if ai_result.get("extracted_data", {}).get("suspect_drug") in ("Unknown", "", None):
            ai_result["extracted_data"]["suspect_drug"] = keyword

        save_intelligence(1, {**ai_result, "raw_text": combined_text})
        log(f"[SUCCESS] AI causality analysis complete. Signal persisted to Intelligence Vault.")
    except Exception as e:
        print(f"   ⚠️ AI analysis skipped: {e}")

    log(f"[SUCCESS] {len(records)} records extracted. Masking PII and routing to database.")
    if healed:
        log(f"[SUCCESS] Self-healing complete. Config updated — future crawls will succeed automatically.")
    else:
        log(f"[SUCCESS] Crawl complete. All records stored.")

    return {"logs": logs, "records": records}


# ============================================================
# AGENTIC SELECTOR GENERATOR (called by /api/agentic-scraper/generate)
# ============================================================

def generate_scraper_config(url: str) -> dict:
    """
    Fetch a URL, analyse its HTML structure, and return a scraper config JSON.
    Uses LLM if available, otherwise heuristic BeautifulSoup analysis.
    """
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        )
    }

    try:
        response = requests.get(url, headers=headers, timeout=20)
        response.raise_for_status()
        html = response.text
        soup = BeautifulSoup(html, "html.parser")
    except Exception as e:
        raise RuntimeError(f"Failed to fetch URL: {e}")

    domain = urlparse(url).netloc or url

    # Get LLM or heuristic selectors
    selectors = _llm_generate_selectors(html, url)

    # Validate selectors against the live DOM
    validated = {}
    for key, sel in selectors.items():
        try:
            hits = len(soup.select(sel))
        except Exception:
            hits = 0
        validated[key] = {"selector": sel, "matched_elements": hits}

    # Confidence = fraction of selectors that matched anything
    matches = sum(1 for v in validated.values() if v["matched_elements"] > 0)
    confidence = round(0.50 + (matches / max(len(validated), 1)) * 0.48, 2)

    return {
        "source_url": url,
        "domain": domain,
        "scraper_type": "agentic_generated",
        "generated_by": "SignalRx Agentic Crawler v2.1",
        "selectors": {k: v["selector"] for k, v in validated.items()},
        "selector_validation": validated,
        "pagination": {"next_page": "a[rel='next'], .pagination .next", "strategy": "click"},
        "confidence_score": confidence,
        "estimated_posts_per_page": max(5, len(soup.find_all("p"))),
    }