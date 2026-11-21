#!/usr/bin/env python3
"""Freeze upstream documentation and extract deterministic translation units."""
import argparse
import json
import re
import subprocess
from pathlib import Path

from markdown_it import MarkdownIt
from mdit_py_plugins.dollarmath import dollarmath_plugin
from pygments.lexers import get_lexer_by_name
from pygments.token import Comment

ROOT = Path(__file__).resolve().parents[1]
MD = MarkdownIt('commonmark', {'html': True}).enable('table').use(dollarmath_plugin)


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def expand_includes(text, file, checkout):
    def expand(match):
        target, *parts = match.group(1).split(':')
        source = (file.parent / target).resolve()
        if not source.is_relative_to(checkout.resolve()):
            raise ValueError(f'Include outside upstream: {source}')
        lines = source.read_text().splitlines()
        if parts and parts[0].isdigit():
            first = int(parts[0]) - 1
            last = int(parts[1]) if len(parts) > 1 and parts[1] else None
            lines = lines[first:last]
        elif parts:
            name = parts[0]
            if not any(re.search(r'ANCHOR:\s*' + re.escape(name) + r'\s*$', line) for line in lines):
                # The pinned upstream moved these declarations without updating three includes.
                moved = {'trf_tensor_def': 'register_file.rs', 'vrf_tensor_def': 'register_file.rs', 'dma_impl': 'hbm.rs'}
                if name not in moved:
                    raise ValueError(f'Missing upstream anchor {name} in {source}')
                source = source.with_name(moved[name])
                lines = source.read_text().splitlines()
            start = next(i for i, line in enumerate(lines) if re.search(r'ANCHOR:\s*' + re.escape(name) + r'\s*$', line))
            end = next(i for i, line in enumerate(lines[start + 1:], start + 1) if re.search(r'ANCHOR_END:\s*' + re.escape(name) + r'\s*$', line))
            lines = lines[start + 1:end]
        return '\n'.join(line for line in lines if not re.search(r'ANCHOR(?:_END)?:', line))
    return re.sub(r'\{\{#include\s+([^}]+)\}\}', expand, text)


def normalize_math(text):
    # mdBook uses escaped MathJax delimiters; render these as actual math.
    text = re.sub(r'\\\\\((.*?)\\\\\)', lambda m: '$' + m.group(1) + '$', text, flags=re.S)
    text = re.sub(r'\\\\\[(.*?)\\\\\]', lambda m: '$$' + m.group(1) + '$$', text, flags=re.S)
    return text


def displayed_code(token):
    code = token.content
    if token.info.split(',')[0].strip().startswith('rust'):
        code = '\n'.join(line for line in code.splitlines() if not re.match(r'^\s*#(?: |$)', line))
        code = re.sub(r'^(\s*)##', r'\1#', code, flags=re.M)
        return code + '\n'
    return code


def comment_spans(code, language):
    lang = language.split(',')[0].strip().split(' ')[0]
    if lang not in {'rust', 'bash', 'sh', 'shell', 'python', 'toml', 'yaml', 'yml', 'c', 'cpp'}:
        return []
    try:
        lexer = get_lexer_by_name('bash' if lang == 'shell' else lang)
    except Exception:
        return []
    spans = []
    for offset, kind, value in lexer.get_tokens_unprocessed(code):
        if kind in Comment and re.search(r'[A-Za-z]{2}', value) and not re.match(r'^#!', value):
            if 'ANCHOR:' in value or 'ANCHOR_END:' in value:
                continue
            spans.append((offset, len(value), value))
    return spans


def translateable_inline(token):
    # Identifiers, equations, numbers, and code-only table cells do not need translation.
    parts = []
    for child in token.children or []:
        if child.type in {'text', 'html_inline'}:
            parts.append(child.content)
        elif child.type == 'image':
            parts.append(child.content)
    text = ' '.join(parts)
    return bool(re.search(r'[A-Za-z]{2}', text)) and not (text.strip().startswith('<') and re.fullmatch(r'<[^>]+>', text.strip()))


