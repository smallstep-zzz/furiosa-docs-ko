window.OPT_DOCS_FOUNDATION={
  "index": {
    "title": "Furiosa RNGD에서 모델 서빙",
    "blocks": [
      [
        "p",
        "이 문서는 RNGD 가속기에서 vLLM 또는 SGLang으로 모델을 서빙하기 위한 **furiosa-opt-models** 안내서입니다. 프레임워크별 HTTP·Python API는 그대로 사용하고, 실제 모델 연산은 RNGD가 수행합니다. Furiosa-LLM을 이 엔진에 연결하는 작업은 원문 기준으로 향후 과제입니다.",
        "One model stack on the RNGD accelerator, for any serving framework. vLLM and SGLang serve it today through their own Python and HTTP APIs, and FuriosaAI's own engine, Furiosa LLM, is next."
      ],
      [
        "h2",
        "시작하기",
        "Get started"
      ],
      [
        "p",
        "먼저 `cargo-furiosa-opt`를 설치하고, 저장소 루트에서 프레임워크 플러그인을 설치합니다. 아래 두 예제 중 사용하는 프레임워크를 선택하세요.",
        "With cargo-furiosa-opt on your PATH (Installation), install a plugin from the repository root and serve a checkpoint:"
      ],
      [
        "code",
        "bash",
        "CARGO=cargo-furiosa-opt uv pip install --torch-backend cpu ./integrations/furiosa-opt-vllm\nvllm serve Qwen/Qwen3-1.7B"
      ],
      [
        "code",
        "bash",
        "CARGO=cargo-furiosa-opt uv pip install --prerelease=allow ./integrations/furiosa-opt-sglang\npython -m sglang.launch_server --model-path Qwen/Qwen3-1.7B"
      ],
      [
        "note",
        "위 명령은 **furiosa-opt-models 저장소를 내려받고 설치 조건을 갖춘 뒤** 실행하는 예제입니다. 일반 `furiosa-llm serve`나 `fxb build` 명령과 동일한 경로가 아닙니다.",
        "The plugins incubate in this repository while the interface between frameworks and the engine is designed."
      ],
      [
        "h2",
        "무엇을 할 수 있나요?",
        "What do you want to do?"
      ],
      [
        "list",
        [
          [
            "**모델 서빙:** 텍스트 생성, 임베딩 또는 리랭킹을 OpenAI 호환 서버에서 실행합니다. [[서빙 설명|serving/index]]",
            "Run an OpenAI-compatible server for text generation, embeddings or reranking."
          ],
          [
            "**성능 확인:** CI의 측정 항목과 회귀 방지 기준을 확인합니다. 원문 모델 목록에서 최신 수치를 확인하세요.",
            "See what CI measures and how it blocks a regression."
          ],
          [
            "**엔진 직접 사용:** 서빙 프레임워크 없이 Python에서 체크포인트를 적재해 실행합니다. [[엔진 사용|engine/python]]",
            "Load a checkpoint and run it from Python without a serving framework."
          ],
          [
            "**모델 추가:** 기존 모듈을 조합해 다른 모델 아키텍처를 추가합니다. 해당 개발자 문서는 아직 번역 전입니다.",
            "Compose a checkpoint's architecture from modules the models crate already has."
          ]
        ]
      ],
      [
        "h2",
        "제공하는 기능",
        "What you get"
      ],
      [
        "list",
        [
          [
            "**프레임워크 독립:** 엔진과 모델은 서빙 프레임워크를 알지 않으며, 얇은 플러그인이 각 프레임워크에 맞춥니다.",
            "Framework agnostic. The models and the engine know no serving framework; a thin plugin adapts each one, which keeps its own APIs, scheduling and sampling."
          ],
          [
            "**체크포인트 직접 적재:** 모델 구조가 컴파일된 형상과 일치하면 Hugging Face 체크포인트를 별도 변환 없이 적재합니다.",
            "Checkpoints, not conversions. A Hugging Face checkpoint loads as it is when a compiled model fits its architecture."
          ],
          [
            "**공통 엔진:** 동일한 컴파일 함수를 프레임워크를 거치지 않고 Python으로 호출할 수 있습니다.",
            "One engine underneath. The same compiled functions are callable from Python without a framework."
          ],
          [
            "**지속적인 측정:** CI가 커널, Forward, 서빙 지연을 PR 및 야간 실행에서 측정합니다.",
            "Measured continuously. CI measures kernels, forward passes and serving on RNGD every night and on request for a pull request."
          ]
        ]
      ],
      [
        "h2",
        "전체 구성",
        "How it fits together"
      ],
      [
        "p",
        "`vLLM / SGLang → 각 프레임워크 플러그인 → furiosa-opt-engine → furiosa-opt-models → RNGD` 순서입니다. 원문은 밝은/어두운 테마의 계층도 이미지를 제공하며, 아래 원문 링크에서 볼 수 있습니다.",
        "The plugins, the engine and the models make up the furiosa-opt-models repository; the models run on the RNGD accelerator."
      ],
      [
        "p",
        "프레임워크와 엔진의 경계가 안정되면 플러그인은 별도 저장소로 분리할 계획입니다. [[모델 실행 개념|concepts]]에서 설정 책임의 차이를 설명합니다.",
        "Once it settles, each moves to a dedicated repository, and this repository keeps the engine and the models."
      ]
    ]
  },
  "concepts": {
    "title": "모델은 RNGD에서 어떻게 실행될까?",
    "blocks": [
      [
        "p",
        "체크포인트는 플러그인 빌드 시 RNGD용으로 미리 컴파일된 모델 함수로 실행됩니다. 텐서 형상은 사전 컴파일 때 확정되므로, 서버는 컴파일된 함수가 처리할 수 있는 요청만 허용하며 그 한도를 시작할 때 알려 줍니다.",
        "A checkpoint runs as model functions that were compiled for RNGD when the plugin was built. Compilation fixes their shapes ahead of time, so a server accepts only what the compiled functions can run and says so when it starts."
      ],
      [
        "p",
        "요청 스케줄링, 캐시 블록 배정, 토큰 샘플링은 기존 서빙 프레임워크가 맡습니다.",
        "The framework keeps everything else: it schedules requests, assigns cache blocks and samples tokens."
      ],
      [
        "h2",
        "미리 컴파일됨",
        "Compiled ahead of time"
      ],
      [
        "p",
        "플러그인을 설치하면 필요한 모델 함수들을 컴파일하기 때문에 첫 빌드는 수 분 걸릴 수 있습니다. 체크포인트 로딩 시에는 컴파일된 함수와 가중치를 NPU에 올리며, **서빙 중에는 컴파일하지 않습니다.**",
        "Installing a plugin compiles every model function, which is why the first build takes minutes. Loading a checkpoint loads those compiled functions and uploads the checkpoint's weights; serving compiles nothing."
      ],
      [
        "p",
        "체크포인트의 설정이 컴파일된 기하 구조(geometry)와 일치할 때만 로딩하며, 다르면 어떤 값을 기대했는지 오류로 알려 줍니다.",
        "A checkpoint loads when its config matches a compiled geometry, and the load refuses it otherwise, naming the compiled value it expected."
      ],
      [
        "h2",
        "컴파일로 고정되는 네 가지 한도",
        "Compiled limits"
      ],
      [
        "table",
        [
          "제약",
          "제한하는 것",
          "실제로 나타나는 곳"
        ],
        [
          [
            "컨텍스트 창(Context window)",
            "요청 하나의 입력·출력 토큰 길이",
            "설정 길이가 한도를 넘으면 시작 시 거부"
          ],
          [
            "호출당 행 수(Rows per call)",
            "한 번의 NPU 호출에서 처리할 토큰 행 수",
            "큰 스케줄러 단계를 플러그인이 여러 호출로 분할"
          ],
          [
            "KV 캐시 블록(Cache block)",
            "KV 블록당 저장할 토큰 수",
            "vLLM `--block-size`가 일치해야 하며 SGLang 페이지 크기를 맞춤"
          ],
          [
            "칩 수(Chips)",
            "컴파일된 모델을 분할할 칩 수",
            "미지원 TP 크기 지정 시 허용값 안내"
          ]
        ]
      ],
      [
        "p",
        "하나의 스케줄러 단계를 여러 엔진 호출로 나누면 순서대로 실행되므로, 처리 행 수에 따라 소요 시간이 증가합니다.",
        "A step split into several calls runs them one after another, so its time grows with its rows."
      ],
      [
        "h2",
        "프레임워크와 엔진의 역할",
        "The framework and the engine"
      ],
      [
        "p",
        "프레임워크가 어떤 요청을 언제 처리할지 결정합니다. 플러그인은 그 단계를 엔진의 호출로 변환하고, 엔진이 NPU에서 실행합니다.",
        "The framework decides which requests run in each step; the plugin turns that step into engine calls, and the engine runs them on the device."
      ],
      [
        "p",
        "조건에 맞는 Greedy 요청은 NPU가 선택한 토큰을 그대로 사용합니다. 점수(logits)가 필요한 요청은 프레임워크 샘플러가 필요하지만, 이 문서 시점의 엔진은 해당 점수를 반환하지 않아 플러그인이 거부합니다.",
        "A step of eligible greedy requests takes its tokens from the device; a step that needs token scores or changes the token distribution sends its logits to the framework's sampler on the host. [Note: the documented decoder calls do not return scores yet.]"
      ],
      [
        "h2",
        "비동기 호출",
        "Calls are asynchronous"
      ],
      [
        "p",
        "엔진은 요청을 확인한 뒤 NPU 작업을 제출하고, 결과 텐서를 반환합니다. 작업 완료까지 항상 기다리는 것은 아닙니다. 호스트 복사나 명시적인 `wait()`가 동기화 지점이므로 다음 단계를 준비하는 동안 현재 단계가 NPU에서 실행될 수 있습니다.",
        "An engine call checks its inputs, submits its launches and returns device tensors before they finish, as PyTorch and JAX calls do. Only copies to the host and explicit waits block, so the next step is prepared while the device still runs the current one."
      ],
      [
        "h2",
        "지원하지 않는 요청은 일찍 거부",
        "Refusals come first"
      ],
      [
        "p",
        "알 수 없는 모델 구조, 미지원 옵션, KV 캐시 자료형, 배치 위치 등 대부분은 디바이스가 열리기 전에 검사합니다. 컨텍스트 길이는 모델 로딩 후 검사합니다.",
        "Most refusals come before the device opens: unknown architectures, unsupported options, cache dtypes and placements. The context window is checked once the model has loaded."
      ],
      [
        "p",
        "오류 메시지는 허용되는 설정을 알려 줍니다. [[문제 해결|reference/troubleshooting]]에서 주요 사례를 확인할 수 있습니다.",
        "A refusal names the option or value and what is accepted; Troubleshooting lists the common ones with their fixes."
      ]
    ]
  },
  "getting-started/installation": {
    "title": "설치 · Installation",
    "blocks": [
      [
        "p",
        "컴파일러와 vLLM 또는 SGLang 플러그인을 설치합니다. 플러그인을 설치하는 과정에서 엔진이 빌드되고 모델 함수들도 컴파일됩니다.",
        "This page installs the compiler and then the vLLM or SGLang plugin. Installing a plugin also builds the engine and compiles every model function."
      ],
      [
        "h2",
        "사전 준비",
        "Prerequisites"
      ],
      [
        "list",
        [
          [
            "Linux x86_64 환경.",
            "Linux on x86_64."
          ],
          [
            "Furiosa SDK 2026.4 이상에 대응하는 RNGD 드라이버와 NPU. 설치 후 `ls /dev/rngd`로 장치 노드를 확인합니다.",
            "One or more RNGD devices with the RNGD driver of Furiosa SDK 2026.4 or later; ls /dev/rngd then lists the device nodes."
          ],
          [
            "**vLLM 플러그인:** vLLM CPU wheel이 `manylinux_2_39`로 빌드되어 glibc 2.39 이상(예: Ubuntu 24.04)이 필요합니다. 정확한 Python 요구 버전은 원문의 동적 버전 표를 확인합니다.",
            "For the vLLM plugin: Python {{ vllm_project['requires-python'] }} and glibc 2.39 or later, such as Ubuntu 24.04."
          ],
          [
            "vLLM CPU 빌드는 최초 사용 때 `triton-cpu` 및 `torch.compile`을 컴파일하므로 `gcc` 같은 C 컴파일러가 필요합니다.",
            "For the vLLM plugin: a C compiler, such as sudo apt install gcc."
          ],
          [
            "**SGLang 플러그인:** 설치 시점의 SGLang Python 요구 버전을 확인하세요.",
            "For the SGLang plugin: Python {{ sglang_project['requires-python'] }}."
          ],
          [
            "`uv`, `rustup`, 그리고 NPU 프로그램을 링크할 aarch64 크로스 툴체인이 필요합니다.",
            "uv, rustup, and the aarch64 toolchain the compiler links the NPU programs with."
          ]
        ]
      ],
      [
        "code",
        "bash",
        "sudo apt install gcc-aarch64-linux-gnu libc6-dev-arm64-cross"
      ],
      [
        "h2",
        "호환 버전",
        "Compatibility"
      ],
      [
        "table",
        [
          "구성요소",
          "원문 기준 조건"
        ],
        [
          [
            "RNGD 드라이버",
            "Furiosa SDK 2026.4 이상"
          ],
          [
            "vLLM 플러그인",
            "공식 페이지에서 정확한 vLLM·Python 버전 확인"
          ],
          [
            "SGLang 플러그인",
            "공식 페이지에서 정확한 SGLang·Python 버전 확인"
          ],
          [
            "컴파일러",
            "저장소 `Cargo.toml`이 고정한 `furiosa-opt-preview`의 `cargo-furiosa-opt` 스냅샷"
          ]
        ]
      ],
      [
        "note",
        "버전 값 일부는 원문 Markdown의 `{{ ... }}` 템플릿에서 빌드 시 생성됩니다. 여기서는 숫자를 추측해 넣지 않았습니다. 정확한 설치 버전은 공식 웹 문서와 `Cargo.toml`을 확인하세요.",
        "The plugin builds against a pinned furiosa-opt-preview snapshot and dynamic plugin version templates."
      ],
      [
        "h2",
        "컴파일러 설치",
        "Install the compiler"
      ],
      [
        "p",
        "이 모델 저장소는 공식 최신 릴리스보다 앞선 `furiosa-opt-preview`의 `next` 브랜치 기능을 사용합니다. 따라서 해당 스냅샷의 `cargo-furiosa-opt`를 설치해야 합니다.",
        "This repository pins the tip of furiosa-opt-preview's default branch, next, where the next cargo-furiosa-opt release lands first."
      ],
      [
        "code",
        "bash",
        "curl -L --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/cargo-bins/cargo-binstall/main/install-from-binstall-release.sh | bash\ncargo binstall --git https://github.com/furiosa-ai/furiosa-opt-preview cargo-furiosa-opt"
      ],
      [
        "p",
        "플러그인 빌드는 `CARGO` 변수로 지정한 컴파일러를 실행합니다. 버전이 다르면 `this kernel was expanded by rev …, but the driver is rev …`라는 오류가 나므로 고정된 컴파일러를 다시 설치해야 합니다.",
        "The plugin build runs the compiler by name through CARGO. A compiler of another snapshot refuses the kernels with a revision mismatch."
      ],
      [
        "h2",
        "플러그인 설치",
        "Install a plugin"
      ],
      [
        "p",
        "저장소를 복제하고 vLLM과 SGLang을 서로 다른 Python 가상환경에 설치합니다. 아래 명령은 저장소 루트에서 실행합니다.",
        "Clone the repository and create a Python environment for one framework, separate from other serving frameworks."
      ],
      [
        "code",
        "bash",
        "git clone https://github.com/furiosa-ai/furiosa-opt-models && cd furiosa-opt-models\nuv venv && source .venv/bin/activate"
      ],
      [
        "p",
        "**vLLM** 플러그인은 플랫폼을 등록합니다. `omni` extra는 vLLM-Omni를 추가하지만, 이 엔진은 Diffusion 파이프라인 로딩을 아직 지원하지 않습니다.",
        "Installation registers the platform plugin with vLLM. The omni extra also installs vLLM-Omni, whose diffusion pipelines the plugin refuses at load."
      ],
      [
        "code",
        "bash",
        "CARGO=cargo-furiosa-opt uv pip install --torch-backend cpu ./integrations/furiosa-opt-vllm"
      ],
      [
        "p",
        "**SGLang**은 플랫폼과 Worker를 플러그인 엔트리 포인트로 등록합니다. `--prerelease=allow`는 SGLang이 요구하는 사전 배포 `cuda-tile` 의존성을 해결하기 위해 필요합니다.",
        "Installation registers the platform and worker through SGLang's plugin entry points. --prerelease=allow is needed because SGLang pins a pre-release dependency (cuda-tile)."
      ],
      [
        "code",
        "bash",
        "CARGO=cargo-furiosa-opt uv pip install --prerelease=allow ./integrations/furiosa-opt-sglang"
      ],
      [
        "h2",
        "설치 확인",
        "Verify the installation"
      ],
      [
        "p",
        "다음 명령은 디바이스를 열지 않고 컴파일된 엔진의 Python 로딩이 가능한지 확인하고 `LoadOptions`를 출력합니다.",
        "To check that the compiled engine loads, run this command; it prints a LoadOptions object without opening a device."
      ],
      [
        "code",
        "bash",
        "python -c \"import furiosa_opt_engine as engine; print(engine.LoadOptions())\""
      ],
      [
        "h2",
        "빌드 시간",
        "Build time"
      ],
      [
        "p",
        "첫 빌드에는 모든 모델 함수를 컴파일하므로 수 분이 소요됩니다. 진행 상황을 보고 싶다면 `-v`를 추가합니다.",
        "The first build compiles every model function and takes several minutes. Add -v to see its progress."
      ],
      [
        "p",
        "`uv`는 설치마다 격리 빌드 환경을 만들기 때문에 재설치 시 `pyo3`와 엔진을 다시 컴파일합니다. 기존 빌드를 재사용하려면 같은 환경에 `maturin`을 설치하고 `--no-build-isolation`을 사용합니다.",
        "uv builds each install in a fresh Python environment, so reinstalling recompiles pyo3 and the engine. To reuse the previous build, install maturin into your environment and add --no-build-isolation."
      ],
      [
        "link",
        "getting-started/quickstart",
        "→ 다음: 빠른 시작"
      ]
    ]
  },
  "getting-started/quickstart": {
    "title": "빠른 시작 · Quickstart",
    "blocks": [
      [
        "p",
        "Qwen3-1.7B를 Python 프로그램으로 실행한 뒤 HTTP 서버로 서빙합니다. 먼저 [[설치|getting-started/installation]]를 완료하세요. 프레임워크별 코드를 비교할 수 있도록 둘 다 제공합니다.",
        "This page generates text with Qwen3-1.7B, first in a Python program and then over HTTP. Install a plugin first."
      ],
      [
        "h2",
        "Python으로 텍스트 생성",
        "Generate in a Python program"
      ],
      [
        "p",
        "다음 중 한 가지를 `generate.py`로 저장하고 `python generate.py`로 실행합니다.",
        "Save the program as generate.py, then run python generate.py."
      ],
      [
        "code",
        "python · vLLM",
        "from vllm import LLM, SamplingParams\n\nif __name__ == \"__main__\":\n    model = LLM(model=\"Qwen/Qwen3-1.7B\")\n    result = model.generate(\n        \"The capital of Korea is\",\n        SamplingParams(temperature=0, max_tokens=12),\n    )\n    print(result[0].outputs[0].text)"
      ],
      [
        "code",
        "python · SGLang",
        "from sglang import Engine\n\nif __name__ == \"__main__\":\n    model = Engine(model_path=\"Qwen/Qwen3-1.7B\")\n    try:\n        result = model.generate(\n            \"The capital of Korea is\",\n            sampling_params={\"temperature\": 0, \"max_new_tokens\": 12},\n        )\n        print(result[\"text\"])\n    finally:\n        model.shutdown()"
      ],
      [
        "p",
        "첫 실행 시 체크포인트를 내려받고 가중치를 RNGD에 업로드합니다. 프로그램은 Greedy 방식으로 이어지는 텍스트를 출력합니다. 정확한 출력은 모델·환경에 따라 달라질 수 있습니다.",
        "The first run downloads the checkpoint and uploads its weights to RNGD. The program then prints the greedy continuation."
      ],
      [
        "code",
        "text",
        "Seoul. The capital of the United States is Washington, D"
      ],
      [
        "h2",
        "HTTP로 서빙",
        "Serve over HTTP"
      ],
      [
        "p",
        "OpenAI 호환 서버를 시작하려면 프레임워크에 맞는 명령을 사용합니다.",
        "To expose the model as an OpenAI-compatible server:"
      ],
      [
        "code",
        "bash · vLLM",
        "vllm serve Qwen/Qwen3-1.7B"
      ],
      [
        "code",
        "bash · SGLang",
        "python -m sglang.launch_server --model-path Qwen/Qwen3-1.7B"
      ],
      [
        "p",
        "서버가 준비되었다고 표시한 뒤 다른 터미널에서 요청을 보냅니다.",
        "To send a request from another shell once the server reports that it is ready:"
      ],
      [
        "code",
        "bash · vLLM",
        "curl http://127.0.0.1:8000/v1/completions \\\n  -H 'Content-Type: application/json' \\\n  -d '{\"model\": \"Qwen/Qwen3-1.7B\", \"prompt\": \"The capital of Korea is\", \"max_tokens\": 12, \"temperature\": 0}'"
      ],
      [
        "code",
        "bash · SGLang",
        "curl http://127.0.0.1:30000/v1/completions \\\n  -H 'Content-Type: application/json' \\\n  -d '{\"model\": \"Qwen/Qwen3-1.7B\", \"prompt\": \"The capital of Korea is\", \"max_tokens\": 12, \"temperature\": 0}'"
      ],
      [
        "p",
        "생성된 이어쓰기 텍스트는 응답 JSON의 `choices[0].text`에 들어 있습니다.",
        "The response's choices[0].text holds the generated continuation."
      ],
      [
        "h2",
        "다음 단계",
        "Next steps"
      ],
      [
        "list",
        [
          [
            "[[서빙|serving/index]]: 임베딩, KV 오프로딩, 긴 컨텍스트, LoRA 관련 설명.",
            "Serving: embeddings, reranking, an FP8 KV cache and long contexts. [The feature matrix marks FP8 KV cache not yet supported.]"
          ],
          [
            "지원 모델의 범위와 측정 성능은 공식 모델 목록에서 확인하세요.",
            "Models: which checkpoints run and how fast."
          ],
          [
            "[[Python 엔진|engine/python]]: 프레임워크를 거치지 않고 직접 실행합니다.",
            "Using the engine: run a checkpoint without a framework."
          ]
        ]
      ]
    ]
  }
};
