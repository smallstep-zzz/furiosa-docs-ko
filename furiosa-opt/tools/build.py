#!/usr/bin/env python3
"""Build the Korean parallel-text static book. No browser-side translation."""
import argparse
import copy
import html
import json
import os
import posixpath
import re
import sys
import hashlib
from collections import Counter
from pathlib import Path
from urllib.parse import unquote, urlsplit, urlunsplit

from markdown_it import MarkdownIt
from markdown_it.token import Token
from mdit_py_plugins.dollarmath import dollarmath_plugin
from pygments import highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import get_lexer_by_name, TextLexer
from pygments.token import Comment, String

from prepare import ROOT, displayed_code

META = json.loads((ROOT / 'content/manifest.json').read_text())
PAGES = META['pages']
SOURCE_MAP = {p['source']: p['key'] + '.html' for p in PAGES}
COMMIT = META['commit']
UPSTREAM = f'https://github.com/furiosa-ai/furiosa-opt/blob/{COMMIT}/'
RAW = f'https://raw.githubusercontent.com/furiosa-ai/furiosa-opt/{COMMIT}/'
REPO = 'https://github.com/smallstep-zzz/furiosa-docs-ko/tree/main/furiosa-opt'
DOC_COMMENTS = json.loads((ROOT / 'content/doc-comments.json').read_text()) if (ROOT / 'content/doc-comments.json').exists() else {}
TITLE = {
 'introduction': '소개', 'quick-start': '빠른 시작',
 'quick-start/setup-and-tooling': '설치와 개발 도구',
 'quick-start/tensor-and-contraction': '텐서와 수축 연산',
 'quick-start/kernel-design': '커널 설계', 'quick-start/kernel-validation': '커널 검증',
 'mapping-tensors/index': '텐서 매핑', 'mapping-tensors/mapping-expressions': '매핑 표현식',
 'mapping-tensors/spatial-temporal-dimensions': '공간 차원과 시간 차원',
 'mapping-tensors/tensor-semantics': '텐서의 의미',
 'moving-tensors/index': '텐서 이동', 'moving-tensors/sequencer': '시퀀서',
 'moving-tensors/fetch-engine': '읽기 엔진', 'moving-tensors/commit-engine': '쓰기 엔진',
 'moving-tensors/tensor-unit-io': '텐서 유닛 입출력', 'moving-tensors/dma-engine': 'DMA 엔진',
 'moving-tensors/memory-performance': '메모리 성능',
 'computing-tensors/index': '텐서 연산', 'computing-tensors/fetch-adapter': '읽기 어댑터',
 'computing-tensors/switch-engine': '교환 엔진', 'computing-tensors/collect-engine': '수집 엔진',
 'computing-tensors/register-files': '레지스터 파일',
 'computing-tensors/contraction-engine/index': '수축 연산기',
 'computing-tensors/contraction-engine/outer': '확장과 곱셈',
 'computing-tensors/contraction-engine/packet-reducer': '패킷 축약기',
 'computing-tensors/contraction-engine/time-reducer': '시간 축약기',
 'computing-tensors/contraction-engine/lane-folder': '레인 폴더',
 'computing-tensors/vector-engine/index': '벡터 엔진',
 'computing-tensors/vector-engine/intra-slice-chain': '슬라이스 내부 연산 체인',
 'computing-tensors/vector-engine/intra-slice-reduce': '슬라이스 내부 축약',
 'computing-tensors/vector-engine/vcg': '유효 개수 생성기',
 'computing-tensors/vector-engine/inter-slice-reducer': '슬라이스 간 축약기',
 'computing-tensors/cast-engine': '자료형 변환 엔진',
 'computing-tensors/transpose-engine': '전치 엔진', 'computing-tensors/commit-adapter': '쓰기 어댑터',
 'kernel-examples/chip-cluster-reduce': '칩·클러스터 간 축약',
 'kernel-examples/index': '전체 실행 예제', 'kernel-examples/transformer': '트랜스포머 예제',
 'kernel-examples/skip-loop-bodies-at-runtime': '실행 중 반복문 본문 건너뛰기',
 'scheduling/index': '스케줄링과 성능 조정', 'scheduling/schedule': '실행 스케줄',
 'scheduling/diagnosis': '성능 진단', 'scheduling/tuning': '성능 조정',
 'tools/index': '개발 도구', 'tools/kernel-optimizer': '커널 최적화 도구',
 'tools/language-server': '언어 서버', 'tools/schedule-viewer': '스케줄 뷰어',
 'repository': '저장소 안내', 'runtime': '런타임 안내', 'runtime-bootloader': '런타임 부트로더',
 'device-abi': '디바이스 함수 ABI', 'example-mnist': 'MNIST 예제 안내',
 'example-transformer': '트랜스포머 예제 안내', 'kernel-authoring': '커널 작성 스킬',
 'changes': '변경 이력', 'computing-tensors/contraction-engine/2d-convolution': '2차원 합성곱',
 'kernel-examples/mixture-of-experts': '전문가 혼합', 'kernel-examples/split-reduce': '분할 축약',
 'kernel-examples/tiling': '타일링', 'mapping-tensors/memory-stream': '메모리 스트림',
 'mapping-tensors/tensor-functions': '텐서 함수',
}
GROUPS = [
 ('시작하기', ['introduction', 'quick-start', 'quick-start/']),
 ('텐서 매핑', ['mapping-tensors/']),
 ('텐서 이동과 메모리', ['moving-tensors/']),
 ('텐서 연산과 엔진', ['computing-tensors/']),
 ('전체 실행 예제', ['kernel-examples/']),
 ('스케줄링과 도구', ['scheduling/', 'tools/']),
 ('저장소와 런타임', ['repository', 'runtime', 'runtime-bootloader', 'device-abi', 'example-mnist', 'example-transformer', 'kernel-authoring', 'changes']),
]


