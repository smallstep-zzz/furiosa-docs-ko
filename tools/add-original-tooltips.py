"""Pair translated prose with the matching upstream Sphinx HTML release (requires bs4)."""
import argparse
from collections import defaultdict
from pathlib import Path
import os
import re

from bs4 import BeautifulSoup


def blocks(document):
    sections = defaultdict(list)
    for node in document.select("article p, article li, article dd, article dt, article th, article td, article h1, article h2, article h3, article h4, article h5, article h6, article figcaption"):
        if node.find_parent(["pre", "code"]) or node.find(["p", "li", "dd", "dt", "pre", "ul", "ol"]):
            continue
        if not node.get_text(strip=True):
            continue
        section = node.find_parent("section", id=True)
        sections[section["id"] if section else ""].append(node)
    return sections


def prose(node):
    return " ".join("".join(
        str(text) for text in node.strings if not text.find_parent(class_="headerlink")
    ).split())


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("original", type=Path)
parser.add_argument("--write", action="store_true")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
page_count = pair_count = 0
for page in sorted(root.rglob("*.html")):
    relative = page.relative_to(root)
    if relative.parts[0].startswith(("_", ".")) or relative.name in ("search.html", "genindex.html"):
        continue
    original = args.original / relative
    if not original.is_file():
        print(f"Missing original: {relative}")
        continue
    translated = BeautifulSoup(page.read_text(), "html.parser")
    source = blocks(BeautifulSoup(original.read_text(), "html.parser"))
    pairs = 0
    for section, nodes in blocks(translated).items():
        originals = source.get(section, [])
        # The Korean landing page has a site-local translation notice.
        nodes = [node for node in nodes if not prose(node).startswith("번역 진행 안내") and not node.find_parent(class_="translation-notice")]
        if [node.name for node in nodes] != [node.name for node in originals]:
            print(f"Layout differs: {relative}#{section} ({len(nodes)} / {len(originals)})")
            continue
        for node, original_node in zip(nodes, originals):
            english = prose(original_node)
            if re.search(r"[가-힣]", prose(node)) and english and prose(node) != english:
                node["data-original-en"] = english
                pairs += 1
    if not pairs:
        continue
    page_count += 1
    pair_count += pairs
    if args.write:
        for tag in translated.select("[data-original-tooltip-asset]"):
            tag.decompose()
        prefix = os.path.relpath(root / "_static", page.parent)
        translated.head.append(translated.new_tag("link", rel="stylesheet", href=f"{prefix}/original-tooltip.css?v=1", attrs={"data-original-tooltip-asset": ""}))
        translated.head.append(translated.new_tag("script", src=f"{prefix}/original-tooltip.js?v=1", defer="", attrs={"data-original-tooltip-asset": ""}))
        page.write_text(str(translated))
print(f"{page_count} pages, {pair_count} translated blocks")
