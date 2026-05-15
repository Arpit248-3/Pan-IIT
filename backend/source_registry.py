"""
AyuScout V2 — Source Registry
==============================
Centralized, extensible definition of all crawlable sources.
Each entry defines how to discover, fetch, and parse content.
Adding new sources requires only a new dict entry here.
"""

from typing import Optional

# ── Source Registry ──────────────────────────────────────────────────────────
# Each source specifies:
#   id             : machine key (used in project sources_json)
#   name           : display name
#   base_url       : template URL — {keyword} is substituted at crawl time
#   category       : drug_reviews | forum | encyclopedia | social | news | clinical
#   requires_browser: needs Playwright/JS rendering
#   supports_pagination: has multiple pages to iterate
#   supports_search: can filter by keyword in URL
#   content_selectors: CSS selectors tried in priority order (Layer 1)
#   fallback_strategy: semantic | heuristic | full_text
#   rate_limit_secs: minimum seconds between requests to this source
#   enabled        : can be toggled without code change
#   source_icon    : matches SourceIcon component keys

SOURCE_REGISTRY: list[dict] = [
    {
        "id": "drugs_com",
        "name": "Drugs.com",
        "base_url": "https://www.drugs.com/comments/{keyword}/",
        "category": "drug_reviews",
        "requires_browser": False,
        "supports_pagination": True,
        "supports_search": True,
        "content_selectors": [
            ".ddc-comment__content",
            ".comment-text",
            ".ddc-post-content",
            "div[class*='comment']",
            "div[class*='review']",
        ],
        "title_selectors": ["h1.drug-name", "h1", ".page-title"],
        "fallback_strategy": "semantic",
        "rate_limit_secs": 3,
        "enabled": True,
        "source_icon": "drugs",
    },
    {
        "id": "webmd",
        "name": "WebMD",
        "base_url": "https://www.webmd.com/drugs/drugreview-{keyword}.aspx",
        "category": "drug_reviews",
        "requires_browser": False,
        "supports_pagination": True,
        "supports_search": True,
        "content_selectors": [
            ".review-details-holder",
            ".user-review",
            ".drug-review",
            "div[class*='review']",
            "div[class*='comment']",
        ],
        "title_selectors": ["h1.drug-name", "h1"],
        "fallback_strategy": "semantic",
        "rate_limit_secs": 3,
        "enabled": True,
        "source_icon": "webmd",
    },
    {
        "id": "reddit",
        "name": "Reddit",
        "base_url": "https://www.reddit.com/search/?q={keyword}+side+effects&type=link&sort=new",
        "category": "forum",
        "requires_browser": False,
        "supports_pagination": True,
        "supports_search": True,
        "content_selectors": [
            ".md",
            "[data-click-id='text']",
            "div[data-testid='post-content']",
            ".usertext-body",
            "div[class*='PostBody']",
        ],
        "title_selectors": ["h1._eYtD2XCVieq6emjKBH3m", "h1"],
        "fallback_strategy": "semantic",
        "rate_limit_secs": 2,
        "enabled": True,
        "source_icon": "reddit",
    },
    {
        "id": "patient_info",
        "name": "Patient.info",
        "base_url": "https://patient.info/forums/discuss/{keyword}-side-effects",
        "category": "forum",
        "requires_browser": False,
        "supports_pagination": True,
        "supports_search": False,
        "content_selectors": [
            ".post-body",
            ".forum-post-body",
            ".post-content",
            "div[class*='post']",
            "article",
        ],
        "title_selectors": ["h1"],
        "fallback_strategy": "semantic",
        "rate_limit_secs": 3,
        "enabled": True,
        "source_icon": "patient",
    },
    {
        "id": "healthboards",
        "name": "HealthBoards",
        "base_url": "https://www.healthboards.com/boards/search.php?searchid=&query={keyword}&action=dosearch",
        "category": "forum",
        "requires_browser": False,
        "supports_pagination": True,
        "supports_search": True,
        "content_selectors": [
            ".post-message",
            "div.content",
            "td.post",
            "div[class*='message']",
        ],
        "title_selectors": ["h1"],
        "fallback_strategy": "heuristic",
        "rate_limit_secs": 4,
        "enabled": True,
        "source_icon": "forum",
    },
    {
        "id": "askapatient",
        "name": "AskaPatient",
        "base_url": "https://www.askapatient.com/search?query={keyword}",
        "category": "drug_reviews",
        "requires_browser": False,
        "supports_pagination": True,
        "supports_search": True,
        "content_selectors": [
            ".review-text",
            ".patient-comment",
            "div[class*='review']",
            "p.rating-comment",
        ],
        "title_selectors": ["h1"],
        "fallback_strategy": "semantic",
        "rate_limit_secs": 3,
        "enabled": True,
        "source_icon": "forum",
    },
    {
        "id": "wikipedia",
        "name": "Wikipedia",
        "base_url": "https://en.wikipedia.org/wiki/{keyword}",
        "category": "encyclopedia",
        "requires_browser": False,
        "supports_pagination": False,
        "supports_search": False,
        "content_selectors": [
            "#mw-content-text p",
            "div.mw-parser-output p",
        ],
        "title_selectors": ["h1#firstHeading"],
        "fallback_strategy": "full_text",
        "rate_limit_secs": 1,
        "enabled": True,
        "source_icon": "wikipedia",
    },
    {
        "id": "dailymed",
        "name": "DailyMed",
        "base_url": "https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query={keyword}&pagesize=20",
        "category": "clinical",
        "requires_browser": False,
        "supports_pagination": True,
        "supports_search": True,
        "content_selectors": [
            "div.field-items",
            ".drug-label-sections p",
            "section.section p",
        ],
        "title_selectors": ["h1", ".drug-name"],
        "fallback_strategy": "full_text",
        "rate_limit_secs": 2,
        "enabled": True,
        "source_icon": "clinical",
    },
    {
        "id": "twitter",
        "name": "X / Twitter",
        "base_url": "twitter",  # Special — handled by TwitterAPI.io engine
        "category": "social",
        "requires_browser": False,
        "supports_pagination": True,
        "supports_search": True,
        "content_selectors": [],  # API-based, no DOM scraping
        "title_selectors": [],
        "fallback_strategy": "api",
        "rate_limit_secs": 1,
        "enabled": True,
        "source_icon": "twitter",
    },
    {
        "id": "generic_web",
        "name": "Generic Website",
        "base_url": "{custom_url}",  # Uses project source_url
        "category": "custom",
        "requires_browser": False,
        "supports_pagination": False,
        "supports_search": False,
        "content_selectors": [
            "article",
            "main p",
            ".post-content p",
            ".content p",
            ".article-body p",
            ".entry-content p",
            "section p",
            "div[class*='content'] p",
            "div[class*='article'] p",
        ],
        "title_selectors": ["h1"],
        "fallback_strategy": "semantic",
        "rate_limit_secs": 2,
        "enabled": True,
        "source_icon": "globe",
    },
]