def e(value):
    return html.escape(str(value), quote=True)


def rel(key, target):
    return posixpath.relpath(target, posixpath.dirname(key + '.html') or '.')


def slug(text):
    text = re.sub(r'!\[([^]]*)\]\([^)]*\)', r'\1', text)
    text = re.sub(r'\[([^]]*)\]\([^)]*\)', r'\1', text)
    text = re.sub(r'<[^>]+>', '', text)
    return re.sub(r'\s', '-', re.sub(r'[^\w\- ]', '', text.lower()))


def rewrite_url(url, page, is_image=False):
    if not url or url.startswith(('#', 'data:', 'mailto:')):
        return url
    parts = urlsplit(url)
    if parts.scheme or parts.netloc:
        if parts.netloc == 'developer.furiosa.ai' and '/furiosa-opt/' in parts.path:
            tail = parts.path.split('/furiosa-opt/')[-1].removeprefix('latest/')
            if tail.endswith('.html') and any(p['key'] + '.html' == tail for p in PAGES):
                return rel(page['key'], tail) + ('#' + parts.fragment if parts.fragment else '')
        return url
    target = posixpath.normpath(posixpath.join(posixpath.dirname(page['source']), unquote(parts.path)))
    if target.endswith('.html'):
        target = target[:-5] + '.md'
    if target in SOURCE_MAP:
        result = rel(page['key'], SOURCE_MAP[target])
    elif is_image:
        local_image = target.removeprefix('docs/src/')
        result = rel(page['key'], local_image) if (ROOT / local_image).is_file() else RAW + target
    else:
        result = UPSTREAM + target
    return result + ('?' + parts.query if parts.query else '') + ('#' + parts.fragment if parts.fragment else '')


def make_md(page):
    md = MarkdownIt('commonmark', {'html': True, 'breaks': False}).enable('table').use(dollarmath_plugin)
    original_image = md.renderer.rules['image']
    def image_rule(tokens, idx, options, env):
        token = tokens[idx]
        token.attrSet('src', rewrite_url(token.attrGet('src'), page, True))
        token.attrSet('loading', 'lazy')
        token.attrSet('decoding', 'async')
        return original_image(tokens, idx, options, env)
    def link_rule(tokens, idx, options, env):
        token = tokens[idx]
        token.attrSet('href', rewrite_url(token.attrGet('href'), page))
        if (token.attrGet('href') or '').startswith('https:'):
            token.attrSet('rel', 'noopener noreferrer')
        return md.renderer.renderToken(tokens, idx, options, env)
    def math_inline(tokens, idx, options, env):
        return '<span class="math-source" data-display="false">' + e(tokens[idx].content) + '</span>'
    def math_block(tokens, idx, options, env):
        return '<div class="math-source" data-display="true">' + e(tokens[idx].content) + '</div>'
    md.renderer.rules.update(image=image_rule, link_open=link_rule, math_inline=math_inline, math_inline_double=math_inline, math_block=math_block, math_block_label=math_block)
    return md


def plain(md, value):
    tokens = md.parseInline(value)
    text = []
    for token in tokens[0].children or []:
        if token.type in ('text', 'code_inline', 'math_inline'):
            text.append(token.content)
        elif token.type in ('softbreak', 'hardbreak'):
            text.append(' ')
    return ''.join(text)


def inline_markup(value, original=False):
    labels = {'NOTE': '참고(Note)', 'TIP': '도움말(Tip)', 'WARNING': '주의(Warning)', 'IMPORTANT': '중요(Important)', 'CAUTION': '주의(Caution)'}
    value = re.sub(r'^\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]\s*', lambda m: '<span class="admonition-label">' + (m.group(1) if original else labels[m.group(1)]) + '</span> ', value)
    is_footnote = re.match(r'^\[\^([^]]+)\]:\s*', value)
    if is_footnote:
        name = is_footnote.group(1)
        value = '<sup' + ('' if original else ' id="footnote-' + e(name.lower()) + '"') + '>1</sup> ' + value[is_footnote.end():]
    value = re.sub(r'\[\^([^]]+)\]', lambda m: '<sup><a href="#footnote-' + e(m.group(1).lower()) + '" aria-label="각주 1">1</a></sup>', value)
    return value


def code_semantics(code, language):
    try:
        lexer = get_lexer_by_name(language)
    except Exception:
        return code
    return ''.join(value for _, kind, value in lexer.get_tokens_unprocessed(code)
                   if not ((kind in Comment and kind not in Comment.Preproc) or kind in String.Doc))


