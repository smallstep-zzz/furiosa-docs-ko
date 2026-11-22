# furiosa-opt 한국어 문서

**웹사이트:** https://smallstep-zzz.github.io/furiosa-docs-ko/furiosa-opt/

FuriosaAI의 공식 `furiosa-opt` 설명서 **Programming Tensor Contraction Processors**를 소프트웨어 공학과 3학년 독자에게 맞춰 번역한 정적 HTML 사이트입니다. 영어 원문을 문단별로 확인하며 읽을 수 있습니다. 공식 웹 문서와 GitHub 원본을 모두 연결합니다.

## 수록 내용

- 원본 `docs/src/SUMMARY.md`에 수록된 문서 47개 전체
- 저장소 README, 런타임, 부트로더, 디바이스 ABI, MNIST·Transformer 예제 README, 커널 작성 스킬, 변경 이력 등 부록 8개
- 원본 목차 밖의 초안·짧은 안내 문서 6개
- 첫 화면과 번역 안내·용어집: 총 HTML 63페이지

Rust 전체 구현과 자동 생성 `rustdoc` API 참조는 원본 링크로 연결합니다. 이 저장소에는 커널 프로그램을 별도로 구현하거나 변경하지 않습니다.

## 읽기 기능

- 데스크톱: 왼쪽 전체 목차, 오른쪽 현재 문서의 소목차
- 모바일: 왼쪽 위 버튼으로 목차 열기·닫기
- 문단에 마우스를 올리거나 원문 버튼을 눌러 영어 원문 확인
- 긴 원문은 팝업 내부 스크롤, 화면 위·아래 공간에 맞춰 팝업 배치
- 한국어·영어 본문 검색, 코드 복사, 밝은·어두운 테마
- 코드 배경·문법 강조·복사 버튼·원문 코드 팝업까지 함께 바뀌는 다크모드
- 키보드 탐색, Escape로 닫기, 가로로 스크롤하는 코드와 표
- 주요 용어의 한국어·영어 병기, 별도로 표시한 번역자 읽기 도움말

## 원본 기준

- 공식 설명서: https://developer.furiosa.ai/furiosa-opt/book/
- 공식 웹 문서 대조일: 2026-11-22
- 원본 저장소: https://github.com/furiosa-ai/furiosa-opt
- 고정 커밋: `3d43bc9d20f324af60e3006c3f1541938d7f5097`
- 번역 기준일: 2026-11-21
- 원문 저작권: Copyright 2025–2026 FuriosaAI, Inc.
- 원문과 파생 번역: Apache-2.0. `LICENSE`와 원문의 `NOTICE`를 보존했습니다.

공식 FuriosaAI 번역이 아닌 커뮤니티 한국어판입니다. 원문 변경은 자동 반영하지 않습니다. 원문 자체의 수치·설명 불일치는 임의로 고치지 않고 해당 문서의 ‘원문 대조 메모’에서 구분해 설명합니다.

## 공식 웹 문서와의 관계

공식 개발자 사이트의 목차 47개 문서를 고정 커밋의 영어 원문과 대조했습니다. 공식 웹 설명서와 GitHub 문서가 같은 본문을 제공하므로 하나의 한국어판에서 읽을 수 있도록 통합했습니다. 각 문서의 **원문링크**는 공식 웹 문서를, **GitHub**는 번역 기준 커밋의 원본 파일을 엽니다. 부록은 해당 GitHub 원본으로 연결합니다.

공식 배포본의 경고문·수식·각주·스마트 따옴표 등 렌더링 차이는 명시적으로 정규화해 비교합니다. 공식 배포본에서 비어 있는 코드 영역 3곳은 기존에 복원한 동일 커밋의 선언을 유지하며, 이 예외를 별도로 기록합니다. `tools/verify-official.py`가 재현 가능한 대조를 수행하고 `content/official-site.json`에 페이지별 결과와 공식 원문 파일의 SHA-256을 저장합니다.

## 번역과 코드 보존

`content/en`은 포함 코드(include)를 펼친 고정 버전 영문 문서입니다. `content/units`는 문단·표·제목·일반 주석의 위치와 영어 원문, `content/ko`는 각 ID에 대응하는 한국어 번역입니다. `content/doc-comments.json`은 별도로 분류되는 Rust `///` 문서 주석을 번역합니다.

코드 블록에서 주석 이외의 토큰은 원문과 동일한지 빌드 시 검사합니다. mdBook에서 숨기는 `# ` 준비 코드는 웹 화면에서도 숨깁니다. 식별자, 함수 호출, 숫자, 문자열과 수식을 번역하지 않습니다. 3개의 오래된 include 경로는 같은 커밋 내의 실제 선언 위치로 연결했습니다.

원문 그림 20개는 이 사이트에 함께 보관합니다. 11 MB가 넘는 언어 서버 애니메이션 1개는 동일한 고정 커밋의 원본 URL을 사용합니다. 수식과 도식은 버전을 고정한 KaTeX 0.16.11·Mermaid 11.4.1 CDN을 사용하므로 그림·수식의 전체 표시에는 인터넷 연결이 필요합니다. 본문 번역과 목차는 완성된 정적 HTML입니다.

## 다시 빌드하기

Python 3.12 이상에서:

```bash
python -m pip install -r furiosa-opt/requirements.txt
python furiosa-opt/tools/build.py
python furiosa-opt/tools/validate.py
```

공식 웹 문서와 다시 대조하려면 다음을 실행합니다. 공식 사이트에서 내용이 바뀌었으면 검사가 실패하고 기존 대조 보고서는 유지됩니다.

```bash
python furiosa-opt/tools/verify-official.py
```

원본 버전을 갱신하려면 별도로 원본 저장소를 체크아웃한 뒤 `prepare.py <원본 체크아웃 경로>`를 실행합니다. 새로 생성되거나 바뀐 번역 단위를 모두 검토하고 번역한 다음 빌드해야 합니다. 단순히 원문만 갱신해서 게시하지 마세요.

`content/verification.json`에 문서·번역 단위·코드 블록·링크 검사 결과가 기록됩니다. 저장소의 기존 GitHub Pages workflow가 정적 파일을 게시합니다.

한국어 번역과 사이트 구성 · **No5**
