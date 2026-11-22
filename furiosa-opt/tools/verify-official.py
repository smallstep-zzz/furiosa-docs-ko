#!/usr/bin/env python3
"""Compare the official mdBook with the pinned, expanded English sources.

Reproduce the recorded comparison from saved, unmodified responses:
  python tools/verify-official.py --toc /path/toc.html --print /path/print.html \
      --capture-date 2026-11-22
Omit both snapshot arguments to download the current official responses.
The report is written only after every comparison passes. A changed sentence,
equation, inline-code token, code block, or table of contents causes exit 1.

This checks the published book's content, not its deployment commit or image
binary contents. The official server does not identify a source commit here.
"""

import argparse
import hashlib
import html
import json
import re
import sys
from datetime import date
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup, Comment, NavigableString, Tag
from markdown_it import MarkdownIt
from mdit_py_plugins.dollarmath import dollarmath_plugin
from mdit_py_plugins.footnote import footnote_plugin

from prepare import ROOT, displayed_code

BASE = 'https://developer.furiosa.ai/furiosa-opt/book/'
COMMIT = '3d43bc9d20f324af60e3006c3f1541938d7f5097'
# One-based displayed-code indices. Never allow other empty official blocks.
RESTORED_INCLUDES = {
    ('moving-tensors/dma-engine', 1): (
        'dma_impl', '0420299095645c90f80ff2a0c093a14d75e9f9f985504321bae5aea7d21c3b3f'),
    ('computing-tensors/register-files', 1): (
        'trf_tensor_def', '05acb01902f6898d49c271f3e5d9b939c1236ea4a5493a62eb3040a2aa3cb0cc'),
    ('computing-tensors/register-files', 7): (
        'vrf_tensor_def', '05faaefe17eeb5a44bb8140df0e856b6a0e56235a197a742e3ad08c051346876'),
}
TYPOGRAPHY = str.maketrans({
    '’': "'", '‘': "'", '“': '"', '”': '"', '…': '...',
    '–': '--', '—': '---', '\u00a0': ' ',
})
MATH = re.compile(r'\\\((.*?)\\\)|\\\[(.*?)\\\]|\$\$(.*?)\$\$', re.S)
MD_ESCAPE = re.compile(r'''\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])''')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha256(value):
    if isinstance(value, str):
        value = value.encode('utf-8')
    return hashlib.sha256(value).hexdigest()


def digest(value):
    return sha256(json.dumps(value, ensure_ascii=False, separators=(',', ':')))


def words(value):
    """Ignore layout whitespace, retain word boundaries and every punctuation mark."""
    return re.findall(r'\w+|[^\w\s]', value.translate(TYPOGRAPHY))


def source_markdown():
    md = MarkdownIt('commonmark', {'html': True}).enable('table')
    md.use(dollarmath_plugin).use(footnote_plugin)

    def math_rule(tokens, index, options, env):
        token = tokens[index]
        # mdBook's CommonMark parser unescapes Markdown punctuation once before
        # MathJax sees it. The frozen $...$ plugin deliberately preserves it.
        value = html.unescape(MD_ESCAPE.sub(r'\1', token.content))
        mode = 'block' if token.type == 'math_block' else 'inline'
        return f'<span class="compare-math" data-mode="{mode}">{html.escape(value)}</span>'

    def footnote_ref(tokens, index, options, env):
        label = html.escape(tokens[index].meta['label'], quote=True)
        return f'<sup class="compare-footnote-ref" data-label="{label}"></sup>'

    def footnote_open(tokens, index, options, env):
        label = html.escape(tokens[index].meta['label'], quote=True)
        return f'<div class="compare-footnote-def" data-label="{label}">'

    md.renderer.rules.update({
        'math_inline': math_rule, 'math_block': math_rule,
        'footnote_ref': footnote_ref,
        'footnote_block_open': lambda *args: '<div class="compare-footnotes">',
        'footnote_block_close': lambda *args: '</div>',
        'footnote_open': footnote_open,
        'footnote_close': lambda *args: '</div>',
        'footnote_anchor': lambda *args: '',
    })
    return md