def sidebar(page):
    key = page['key']
    parts = [f'<a class="sidebar-home" href="{rel(key, "index.html")}"><span class="mini-mark">F</span><span>furiosa-opt<span class="sidebar-subtitle">한국어 문서</span></span></a>',
             '<div class="nav-search"><label class="sr-only" for="doc-search">문서 검색</label><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.7" cy="10.7" r="6.5"/><path d="m16 16 4 4"/></svg><input id="doc-search" type="search" placeholder="문서와 용어 검색" autocomplete="off"><kbd>/</kbd></div>',
             '<div id="search-results" hidden aria-live="polite"></div><nav id="chapter-nav" aria-label="전체 문서 목차">']
    for name, prefixes in GROUPS:
        members = [p for p in PAGES if not p.get('stub') and any(p['key'] == prefix or (prefix.endswith('/') and p['key'].startswith(prefix)) for prefix in prefixes)]
        active = any(p['key'] == key for p in members)
        parts.append(f'<details class="nav-group" {"open" if active or name == "시작하기" or key == "index" else ""}><summary>{name}<span class="chevron"></span></summary><ul>')
        for p in members:
            selected = p['key'] == key
            depth = min(2, p['key'].count('/') - (1 if p['key'].endswith('/index') else 0))
            en_title = p['title_en'].removeprefix('Case Study: ')
            parts.append(f'<li class="nav-depth-{max(0, depth)}"><a href="{rel(key, p["key"] + ".html")}" {"aria-current=\"page\"" if selected else ""}><span>{e(TITLE[p["key"]])}</span><small>{e(en_title)}</small></a></li>')
        parts.append('</ul></details>')
    parts.append(f'</nav><div class="nav-footer"><a href="{rel(key, "about.html")}">번역 안내·용어집</a><a href="{rel(key, "../index.html")}">Furiosa 개발자 문서</a><span>한국어로 읽는 TCP · No5</span></div>')
    return ''.join(parts)


def shell(page, body, toc='', previous=None, following=None, home=False):
    key = page['key']
    prefix = rel(key, 'assets/') + '/'
    title = TITLE.get(key, page.get('title', 'furiosa-opt 한국어 문서'))
    source = UPSTREAM + page['source'] if 'source' in page else 'https://github.com/furiosa-ai/furiosa-opt'
    pager = ''
    if previous or following:
        pager = '<nav class="page-nav" aria-label="이전과 다음 문서">'
        for target, caption in [(previous, '이전 문서'), (following, '다음 문서')]:
            if target:
                pager += f'<a href="{rel(key, target["key"] + ".html")}"><small>{caption}</small><strong>{e(TITLE[target["key"]])}</strong></a>'
            else:
                pager += '<span></span>'
        pager += '</nav>'
    return f'''<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="description" content="furiosa-opt의 한국어 문서. 텐서 매핑, 메모리, 연산 엔진, 커널 설계와 최적화를 문단별 영어 원문과 함께 읽습니다."><title>{e(title)} · furiosa-opt 한국어</title><link rel="icon" href="{prefix}favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="{prefix}style.css"><link rel="stylesheet" href="{prefix}code.css"><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"><script>try{{if(localStorage.getItem('opt-theme')==='dark')document.documentElement.dataset.theme='dark';}}catch(e){{}}</script><script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script><script defer src="{prefix}app.js"></script></head>
<body data-root="{rel(key, 'index.html').removesuffix('index.html')}" data-page="{e(key)}"><a class="skip-link" href="#main">본문으로 건너뛰기</a>
<header class="topbar"><div class="topbar-start"><button class="icon-button menu-toggle" id="menu-toggle" aria-label="목차 열기" aria-expanded="false" aria-controls="sidebar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button><a class="wordmark" href="{rel(key, 'index.html')}">furiosa<span>-opt</span><span class="edition">한국어</span></a></div><div class="topbar-end"><span class="community-label">커뮤니티 번역</span><button class="icon-button" id="theme-toggle" aria-label="어두운 테마로 전환"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.5A8.5 8.5 0 0 1 8.5 4a8.5 8.5 0 1 0 11.5 11.5Z"/></svg></button><a class="github-link" href="{REPO}" aria-label="한국어 문서 GitHub 저장소"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 19c-4 .9-4-2-6-2m12 4v-3.4a3 3 0 0 0-.8-2.3c2.7-.3 5.5-1.3 5.5-6a4.7 4.7 0 0 0-1.3-3.2c.2-.9.1-2-.1-2.7 0 0-1-.3-3.3 1.2a11.4 11.4 0 0 0-6 0C6.7 3.1 5.7 3.4 5.7 3.4c-.3.7-.3 1.8-.1 2.7a4.7 4.7 0 0 0-1.3 3.2c0 4.7 2.8 5.7 5.5 6a3 3 0 0 0-.8 2.3V21"/></svg><span>GitHub</span></a></div></header>
<div class="reading-progress" aria-hidden="true"><span id="reading-progress-bar"></span></div><div class="sidebar-backdrop" id="sidebar-backdrop" hidden></div><aside class="sidebar" id="sidebar" aria-label="문서 탐색">{sidebar(page)}</aside>
<div class="workspace"><main id="main" class="main-content {"home-content" if home else ""}" tabindex="-1"><div class="page-meta"><span>FURIOSA OPT / 한국어 문서</span><a href="{source}" target="_blank" rel="noopener noreferrer">원문링크 <span aria-hidden="true">↗</span></a></div>{body}{pager}<footer class="page-footer"><div>FuriosaAI 원문 · Apache-2.0<span>한국어 번역·읽기 도움말 · No5</span></div><a href="{rel(key, 'about.html')}">번역 기준 {META['date']} · {COMMIT[:7]}</a></footer></main><aside class="page-toc" aria-label="이 문서의 목차"><div class="toc-sticky"><h2>이 문서에서</h2>{toc}<div class="toc-hint"><span class="hint-badge">EN</span><p>문단에 마우스를 올리면<br>영어 원문이 나타납니다.</p><small>키보드: Tab으로 이동 · Esc로 닫기</small></div></div></aside></div>
<div class="original-popover" id="original-popover" role="dialog" aria-modal="false" aria-labelledby="original-title" hidden><div class="original-popover-head"><span id="original-title">영어 원문 <small>Original</small></span><button id="close-original" aria-label="원문 닫기">×</button></div><div id="original-content" lang="en"></div></div><div id="toast" role="status" aria-live="polite"></div></body></html>'''