def extract(text):
    tokens = MD.parse(text)
    units, serial = [], 0
    for n, token in enumerate(tokens):
        if token.type == 'inline' and translateable_inline(token):
            serial += 1
            units.append({'id': f'u{serial:04}', 'kind': 'prose', 'token': n, 'text': token.content})
        elif token.type == 'fence':
            for offset, length, value in comment_spans(displayed_code(token), token.info):
                serial += 1
                units.append({'id': f'u{serial:04}', 'kind': 'comment', 'token': n, 'offset': offset, 'length': length, 'text': value})
    return units


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('checkout', type=Path)
    args = parser.parse_args()
    up = args.checkout.resolve()
    sha = subprocess.check_output(['git', '-C', str(up), 'rev-parse', 'HEAD'], text=True).strip()
    summary = (up / 'docs/src/SUMMARY.md').read_text()
    order = []
    for match in re.finditer(r'^(\s*)[-+*]\s+\[([^]]+)\]\(([^)]+)\)', summary, re.M):
        path = match.group(3).removeprefix('./')
        order.append({'key': path.removesuffix('.md'), 'title_en': match.group(2), 'depth': len(match.group(1).replace('\n', '')) // 2})
    source_paths = {x['key']: 'docs/src/' + x['key'] + '.md' for x in order}
    extras = [
        ('repository', 'Repository Guide', 'README.md'),
        ('runtime', 'Runtime Guide', 'furiosa-opt-rt/README.md'),
        ('runtime-bootloader', 'Runtime Bootloader', 'furiosa-opt-rt/bootloader/README.md'),
        ('device-abi', 'Device Function ABI', 'furiosa-opt-abi/README.md'),
        ('example-mnist', 'MNIST Example', 'furiosa-opt-examples/src/mnist/README.md'),
        ('example-transformer', 'Transformer Example', 'furiosa-opt-examples/src/transformer/README.md'),
        ('kernel-authoring', 'Kernel Authoring Skill', 'skills/furiosa-opt-kernel-authoring/SKILL.md'),
        ('changes', 'Release Notes', 'CHANGES.md'),
    ]
    for key, title, path in extras:
        order.append({'key': key, 'title_en': title, 'depth': 0, 'appendix': True})
        source_paths[key] = path
    included = set(source_paths.values()) | {'docs/src/SUMMARY.md'}
    for path in sorted((up / 'docs/src').rglob('*.md')):
        rel = path.relative_to(up).as_posix()
        if rel not in included:
            key = path.relative_to(up / 'docs/src').as_posix().removesuffix('.md')
            title = path.read_text().strip().lstrip('# ').splitlines()[0] if path.read_text().strip() else path.stem.replace('-', ' ').title()
            order.append({'key': key, 'title_en': title, 'depth': 1, 'stub': True})
            source_paths[key] = rel
    for page in order:
        path = up / source_paths[page['key']]
        text = expand_includes(path.read_text(), path, up)
        if page['key'] == 'kernel-authoring':
            text = re.sub(r'^---\n.*?\n---\n', '', text, count=1, flags=re.S)
        text = normalize_math(text)
        units = extract(text)
        page['source'] = source_paths[page['key']]
        page['unit_count'] = len(units)
        page['source_chars'] = sum(len(u['text']) for u in units)
        en = ROOT / 'content/en' / (page['key'] + '.md')
        en.parent.mkdir(parents=True, exist_ok=True)
        en.write_text(text)
        dump(ROOT / 'content/units' / (page['key'] + '.json'), units)
    dump(ROOT / 'content/manifest.json', {'upstream': 'furiosa-ai/furiosa-opt', 'commit': sha, 'date': '2026-11-21', 'pages': order})
    print(json.dumps({'pages': len(order), 'units': sum(x['unit_count'] for x in order), 'chars': sum(x['source_chars'] for x in order), 'page_counts': [(x['key'], x['unit_count'], x['source_chars']) for x in order]}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