def official_math(soup):
    for node in list(soup.find_all(string=True)):
        if isinstance(node, Comment) or node.find_parent(['pre', 'code']):
            continue
        text = str(node)
        matches = list(MATH.finditer(text))
        if not matches:
            continue
        cursor = 0
        for match in matches:
            node.insert_before(NavigableString(text[cursor:match.start()]))
            tag = soup.new_tag('span', attrs={
                'class': 'compare-math',
                'data-mode': 'inline' if match.group(1) is not None else 'block',
            })
            tag.string = next(x for x in match.groups() if x is not None)
            node.insert_before(tag)
            cursor = match.end()
        node.insert_before(NavigableString(text[cursor:]))
        node.extract()


def remove_lightboxes(soup):
    """Drop only a verified duplicate from mdBook's image zoom control."""
    count = 0
    for label in soup.select('label.checkbox-label'):
        images = label.select('img')
        wrappers = label.select('span.img-wrapper')
        controls = label.select('input.checkbox-img[type="checkbox"]')
        require(len(images) == 2 and images[0].attrs == images[1].attrs
                and len(wrappers) == len(controls) == 1
                and images[1].parent is wrappers[0], 'Unexpected image lightbox structure')
        wrappers[0].decompose()
        controls[0].decompose()
        label.unwrap()
        count += 1
    return count


def canonical_body(soup, key, official):
    footnotes = {}
    if official:
        official_math(soup)
        for ref in soup.select('sup.footnote-reference'):
            anchor = ref.find('a')
            require(anchor and anchor.get('href', '').startswith('#footnote-'),
                    f'{key}: unsupported footnote reference')
            ref['class'] = ['compare-footnote-ref']
            ref['data-label'] = anchor['href'].removeprefix('#footnote-')
        for listing in list(soup.select('ol.footnote-definition')):
            for item in listing.find_all('li', recursive=False):
                label = item.get('id', '').removeprefix('footnote-')
                require(label and label not in footnotes, f'{key}: duplicate/invalid footnote')
                for backlink in list(item.select('a[href]')):
                    if backlink['href'].startswith('#fr-' + label + '-'):
                        require(backlink.get_text().strip() == '↩', 'Unexpected footnote backlink')
                        backlink.decompose()
                item.name = 'div'  # The generated definition-list wrapper is not source prose.
                footnotes[label] = canonical_tokens(item, key, official)
            listing.decompose()
    else:
        for item in list(soup.select('.compare-footnote-def')):
            label = item['data-label']
            require(label not in footnotes, f'{key}: duplicate source footnote')
            footnotes[label] = canonical_tokens(item, key, official)
            item.decompose()
    return {'body': canonical_tokens(soup, key, official), 'footnotes': footnotes}