def render_page(page, allow_missing=False):
    key = page['key']
    source = (ROOT / 'content/en' / (key + '.md')).read_text()
    units = json.loads((ROOT / 'content/units' / (key + '.json')).read_text())
    ko_file = ROOT / 'content/ko' / (key + '.json')
    ko = json.loads(ko_file.read_text()) if ko_file.exists() else {}
    missing = [u['id'] for u in units if u['id'] not in ko]
    if missing and not allow_missing:
        raise ValueError(f'{key}: missing {len(missing)} translation units')
    md = make_md(page)
    tokens = md.parse(source)
    by_token = {}
    for unit in units:
        by_token.setdefault(unit['token'], []).append(unit)
    toc, templates, headings, search_parts, code_checks = [], [], Counter(), [], []
    h1_seen = False
    for i, token in enumerate(tokens):
        if token.type == 'heading_open':
            original = tokens[i + 1].content
            base = slug(plain(md, original))
            occurrence = headings[base]
            headings[base] += 1
            anchor = base + (f'-{occurrence}' if occurrence else '')
            token.attrSet('id', anchor)
            translation = by_token.get(i + 1, [])
            translated = ko.get(translation[0]['id'], original) if translation else original
            if token.tag != 'h1':
                toc.append((int(token.tag[1]), anchor, plain(md, translated)))
        if token.type == 'inline':
            original = token.content
            unit = by_token.get(i, [None])[0]
            if unit:
                translated = ko.get(unit['id'], original)
                if translated != original:
                    # Explanatory translations can be longer without changing block boundaries.
                    tokens_ko = md.parseInline(inline_markup(translated))
                    english = md.renderInline(inline_markup(original, original=True))
                    korean = md.renderer.render(tokens_ko, md.options, {})
                    original_id = 'original-' + unit['id']
                    templates.append(f'<template id="{original_id}">{english}</template>')
                    is_heading = i > 0 and tokens[i - 1].type == 'heading_open'
                    is_cell = i > 0 and tokens[i - 1].type in ('th_open', 'td_open')
                    cls = 'translation-unit' + (' heading-unit' if is_heading else '') + (' cell-unit' if is_cell else '')
                    content = f'<span class="{cls}" tabindex="0" data-original="{original_id}"><button class="original-trigger" type="button" aria-label="이 문단의 영어 원문 보기" aria-expanded="false" aria-controls="original-popover">원문</button><span class="translation-content">{korean}</span></span>'
                    token.children = [Token('html_inline', '', 0, content=content)]
                    search_parts.append(plain(md, translated))
                else:
                    # Keep code-only table terms exactly as in upstream.
                    search_parts.append(plain(md, original))
            else:
                search_parts.append(plain(md, original))
                formatted = inline_markup(original)
                if formatted != original:
                    token.children = md.parseInline(formatted)[0].children
        elif token.type == 'fence':
            original = displayed_code(token)
            language = token.info.split(',')[0].strip().split(' ')[0]
            code = original
            for unit in reversed(by_token.get(i, [])):
                translated = ko.get(unit['id'], unit['text'])
                if not re.match(r'^\s*(//|/\*|\*|#(?!\[))', unit['text']):
                    if translated != unit['text']:
                        raise ValueError(f'{key} {unit["id"]}: Rust attribute or code was translated')
                code = code[:unit['offset']] + translated + code[unit['offset'] + unit['length']:]
            docs_count = 0
            if language == 'rust':
                doc_spans = [(offset, value) for offset, kind, value in get_lexer_by_name('rust').get_tokens_unprocessed(code) if kind in String.Doc and re.search(r'[A-Za-z]{2}', value)]
                for offset, value in reversed(doc_spans):
                    if value not in DOC_COMMENTS and not allow_missing:
                        raise ValueError(f'{key}: missing Rust documentation comment {value!r}')
                    code = code[:offset] + DOC_COMMENTS.get(value, value) + code[offset + len(value):]
                docs_count = len(doc_spans)
            original_semantics = code_semantics(original, language)
            if original_semantics != code_semantics(code, language):
                raise ValueError(f'{key}: executable code changed in fence {i}')
            if language == 'rust':
                def documentation_code_terms(text):
                    comments = ''.join(value for _, kind, value in get_lexer_by_name('rust').get_tokens_unprocessed(text) if kind in String.Doc)
                    return Counter(re.findall(r'`+([^`]+)`+', comments))
                if documentation_code_terms(original) != documentation_code_terms(code):
                    raise ValueError(f'{key}: code identifiers inside Rust documentation comments changed')
            code_checks.append({'token': i, 'language': language, 'sha256_excluding_comments': hashlib.sha256(original_semantics.encode()).hexdigest(), 'ordinary_comment_units': len(by_token.get(i, [])), 'documentation_comments': docs_count, 'code_unchanged': True})
            if language == 'mermaid':
                # The original diagram itself is preserved; rendering runs with strict security.
                content = '<figure class="diagram"><div class="mermaid">' + e(code) + '</div><details><summary>도식 소스 보기</summary><pre><code>' + e(code) + '</code></pre></details></figure>'
            else:
                try:
                    lexer = get_lexer_by_name(language) if language else TextLexer()
                except Exception:
                    lexer = TextLexer()
                rendered = highlight(code, lexer, HtmlFormatter(nowrap=True))
                original_id = f'original-code-{i}'
                templates.append(f'<template id="{original_id}"><pre><code>{e(original)}</code></pre></template>')
                content = f'<div class="code-block"><div class="code-toolbar"><span>{e(language or "text")}</span><div><button class="code-original" data-original="{original_id}" aria-controls="original-popover" aria-expanded="false">원문</button><button class="copy-code" type="button">복사</button></div></div><pre tabindex="0"><code class="language-{e(language)}">{rendered}</code></pre></div>'
            token.type = 'html_block'
            token.content = content + '\n'
        elif token.type == 'html_block':
            # The handful of upstream raw tables contain values, not executable content.
            token.content = re.sub(r'(src|href)="([^"]+)"', lambda m: m.group(1) + '="' + e(rewrite_url(m.group(2), page, m.group(1) == 'src')) + '"', token.content)
    rendered = md.renderer.render(tokens, md.options, {})
    if page.get('stub'):
        rendered += '<aside class="reader-note"><strong>원문 작성 상태</strong><p>이 항목은 현재 원본 목차에 포함되지 않은 초안입니다. 제목만 있거나 간단한 안내만 있는 원문의 작성 상태를 그대로 표시합니다.</p></aside>'
    tips = READER_NOTES.get(key)
    if tips:
        note = '<aside class="reader-note"><div class="note-label">읽기 도움말 · 번역자 설명</div>' + tips + '</aside>'
        rendered = re.sub(r'(</h1>)', r'\1' + note.replace('\\', '\\\\'), rendered, count=1) if '<h1' in rendered else note + rendered
    if key in SOURCE_NOTES:
        note = '<details class="source-note"><summary>원문 대조 메모 · 번역자 설명</summary><p>' + SOURCE_NOTES[key] + '</p></details>'
        rendered = re.sub(r'(</h1>)', r'\1' + note.replace('\\', '\\\\'), rendered, count=1) if '<h1' in rendered else note + rendered
    if not '<h1' in rendered:
        rendered = '<h1>' + e(TITLE[key]) + '</h1>' + rendered
    toc_html = '<nav><ul>' + ''.join(f'<li class="toc-level-{level}"><a href="#{anchor}">{e(label)}</a></li>' for level, anchor, label in toc) + '</ul></nav>'
    rendered += ''.join(templates)
    search = {'key': key, 'title': TITLE[key], 'english': page['title_en'], 'text': '\n'.join(search_parts), 'headings': [{'id': anchor, 'title': label} for level, anchor, label in toc]}
    return rendered, toc_html, search, code_checks, len(missing)


