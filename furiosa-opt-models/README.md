# furiosa-opt-models 한국어 문서

웹사이트: https://smallstep-zzz.github.io/furiosa-docs-ko/furiosa-opt-models/

`furiosa-ai/furiosa-opt-models`의 공식 문서를 기준으로 작성한 **비공식 한국어판**입니다. Furiosa-LLM과는 별개의 실험적 엔진/플러그인 스택을 설명하므로, 각 제품의 옵션과 지원 범위를 혼동하지 않도록 주의합니다.

## 원문과 번역 범위 (2026-11-27)

- 원본 저장소: https://github.com/furiosa-ai/furiosa-opt-models
- 고정 기준 커밋: `c982976100d18d7a9641d5a8c22b89cec4544049` (2026-11-11)
- 원본 문서: `docs/` 하위 **31개 Markdown 파일**(테마용 Partials 제외)
- **13개 문서**: 한국어 본문 번역 및 코드·옵션 예시 제공
- **7개 문서**: 핵심 항목 발췌 번역, 원문에서 생략한 영역을 명시
- **11개 문서**: 개별 모델 대시보드 페이지 — 한국어 페이지 없음, 공식 원문으로 연결
- 코드에 삽입되는 `{{ ... }}` 템플릿/`--8<--` Include는 그 자리에서 추측해 복원하지 않습니다. 동적 버전·벤치마크는 공식 배포 페이지에서 확인해야 합니다.

### 번역한 문서 13개

| 구분 | 문서 |
|---|---|
| 시작하기 | 첫 화면, 설치, 빠른 시작, 모델 실행 개념 |
| 서빙 | vLLM 옵션, SGLang 옵션 |
| 엔진 | Python 직접 사용, 프레임워크 통합 |
| 구조·검증 | 아키텍처, 테스트 원칙 |
| 참조 | 환경변수, 문제 해결, Rust API 안내 |

### 발췌 번역 7개

| 문서 | 원문에서 더 확인해야 할 내용 |
|---|---|
| Serving | 임베딩/투기 디코딩/수면/양자화/컨텍스트 확장/동적 기능 지원표 등 |
| Writing a kernel | Rust Include 본문 (`Add` 구현·검증용 실제 소스) |
| Model composition | NeMo 조합 Rust 예제, 전체 레지스트리·호스트 구현 |
| Adding a model | Checkpoint별 실제 Rust 컴포지션 코드 |
| Testing and benchmarking | 동적으로 생성되는 최신 벤치마크 실행 명령 |
| Python reference | Stub에서 생성되는 개별 타입/함수별 시그니처 |
| Models | CI에서 생성하는 모델별 성능표·대시보드 |

### 아직 번역하지 않은 11개 원문

`docs/models/`의 개별 체크포인트 페이지 11개:
`gemma4-12b`, `llama3-8b`, `llama3.1-8b-nvfp4`, `mistral-7b`, `mistral-nemo`, `qwen3-0.6b`, `qwen3-1.7b`, `qwen3-4b`, `qwen3-8b`, `qwen3-embedding`, `qwen3-reranker`.

대부분의 모델별 원문은 **짧은 Markdown + CI 대시보드 Include**로 구성되어 있으므로, 실제 원문 웹페이지의 동적 성능 수치·그림을 보존하는 작업이 추가로 필요합니다. 번역이 없는 항목은 한국어 사이트 목차에서 ↗ 표시와 함께 공식 원문으로 이동합니다.

## 웹 기능

- 한 화면에서 목차·현재 본문·소목차 확인(모바일 좌상단 목록 버튼)
- `?doc=...` 주소로 각 문서를 직접 열고 브라우저 뒤로 가기 지원
- 번역 문단에 `EN ↕` 원문 열기 버튼, 데스크톱 Hover, 상단 `영문 병기` 일괄 열기
- 원문 GitHub 링크, 원문 공식 문서 링크, 전문 용어 영문 유지
- 다크모드에서 코드 영역 포함 색상 반전, 코드 복사 버튼, 문서 제목 검색
- 번역한 문서와 부분 번역/번역 전 문서 상태 구분

## 검증 경계

- 커널/모델 지원 여부는 문서 버전의 서술이며 **실제 설치 SDK의 지원 보장은 아닙니다**.
- 원본의 `furiosa-opt-models`는 자체 `furiosa_opt_engine`과 vLLM/SGLang 플러그인을 사용합니다. 기존 Furiosa-LLM의 `furiosa-llm serve`, FXB의 TP/PP 옵션과 동일한 구현이라고 간주하지 않습니다.
- `--kv-offloading-size`와 `--hicache-*`은 호스트 캐시 계층 설정이며 NPU KV Cache Pool의 직접 지정이 아닙니다.
- `Cache(spec, blocks)`는 엔진에서 KV Pool을 명시적으로 할당하는 API입니다. 해당 API를 Furiosa-LLM 서빙에 바로 적용할 수 있다는 보장은 없습니다.
- 페이지의 공식 출처 및 원문 링크를 남기고, 요약이거나 코드가 누락된 문서는 ‘발췌 번역’으로 표시했습니다.

원문 저작권 © 2026 FuriosaAI, Inc. / Apache-2.0. 본 번역은 공식 문서가 아닙니다.
