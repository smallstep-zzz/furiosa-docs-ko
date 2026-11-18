# Furiosa 문서 한국어판 — 작업 중

[Furiosa Developer Center](https://developer.furiosa.ai/stable/en/) 2026.4.1의 정적 파일을 바탕으로 한 비공식 번역 작업본입니다. 첫 화면의 소개와 카드 일부, Furiosa-LLM 소개 문서가 번역되었고 대부분의 문서와 검색 색인은 영어입니다. 아직 완성된 한국어판이 아닙니다. 코드, 이미지, 원본 테마와 링크 구조를 보존했습니다.

원본: [furiosa-ai/furiosa-ai.github.io](https://github.com/furiosa-ai/furiosa-ai.github.io), commit `76b58092f0f53ab0fb5bfa7124c4ee0e9cd8bda6`, `v2026.4.1/en`. 저작권은 원 저작권자에게 있습니다. 공개 재배포 전에 원본 콘텐츠 및 이미지의 이용 허가를 확인하세요.

## 미리 보기

```sh
python3 -m http.server 8000
```

브라우저에서 `http://localhost:8000/`을 여세요. 파일을 직접 여는 방식은 검색 등 일부 기능이 작동하지 않을 수 있습니다.

## GitHub Pages 배포

이 폴더의 내용을 별도 GitHub 저장소의 루트에 올리고 기본 브랜치 이름을 `main`으로 설정한 뒤, 저장소 Settings → Pages → Build and deployment의 Source를 **GitHub Actions**로 선택합니다. `main`에 푸시하면 포함된 workflow가 정적 파일을 배포합니다. 저장소 정책과 공개 저장소 여부에 따라 Pages 사용 가능 여부가 달라질 수 있습니다.

버전 선택기는 원본 버전 목록을 사용하므로 다른 버전을 선택하면 원본 사이트로 이동할 수 있습니다. 검색 인덱스도 원본 영어 기준입니다. MathJax 및 버전 목록 등 일부 리소스는 외부 네트워크가 필요합니다. 번역을 확대할 때 코드와 명령어를 보존하고 검색 인덱스를 재생성해야 합니다.