READER_NOTES = {
 'introduction': '<p>이 문서는 데이터가 <strong>어디에 놓이고, 언제 계산되는지</strong>를 직접 정하며 NPU 커널(kernel)을 만드는 방법을 다룹니다. 배열과 행렬, 기본적인 Rust 문법을 알고 있다면 빠른 시작부터 읽어도 좋습니다.</p>',
 'quick-start/tensor-and-contraction': '<p>텐서(tensor)는 여러 축(axis)으로 값을 찾는 배열입니다. 수축(contraction)은 두 텐서의 값을 곱한 뒤, <strong>출력에서 없앨 공통 축</strong>을 따라 결과를 더해 모으는 계산입니다. 두 입력이 공유하는 축이라도 배치 축(batch axis)처럼 출력에 남는 축이 있으므로, 어떤 축을 더해 모을지 구분해야 합니다. 내적(dot product)과 행렬곱(matrix multiplication)이 대표적인 예입니다.</p>',
 'mapping-tensors/index': '<p>같은 행렬도 메모리에 한 행씩 놓을 수 있고, 여러 슬라이스(slice)에 나누어 놓을 수도 있습니다. <strong>논리 축(logical axis)</strong>은 행·열처럼 데이터의 의미를 나타내고, <strong>물리 차원(physical dimension)</strong>은 칩·슬라이스·레인처럼 실행 위치를 나타냅니다. 매핑(mapping)은 이 둘의 관계를 정합니다.</p>',
 'moving-tensors/index': '<p>코드에서 텐서(tensor)의 이름이 같아 보여도, 저장 위치와 데이터를 읽는 순서는 다를 수 있습니다. 먼저 출발지와 목적지를 찾고, 그 사이를 담당하는 엔진(engine)과 수명(lifetime)을 확인하면 예제를 따라가기 쉽습니다.</p>',
 'computing-tensors/contraction-engine/index': '<p>수축 연산기(Contraction Engine)의 흐름은 <strong>값을 맞춰 펼치기(broadcast) → 곱하기(multiply) → 더해 모으기(reduce)</strong>입니다. 아래 각 단계는 어떤 차원의 값을 한꺼번에 계산하고, 어떤 차원의 값을 여러 사이클(cycle)에 걸쳐 모으는지 구분합니다.</p>',
 'computing-tensors/vector-engine/index': '<p>벡터 엔진(Vector Engine)은 수집 엔진(Collect Engine) 또는 수축 연산기(Contraction Engine)에서 받은 값에 활성화 함수(activation function), 정규화(normalization) 등을 적용하거나 값을 축약(reduction)하는 데 쓰입니다. 수축 연산을 반드시 먼저 거칠 필요는 없습니다. 플릿(flit)은 엔진 사이에서 한 번에 전달되는 묶음입니다. 입력 값과 저장된 피연산자(operand)가 어떤 단계를 통과하는지 먼저 따라가세요.</p>',
 'scheduling/index': '<p>스케줄(schedule)은 연산과 데이터 이동을 언제 시작할지 정한 실행 순서입니다. 두 작업의 계산 결과가 독립적이어도, 같은 메모리나 엔진(engine)을 사용하면 동시에 실행하지 못할 수 있습니다. 데이터 의존성(data dependency)과 자원 사용을 함께 읽어야 합니다.</p>',
 'moving-tensors/memory-performance': '<p>대역폭(bandwidth)은 일정 시간에 옮길 수 있는 데이터 양입니다. 아래 수치는 원문이 제시한 조건을 그대로 옮겼습니다. 예를 들어 정렬(alignment)과 뱅크(bank) 배치가 달라지면 같은 데이터 양이어도 실제 처리 속도가 달라집니다.</p>',
 'computing-tensors/vector-engine/intra-slice-chain': '<p>스태시(stash)는 계산 중인 값을 잠시 저장해 뒤의 연산에서 한 번 읽는 슬롯(slot)입니다. 한 번 저장·한 번 읽기가 기본 규칙이며, 사용하면 컴파일러(compiler)가 슬라이스(slice)마다 VRF 1 KiB를 예약합니다. 미리 적재한 VRF 피연산자(operand)와 공간을 공유한다는 점을 먼저 기억하면 아래 설명을 읽기 쉽습니다.</p>',
 'computing-tensors/vector-engine/vcg': '<p>유효 개수 생성기(Valid Count Generator, VCG)는 입력 플릿(flit)에서 실제 데이터가 몇 개인지 셉니다. 아래 <code>R</code>을 <code>Packet</code>에 놓는 예제에서 VCG는 입력의 <code>R # 8</code>을 기준으로 셉니다. 이후 <code>vector_narrow_trim</code>을 거친 연산은 <code>R # 4</code>를 사용하므로, 두 표기는 처리 시점이 다릅니다.</p>',
}