# ── Lookup helpers ────────────────────────────────────────────────────────────

_REGISTRY_MAP: dict[str, dict] = {s["id"]: s for s in SOURCE_REGISTRY}


def get_source(source_id: str) -> Optional[dict]:
    """Return a source definition by ID, or None if not found."""
    return _REGISTRY_MAP.get(source_id)


def get_enabled_sources() -> list[dict]:
    """Return all enabled sources."""
    return [s for s in SOURCE_REGISTRY if s.get("enabled")]


def get_sources_for_ids(source_ids: list[str]) -> list[dict]:
    """Return source definitions for a list of IDs (skips unknown/disabled)."""
    result = []
    for sid in source_ids:
        src = _REGISTRY_MAP.get(sid)
        if src and src.get("enabled"):
            result.append(src)
    return result


def build_crawl_url(source: dict, keyword: str, custom_url: str = "") -> str:
    """
    Build the concrete crawl URL for a given source + keyword.
    Handles the {keyword} template substitution.
    """
    template = source.get("base_url", "")
    kw_slug = keyword.lower().replace(" ", "-")

    if template == "{custom_url}":
        return custom_url or ""
    if template == "twitter":
        return "twitter"  # signal for API-based engine

    # Replace template placeholders
    url = template.replace("{keyword}", kw_slug)
    return url


def list_all_source_ids() -> list[str]:
    """Return all source IDs for use in dropdown menus, wizards etc."""
    return [s["id"] for s in SOURCE_REGISTRY]


def get_source_display_name(source_id: str) -> str:
    """Safe display-name lookup with fallback."""
    src = _REGISTRY_MAP.get(source_id)
    return src["name"] if src else source_id.replace("_", " ").title()