def canonical_tokens(root, key, official):
    out, buffer = [], []
    code_index = 0

    def flush():
        text = ''.join(buffer)
        if not official:
            text = re.sub(r'\[!(NOTE|WARNING|TIP|IMPORTANT|CAUTION)\]',
                          lambda match: match.group(1).title(), text)
        out.extend(words(text))
        buffer.clear()

    def special(value):
        flush()
        out.append(value)

    def visit(node):
        nonlocal code_index
        if isinstance(node, Comment):
            return
        if isinstance(node, NavigableString):
            buffer.append(str(node))
            return
        if not isinstance(node, Tag):
            return
        name, classes = node.name, node.get('class', [])
        if name in {'script', 'style', 'iframe'}:
            raise ValueError(f'{key}: unexpected {name} inside book content')
        if name == 'pre':
            code_index += 1
            special(['code-block', code_index])
            return
        if name == 'code':
            special(['inline-code', node.get_text()])
            return
        if 'compare-math' in classes:
            special(['math', node['data-mode'], re.sub(r'\s+', ' ', node.get_text()).strip()])
            return
        if 'compare-footnote-ref' in classes:
            special(['footnote-reference', node['data-label']])
            return
        if name == 'img':
            base = BASE if official else BASE + key + '.html'
            special(['image', urljoin(base, node.get('src', '')),
                     words(node.get('alt', '')), words(node.get('title', ''))])
            return
        # Inline emphasis/link wrappers are transparent. Paragraph boundaries
        # may differ for admonition titles; words and punctuation stay ordered.
        structural = name in {'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                              'blockquote', 'ul', 'ol', 'li', 'table', 'tr', 'th', 'td'}
        block = structural or name in {'p', 'div', 'section', 'br', 'hr'}
        if structural:
            special(['open', name])
        elif block:
            buffer.append(' ')
        for child in node.children:
            visit(child)
        if structural:
            special(['close', name])
        elif block:
            buffer.append(' ')

    visit(root)
    flush()
    return out


def split_book(data):
    soup = BeautifulSoup(data, 'html.parser')
    mains = soup.find_all('main')
    require(len(mains) == 1, 'Official print snapshot must contain exactly one main element')
    pages, current = [], []
    for node in mains[0].children:
        if getattr(node, 'name', None) == 'h1':
            if current:
                pages.append(BeautifulSoup(''.join(map(str, current)), 'html.parser'))
            current = [node]
        elif current:
            current.append(node)
        else:
            require(not str(node).strip(), 'Unexpected content before the first chapter')
    if current:
        pages.append(BeautifulSoup(''.join(map(str, current)), 'html.parser'))
    return pages


def load_response(path, url):
    if path:
        return path.read_bytes()
    with urlopen(Request(url, headers={'User-Agent': 'furiosa-opt-ko-source-verifier/1.0'}),
                 timeout=45) as response:
        require(response.status == 200, f'HTTP {response.status}: {url}')
        return response.read()


def compare(toc_bytes, print_bytes, capture_date):
    manifest = json.loads((ROOT / 'content/manifest.json').read_text())
    require(manifest['commit'] == COMMIT, 'Pinned source commit changed; review the verifier first')
    pages = [p for p in manifest['pages'] if not p.get('appendix') and not p.get('stub')]
    toc = BeautifulSoup(toc_bytes, 'html.parser')
    links = toc.select('ol.chapter a[href]')
    actual_toc = []
    for link in links:
        depth = sum('section' in x.get('class', []) for x in link.parents if isinstance(x, Tag))
        for numbering in link.select('strong[aria-hidden="true"]'):
            numbering.decompose()
        actual_toc.append((link['href'], words(link.get_text()), depth))
    expected_toc = [(p['key'] + '.html', words(p['title_en']), p['depth']) for p in pages]
    require(actual_toc == expected_toc, 'Official table of contents differs (URL/title/order/depth)')
    sections = split_book(print_bytes)
    require(len(sections) == len(pages) == 47, 'Official book/source chapter count differs from 47')
    md, results, used_exceptions = source_markdown(), [], []
    for page, official in zip(pages, sections):
        key = page['key']
        source = (ROOT / 'content/en' / (key + '.md')).read_text()
        source_tokens = md.parse(source)
        local_codes = [displayed_code(t).strip() for t in source_tokens
                       if t.type in {'fence', 'code_block'}]
        official_codes = []
        for pre in official.select('pre'):
            for hidden in pre.select('.boring'):
                hidden.decompose()
            official_codes.append(pre.get_text().strip())
        require(len(local_codes) == len(official_codes), f'{key}: code block count changed')
        restored, code_matches = [], 0
        for index, (local, published) in enumerate(zip(local_codes, official_codes), 1):
            if local == published:
                code_matches += 1
                continue
            exception = RESTORED_INCLUDES.get((key, index))
            require(exception and published == '' and sha256(local) == exception[1],
                    f'{key}: displayed code block {index} changed')
            restored.append({'block_index': index, 'anchor': exception[0],
                             'source_code_sha256': exception[1], 'official_code_is_empty': True})
            used_exceptions.append((key, index))
        lightboxes = remove_lightboxes(official)
        local = BeautifulSoup(md.render(source), 'html.parser')
        local_body = canonical_body(local, key, False)
        published_body = canonical_body(official, key, True)
        if local_body != published_body:
            import difflib
            left = json.dumps(local_body, ensure_ascii=False, indent=2).splitlines()
            right = json.dumps(published_body, ensure_ascii=False, indent=2).splitlines()
            diff = '\n'.join(list(difflib.unified_diff(left, right, fromfile='pinned-source',
                                                     tofile='official', n=2))[:90])
            raise ValueError(f'{key}: body changed after documented normalization\n{diff}')
        results.append({
            'key': key, 'official_url': BASE + key + '.html',
            'github_url': f'https://github.com/{manifest["upstream"]}/blob/{COMMIT}/{page["source"]}',
            'source_markdown_sha256': sha256(source), 'body_equivalent': True,
            'canonical_body_sha256': digest(local_body),
            'body_token_count': len(local_body['body']),
            'math_expression_count': sum(isinstance(t, list) and t[0] == 'math'
                                         for t in local_body['body']),
            'footnote_count': len(local_body['footnotes']),
            'code_block_count': len(local_codes), 'code_exact_match_count': code_matches,
            'empty_include_restoration_count': len(restored), 'restored_includes': restored,
            'image_count': lightboxes,
        })
    require(set(used_exceptions) == set(RESTORED_INCLUDES),
            'The three known empty includes changed; review the exception record')
    return {
        'schema_version': 1, 'verification_status': 'passed', 'capture_date': capture_date,
        'official_base_url': BASE, 'source_repository': manifest['upstream'],
        'source_commit': COMMIT, 'official_deployment_commit': None,
        'official_deployment_commit_note': 'The deployed source commit is not disclosed; content equivalence was verified.',
        'snapshots': {
            'toc': {'url': BASE + 'toc.html', 'sha256': sha256(toc_bytes), 'bytes': len(toc_bytes)},
            'print': {'url': BASE + 'print.html', 'sha256': sha256(print_bytes), 'bytes': len(print_bytes)},
        },
        'comparison_scope': 'All 47 chapters in the official table of contents; repository appendices and unpublished drafts are excluded.',
        'normalization': [
            'Compare all body text in order, including headings, lists, table cells, inline code, equations, image sources/alt text and footnotes.',
            'Ignore layout whitespace while retaining word boundaries and every punctuation mark; normalize smart quotes, smart dashes and ellipses to their Markdown spellings.',
            'Normalize admonition labels and their split title paragraphs; preserve warning/note text.',
            'Normalize MathJax delimiters and one CommonMark backslash-unescape pass; preserve the complete equation, including display math.',
            'Compare footnote definitions by their original labels independently of page-end placement; keep references in body order.',
            'Remove only verified duplicate image lightboxes and generated footnote backlinks; compare image URLs/alt text, not image bytes.',
            'Compare displayed code byte-for-byte after trimming outer whitespace and removing mdBook hidden setup lines; allow only the three enumerated, source-hash-pinned empty includes.',
        ],
        'summary': {
            'toc_equivalent': True, 'official_page_count': len(results),
            'body_equivalent_count': len(results),
            'code_block_count': sum(p['code_block_count'] for p in results),
            'code_exact_match_count': sum(p['code_exact_match_count'] for p in results),
            'empty_include_restoration_count': len(used_exceptions),
            'math_expression_count': sum(p['math_expression_count'] for p in results),
            'footnote_count': sum(p['footnote_count'] for p in results),
        },
        'pages': results,
        'reproduce': 'python tools/verify-official.py --toc /path/toc.html --print /path/print.html --capture-date ' + capture_date,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--toc', type=Path, help='Unmodified official toc.html snapshot')
    parser.add_argument('--print', dest='print_path', type=Path, help='Unmodified official print.html snapshot')
    parser.add_argument('--capture-date', default=date.today().isoformat(), help='Snapshot collection date (YYYY-MM-DD)')
    parser.add_argument('--output', type=Path, default=ROOT / 'content/official-site.json')
    args = parser.parse_args()
    try:
        require(bool(args.toc) == bool(args.print_path), 'Provide both snapshot paths, or neither')
        date.fromisoformat(args.capture_date)
        report = compare(load_response(args.toc, BASE + 'toc.html'),
                         load_response(args.print_path, BASE + 'print.html'), args.capture_date)
    except Exception as exc:
        print(f'FAIL: {exc}', file=sys.stderr)
        return 1
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'status': 'passed', **report['summary']}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