SOURCE_NOTES = {
 'mapping-tensors/index': '매핑(mapping)은 논리적 데이터와 물리적 저장 위치의 대응 관계입니다. 도입부의 개념 설명과 달리, 아래 <code>E::map(position)</code> 예제에서 함수가 평가하는 방향은 <strong>물리적 위치 → 해당 위치의 셀(Cell)</strong>입니다. 두 표현을 같은 방향의 함수라고 생각하지 않도록 구분해 읽으세요.',
 'moving-tensors/dma-engine': '첫 예제의 원문에는 “슬라이스당 256개 원소”와 “슬라이스당 8개 원소”라는 설명이 함께 있습니다. 제시된 <code>A = 2048</code>, <code>A / 8</code>, <code>A % 8</code>을 보면 256 × 8 = 2,048로 읽어야 수가 맞습니다. 번역문은 원문을 보존하며 이 차이를 별도로 알립니다.',
 'computing-tensors/contraction-engine/time-reducer': '예제 코드와 주석에는 <code>B / 16</code>이 쓰이지만, 뒤의 누산기 설명에는 <code>B / 4</code>가 등장합니다. 두 표기는 원문부터 서로 다릅니다. 예제를 따라갈 때에는 실제 코드의 축(axis) 크기와 표현식을 함께 확인하세요.',
 'computing-tensors/register-files': '원문은 정수 저장 시 <code>i8 → i9</code> 승격을 설명한 직후, <code>i8</code>가 원래 8비트를 유지한다고도 서술합니다. 두 설명을 모두 원문대로 번역했습니다. 저장 비트 폭을 확정해야 할 때에는 사용 중인 버전의 실제 자료형과 API 구현을 함께 확인해야 합니다.',
 'computing-tensors/contraction-engine/lane-folder': '순차 모드(Sequential mode)의 앞 설명에서는 8개 단위 패딩(padding)을 다루지만, 성능 문단에는 패딩이 없다는 표현이 있습니다. 본문은 양쪽을 원문대로 옮겼습니다. 실제 동작을 판단할 때에는 출력 패킷 크기와 매핑 표현식(mapping expression)을 함께 확인하세요.',
 'computing-tensors/switch-engine': '이 장에는 “칩당 256개 슬라이스”라는 표현이 있습니다. 반면 빠른 시작의 하드웨어 표는 칩(chip)마다 클러스터(cluster) 2개, 클러스터마다 슬라이스(slice) 256개로 설명합니다. 원문의 표현 차이를 그대로 보존했으므로, 링(ring)의 범위와 전체 칩의 슬라이스 수를 구분해 읽어야 합니다.',
}


