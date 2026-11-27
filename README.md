# Furiosa 문서 한국어판

[Furiosa Developer Center](https://developer.furiosa.ai/stable/en/) 2026.4.1의 정적 파일을 바탕으로 한 비공식 한국어 번역본입니다. 82개 HTML 문서의 본문과 탐색 메뉴를 번역했고 코드, 이미지, 원본 테마와 링크 구조를 보존했습니다. 자동 번역이므로 운영 환경에 적용하기 전 원문과 대조하세요.

원본: [furiosa-ai/furiosa-ai.github.io](https://github.com/furiosa-ai/furiosa-ai.github.io), commit `76b58092f0f53ab0fb5bfa7124c4ee0e9cd8bda6`, `v2026.4.1/en`. 저작권은 원 저작권자에게 있습니다. 공개 재배포 전에 원본 콘텐츠 및 이미지의 이용 허가를 확인하세요.

## 미리 보기

```sh
python3 -m http.server 8000
```

브라우저에서 `http://localhost:8000/`을 여세요. 파일을 직접 여는 방식은 검색 등 일부 기능이 작동하지 않을 수 있습니다.

## GitHub Pages 배포

이 폴더의 내용을 별도 GitHub 저장소의 루트에 올리고 기본 브랜치 이름을 `main`으로 설정한 뒤, 저장소 Settings → Pages → Build and deployment의 Source를 **GitHub Actions**로 선택합니다. `main`에 푸시하면 포함된 workflow가 정적 파일을 배포합니다. 저장소 정책과 공개 저장소 여부에 따라 Pages 사용 가능 여부가 달라질 수 있습니다.

버전 선택기는 원본 버전 목록을 사용하므로 다른 버전을 선택하면 원본 사이트로 이동할 수 있습니다. 검색 인덱스는 원본 Sphinx 색인을 유지하므로 검색어는 영어 중심으로 동작할 수 있습니다. MathJax 및 버전 목록 등 일부 리소스는 외부 네트워크가 필요합니다.

## 추가 한국어 문서

- [furiosa-opt 한국어 설명서](https://smallstep-zzz.github.io/furiosa-docs-ko/furiosa-opt/) — 공식 설명서 47개 장과 부록 번역.
- [furiosa-opt-models 한국어 안내서](https://smallstep-zzz.github.io/furiosa-docs-ko/furiosa-opt-models/) — 2026-11-27 기준 원본 31개 문서 중 13개 본문 번역, 7개 발췌 번역, 모델별 대시보드 11개 원문 연결. [번역 범위 및 남은 문서](furiosa-opt-models/README.md)를 참고하세요.

이 두 문서 묶음은 위에 설명한 SDK 2026.4.1 HTML 82개와 별도로 관리되며, 원문 버전도 다를 수 있습니다.
