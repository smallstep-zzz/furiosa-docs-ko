#!/usr/bin/env python3
"""Check complete translation coverage, source fidelity and all static links."""
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import unquote, urlsplit

from bs4 import BeautifulSoup
from markdown_it import MarkdownIt
from mdit_py_plugins.dollarmath import dollarmath_plugin

from prepare import ROOT

MD = MarkdownIt('commonmark', {'html': True}).enable('table').use(dollarmath_plugin)


def protected(value):
    result = []
    for token in MD.parseInline(value)[0].children or []:
        if token.type in {'code_inline', 'math_inline', 'math_inline_double'}:
            result.append((token.type, token.content))
        elif token.type in {'link_open', 'image'}:
            result.append((token.type, token.attrGet('href') or token.attrGet('src')))
    return Counter(result)


def main():
    manifest = json.loads((ROOT / 'content/manifest.json').read_text())
    errors = []
    unit_count = 0
    for page in manifest['pages']:
        key = page['key']
        units = json.loads((ROOT / 'content/units' / (key + '.json')).read_text())
        translated = json.loads((ROOT / 'content/ko' / (key + '.json')).read_text())
        source_ids = {u['id'] for u in units}
        if source_ids != set(translated):
            errors.append(f'{key}: translation ID mismatch')
        unit_count += len(units)
        for unit in units:
            result = translated.get(unit['id'], '')
            if unit['text'].strip() and not result.strip():
                errors.append(f'{key} {unit["id"]}: empty translation')
            if unit['kind'] == 'prose' and protected(unit['text']) != protected(result):
                errors.append(f'{key} {unit["id"]}: inline code, math or link changed')
            if unit['kind'] == 'comment' and unit['text'].endswith('\n') != result.endswith('\n'):
                errors.append(f'{key} {unit["id"]}: comment newline changed')

    doccomments = json.loads((ROOT / 'content/doc-comments.json').read_text())
    for original, translated in doccomments.items():
        if original.endswith('\n') != translated.endswith('\n'):
            errors.append('Documentation-comment newline changed')
        # A Korean sentence may move an identifier across adjacent /// lines.
        # build.py verifies the full comment stream within each code block.

    files = sorted(ROOT.rglob('*.html'))
    soups = {p.resolve(): BeautifulSoup(p.read_text(), 'html.parser') for p in files}
    known_ids = {path: {tag.get('id') for tag in soup.select('[id]')} for path, soup in soups.items()}
    links, tooltips = 0, 0
    for path, soup in soups.items():
        label = path.relative_to(ROOT).as_posix()
        ids = [tag['id'] for tag in soup.select('[id]')]
        duplicates = [key for key, count in Counter(ids).items() if count > 1]
        if duplicates:
            errors.append(f'{label}: duplicate IDs {duplicates}')
        if '{{#include' in path.read_text():
            errors.append(f'{label}: unresolved mdBook include')
        for trigger in soup.select('[data-original]'):
            tooltips += 1
            if not soup.find('template', id=trigger['data-original']):
                errors.append(f'{label}: missing English template {trigger["data-original"]}')
        for node in soup.select('a[href],link[href],script[src],img[src]'):
            url = node.get('href') or node.get('src')
            parts = urlsplit(url)
            if parts.scheme or parts.netloc:
                continue
            links += 1
            target = (path.parent / unquote(parts.path)).resolve() if parts.path else path
            if target.is_dir():
                target = target / 'index.html'
            if not target.exists():
                errors.append(f'{label}: missing path {url}')
                continue
            if parts.fragment and target.suffix == '.html':
                if target not in known_ids:
                    known_ids[target] = {tag.get('id') for tag in BeautifulSoup(target.read_text(), 'html.parser').select('[id]')}
                if unquote(parts.fragment) not in known_ids[target]:
                    errors.append(f'{label}: missing anchor {url}')
    code = json.loads((ROOT / 'content/code-verification.json').read_text())
    code_fences = sum(len(v) for v in code.values())
    docs_instances = sum(item['documentation_comments'] for values in code.values() for item in values)
    if not all(item['code_unchanged'] for values in code.values() for item in values):
        errors.append('Executable-code verification failed')
    report = {
        'source_commit': manifest['commit'], 'html_pages': len(files),
        'documents_in_upstream_summary': sum(not p.get('appendix') and not p.get('stub') for p in manifest['pages']),
        'appendices': sum(bool(p.get('appendix')) for p in manifest['pages']),
        'short_draft_pages': sum(bool(p.get('stub')) for p in manifest['pages']),
        'translation_units': unit_count, 'rust_documentation_comment_instances': docs_instances,
        'code_blocks_verified_unchanged_except_comments': code_fences,
        'original_text_triggers': tooltips, 'local_references_checked': links,
        'errors': errors,
    }
    (ROOT / 'content/verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