def home():
    cards = [
        ('quick-start/setup-and-tooling', '환경부터 준비하기', '설치, 첫 프로젝트, CPU 검증과 NPU 빌드'),
        ('mapping-tensors/index', '데이터가 놓이는 방식', '논리 축과 물리 차원, 매핑 표현식'),
        ('moving-tensors/index', '메모리 사이로 옮기기', 'HBM·DM·레지스터와 데이터 이동'),
        ('computing-tensors/index', '엔진이 계산하는 방식', '수축·벡터·형 변환·전치 연산'),
        ('kernel-examples/index', '예제로 연결하기', '트랜스포머와 전체 커널 실행 흐름'),
        ('scheduling/index', '실행 순서와 성능', '스케줄을 읽고 병목을 진단하는 방법'),
    ]
    content = '''<section class="book-intro"><div class="eyebrow">PROGRAMMING TENSOR CONTRACTION PROCESSORS</div><h1>furiosa-opt,<br><span>한국어로 차근차근.</span></h1><p class="lead">텐서의 배치부터 커널의 실행까지.<br>코드와 그림을 따라가며 Furiosa NPU 프로그래밍을 읽습니다.</p><div class="hero-actions"><a class="primary-link" href="introduction.html">문서 읽기</a><a class="secondary-link" href="quick-start/setup-and-tooling.html">설치부터 시작하기</a></div><div class="book-facts"><span>원본 목차 47개 문서</span><span>문단별 영어 원문</span><span>코드 주석 한국어 번역</span></div></section><section class="home-section"><div class="section-heading"><h2>어디서부터 읽을까요?</h2><a href="about.html">번역 안내·용어집</a></div><div class="learning-grid">'''
    for key, title, text in cards:
        content += f'<a class="learning-card" href="{key}.html"><span class="card-label">{e(TITLE[key])}</span><h3>{title}</h3><p>{text}</p></a>'
    content += '''</div></section><section class="how-to-read"><div><span class="hint-badge">EN</span><h2>원문과 함께 읽는 문서</h2><p>컴퓨터에서는 문단에 마우스를 올리세요.<br>모바일에서는 문단 왼쪽 위의 <strong>원문</strong> 버튼을 누르세요.</p></div><div class="sample-paragraph"><span class="translation-unit" tabindex="0" data-original="original-demo"><button class="original-trigger" aria-label="예시 문단의 영어 원문 보기" aria-expanded="false" aria-controls="original-popover">원문</button><span class="translation-content">수축(contraction)은 세 단계로 나뉩니다. 값을 맞춰 펼치고(broadcast), 서로 곱한 다음(multiply), 결과를 더해 모읍니다(reduce).</span></span><small>여기에 마우스를 올리거나 원문 버튼을 눌러 보세요.</small></div></section><template id="original-demo">A contraction decomposes into three steps: Broadcast, Multiply, Reduce.</template><aside class="reader-note"><div class="note-label">번역 기준</div><p>소프트웨어 공학과 3학년 독자를 기준으로 문장을 다듬고, 주요 용어에는 영어를 병기했습니다. 원문을 번역한 내용과 추가한 읽기 도움말을 구분합니다. 원문 문서 47개, 저장소 안내 등 부록 8개와 초안·짧은 안내 항목 6개를 담았습니다.</p></aside>'''
    page = {'key': 'index', 'title': 'furiosa-opt 한국어 문서'}
    return shell(page, content, '<nav><ul><li><a href="introduction.html">소개</a></li><li><a href="quick-start.html">빠른 시작</a></li><li><a href="repository.html">저장소 안내</a></li><li><a href="runtime.html">런타임 안내</a></li><li><a href="changes.html">변경 이력</a></li></ul></nav>', home=True)


def about():
    glossary = [
        ('텐서', 'tensor', '여러 축으로 위치를 정해 값을 찾는 배열'),
        ('축', 'axis', '행·열·배치처럼 데이터를 구분하는 논리 방향'),
        ('매핑', 'mapping', '논리 좌표와 물리적 배치·순서를 연결하는 규칙'),
        ('슬라이스', 'slice', '데이터 메모리와 텐서 유닛을 갖춘 병렬 처리 단위'),
        ('레인', 'lane', '수축 연산기 안에서 병렬로 곱셈·축약에 참여하는 경로'),
        ('수축', 'contraction', '두 입력을 곱한 뒤 공통 축을 따라 더해 모으는 계산'),
        ('축약', 'reduction', '한 축의 여러 값을 합·최댓값 등 하나의 값으로 모으는 연산'),
        ('브로드캐스트', 'broadcast', '같은 값을 여러 계산 위치에서 사용할 수 있게 맞춰 펼치는 동작'),
        ('패킷', 'packet', '스트림에서 한 사이클에 처리하는 값의 묶음'),
        ('시퀀서', 'sequencer', '매핑에 맞춰 값을 읽고 쓰는 순서를 만드는 장치'),
        ('누산기', 'accumulator', '여러 단계에서 나온 부분 결과를 계속 더해 보관하는 공간'),
        ('스케줄', 'schedule', '데이터 이동과 연산의 실행 시점을 정한 계획'),
        ('오라클', 'oracle', '커널 결과와 비교할 정답을 계산하는 기준 구현'),
        ('내림 변환', 'lowering', '상위 수준 표현을 하드웨어가 실행할 수 있는 더 구체적인 표현으로 바꾸는 과정'),
    ]
    rows = ''.join(f'<tr><th scope="row">{ko}({en})</th><td>{meaning}</td></tr>' for ko, en, meaning in glossary)
    stubs = ''.join(f'<li><a href="{p["key"]}.html">{TITLE[p["key"]]}({p["title_en"]})</a></li>' for p in PAGES if p.get('stub'))
    content = f'''<h1>번역 안내와 용어집</h1><p class="lead">코드와 원문을 직접 확인하며 읽을 수 있도록 만들었습니다.</p><h2 id="scope">수록 범위와 기준</h2><p><a href="https://github.com/furiosa-ai/furiosa-opt">furiosa-ai/furiosa-opt</a>의 문서 목차에 있는 47개 문서, 저장소·런타임·예제·변경 이력 등 부록 8개, 목차 밖의 미작성 항목 6개를 담았습니다. Rust의 전체 소스 코드와 자동 생성 API 참조(rustdoc)는 원본 링크로 연결합니다.</p><p>기준 커밋(commit)은 <a href="https://github.com/furiosa-ai/furiosa-opt/commit/{COMMIT}"><code>{COMMIT}</code></a>이며, 번역 기준일은 2026년 11월 21일입니다. 이후 원본 변경이 자동으로 반영되는 사이트는 아닙니다.</p><h2 id="translation">문장을 읽는 방법</h2><ul><li>한국어 문단에 마우스를 올리거나 키보드로 초점을 옮기면 해당 영어 원문이 표시됩니다.</li><li>모바일에서는 각 문단 왼쪽 위의 <strong>원문</strong> 버튼을 누릅니다. 바깥 영역이나 닫기 버튼으로 닫을 수 있습니다.</li><li>코드의 식별자(identifier), 함수 호출, 자료형, 문자열과 수치는 원문을 유지하고 주석(comment)을 번역했습니다. 코드 블록의 원문 버튼으로 번역 전 주석도 확인할 수 있습니다.</li><li><strong>읽기 도움말 · 번역자 설명</strong> 표시는 독자의 이해를 돕기 위해 추가한 설명입니다. 영어 원문의 번역과 구분됩니다.</li><li>원문의 그림·도식과 수식, 표, 관련 문서 링크를 함께 제공합니다. 원문 그림에는 영어 표기가 남아 있습니다.</li></ul><h2 id="glossary">용어를 읽는 기준</h2><div class="table-scroll"><table><thead><tr><th>표기</th><th>이 문서에서의 뜻</th></tr></thead><tbody>{rows}</tbody></table></div><h2 id="upstream">원문 상태와 참조 보정</h2><p>원문에서 코드 선언이 다른 파일로 이동했지만 문서의 포함 경로(include path)가 남아 있던 세 곳을 확인했습니다. <code>trf_tensor_def</code>와 <code>vrf_tensor_def</code>는 <code>tensor/memory/register_file.rs</code>, <code>dma_impl</code>은 <code>tensor/memory/hbm.rs</code>의 같은 이름 선언을 표시합니다. 코드 내용은 해당 기준 커밋의 내용을 사용합니다.</p><p>아래 항목은 원문 목차 밖의 초안·짧은 안내입니다. 제목만 있는 항목도 원문의 작성 상태를 그대로 표시합니다.</p><ul>{stubs}</ul><h2 id="license">출처와 라이선스</h2><p>원문 저작권: Copyright 2025–2026 FuriosaAI, Inc. 원문과 파생 번역은 <a href="LICENSE">Apache License 2.0</a>을 따릅니다. <a href="NOTICE">원문 고지(NOTICE)</a>를 함께 보존했습니다. 이 사이트는 FuriosaAI의 공식 번역이 아닌 커뮤니티 한국어판입니다.</p><p>한국어 번역과 사이트 구성 · <strong>No5</strong></p>'''
    return shell({'key': 'about', 'title': '번역 안내·용어집'}, content, '<nav><ul><li><a href="#scope">수록 범위</a></li><li><a href="#translation">원문 확인 방법</a></li><li><a href="#glossary">용어집</a></li><li><a href="#upstream">원문 상태</a></li><li><a href="#license">출처와 라이선스</a></li></ul></nav>')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--allow-missing', action='store_true')
    args = parser.parse_args()
    searches, checks, missing_total = [], {}, 0
    for index, page in enumerate(PAGES):
        content, toc, search, check, missing = render_page(page, args.allow_missing)
        missing_total += missing
        previous = PAGES[index - 1] if index > 0 else None
        following = PAGES[index + 1] if index + 1 < len(PAGES) else None
        target = ROOT / (page['key'] + '.html')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(shell(page, content, toc, previous, following))
        searches.append(search)
        checks[page['key']] = check
    (ROOT / 'index.html').write_text(home())
    (ROOT / 'about.html').write_text(about())
    (ROOT / 'assets/search-index.json').write_text(json.dumps(searches, ensure_ascii=False, separators=(',', ':')))
    (ROOT / 'assets/code.css').write_text(HtmlFormatter(style='friendly').get_style_defs('.code-block'))
    (ROOT / 'content/code-verification.json').write_text(json.dumps(checks, ensure_ascii=False))
    print(json.dumps({'html_pages': len(PAGES) + 2, 'missing_translation_units': missing_total, 'source_commit': COMMIT}, ensure_ascii=False))


if __name__ == '__main__':
    main()
