window.OPT_DOCS_ADVANCED={
  "engine/python": {
    "title": "Python에서 엔진 직접 사용",
    "blocks": [
      [
        "p",
        "서빙 프레임워크 없이 RNGD 칩 하나에 체크포인트를 올리고, 토큰 3개를 처리한 다음 같은 KV 캐시에 다음 토큰을 추가하는 예제입니다.",
        "This page loads a checkpoint onto one RNGD chip, runs a three-token prompt and then appends the next token in the same KV cache, without a serving framework."
      ],
      [
        "p",
        "먼저 vLLM 또는 SGLang 플러그인을 설치하세요. 두 플러그인 모두 `furiosa_opt_engine` 패키지를 설치합니다. 전체 시그니처는 공식 Python API 참조 문서를 확인하세요.",
        "Install either plugin first; both install the furiosa_opt_engine package, and the Python reference lists every signature."
      ],
      [
        "h2",
        "모델 적재",
        "Load a model"
      ],
      [
        "code",
        "python",
        "from huggingface_hub import snapshot_download\n\nimport furiosa_opt_engine as engine\n\ncheckpoint = engine.Checkpoint(snapshot_download(\"Qwen/Qwen3-0.6B\"))\noptions = engine.LoadOptions()\noptions.parse(checkpoint)  # (1)!\ndevice = engine.Device(engine.Placement([0], range(8)))  # (2)!\ndecoder = options.load(checkpoint, device)  # (3)!"
      ],
      [
        "list",
        [
          [
            "`options.parse(checkpoint)`는 체크포인트 설정·텐서 이름을 검사하며, 가중치를 읽거나 디바이스를 열지 않습니다.",
            "Checks the options against the checkpoint's config and tensor names, reading no weight and opening no device."
          ],
          [
            "`Placement([0], range(8))`은 칩 0과 해당 칩의 PE 0~7을 엽니다.",
            "Opens chip 0 and its PEs 0 to 7."
          ],
          [
            "`options.load()`는 가중치를 장치 HBM에 올리고 `Decoder` 하위 타입인 `qwen3.ForCausalLM`을 반환합니다.",
            "Loads the weights into the device's HBM and returns a qwen3.ForCausalLM, a subclass of Decoder."
          ]
        ]
      ],
      [
        "p",
        "`decoder.output`이 `Output.TOKENS`이면 반환값은 각 출력 행의 Greedy 토큰 ID입니다. 한 번의 호출은 최대 `decoder.rows`행, 요청은 최대 `decoder.window` 위치까지 처리합니다. `decoder`가 더 이상 참조되지 않으면 해당 장치 메모리가 해제됩니다.",
        "decoder.output is Output.TOKENS: a call returns the greedy token ID of each row it keeps. One call takes at most decoder.rows rows, and a request reaches at most decoder.window positions. Dropping decoder frees its device memory."
      ],
      [
        "h2",
        "프롬프트 실행",
        "Run a prompt"
      ],
      [
        "code",
        "python",
        "cache = engine.decoder.Cache(decoder.cache, 1)  # (1)!\nprompt = engine.HostTensor([642, 643, 644]).to_hbm(device)  # (2)!\ntoken = decoder.forward([engine.decoder.Request([[0]], 0, prompt)], cache)  # (3)!"
      ],
      [
        "list",
        [
          [
            "`Cache(decoder.cache, 1)`은 모델의 모든 KV 레이어에서 사용할 블록 1개를 할당합니다. 한 블록의 토큰 수는 `decoder.cache.pools[0].block`에서 확인합니다.",
            "One block of every layer decoder.cache lists; a block holds decoder.cache.pools[0].block positions."
          ],
          [
            "`HostTensor(...).to_hbm(device)`는 이미 토크나이즈한 `int32` 토큰 ID를 장치로 옮깁니다.",
            "Token IDs of an already tokenized prompt, copied to the device as int32."
          ],
          [
            "`Request([[0]], 0, prompt)`는 캐시된 위치가 0이고, 캐시 그룹의 블록 ID 0에 토큰 3개를 추가합니다. 기본 `Keep.LAST`는 마지막 행의 Greedy 토큰을 반환합니다.",
            "Block 0 of the cache's one group, no position cached yet, three tokens appended. Keep.LAST returns the last row's greedy token."
          ]
        ]
      ],
      [
        "note",
        "토큰 ID는 모델 Vocabulary 범위 안이어야 합니다. 엔진은 ID를 호스트에서 검사하지 않으며, 범위를 넘으면 의도하지 않은 장치 메모리를 읽을 수 있습니다.",
        "The engine never reads an ID on the host, and an ID outside the model's vocabulary reads other device memory."
      ],
      [
        "h2",
        "다음 토큰 추가",
        "Append the next token"
      ],
      [
        "code",
        "python",
        "following = decoder.forward([engine.decoder.Request([[0]], 3, token)], cache)\nprint(token.to_host().numpy(), following.to_host().numpy())"
      ],
      [
        "p",
        "두 호출에서 각각 토큰 ID 하나를 출력합니다. 두 번째 호출의 `cached=3`은 앞서 작성된 세 위치 다음에 토큰을 추가한다는 뜻입니다. 위치 `p`는 요청의 `p // block`번째 블록에서 `p % block` 위치에 기록됩니다.",
        "The second request appends token after the three positions the first call wrote, so cached is 3 and the block is the same: position p writes slot p % block of the request's block p // block."
      ],
      [
        "p",
        "`cached`는 해당 시퀀스가 이미 기록한 위치 수를 정확히 반영해야 합니다. 엔진은 블록 내부 내용을 확인하지 않습니다. `token`이 장치에 남아 있으므로 다음 호출에서 호스트 복사가 필요 없습니다.",
        "The engine cannot check what the block holds: cached must count positions this sequence already wrote. token stays on the device, so the next call takes it without a copy to the host."
      ],
      [
        "h2",
        "비동기 호출",
        "Run calls asynchronously"
      ],
      [
        "p",
        "`forward`는 NPU가 호출을 수락하면 반환할 수 있으며, 작업이 완전히 끝났음을 보장하지 않습니다. 반환 텐서를 바로 다음 호출에 전달할 수 있습니다.",
        "forward returns its output once the device accepted the call, before the device finishes, as PyTorch and JAX calls do."
      ],
      [
        "p",
        "`to_host()`는 필요한 작업을 기다렸다가 복사하고, `wait()`는 복사 없이 기다립니다. `device.synchronize()`는 그 전에 제출된 작업 전부를 기다립니다. `HostTensor.to_hbm`은 복사가 완료된 뒤 반환합니다.",
        "to_host() waits for the calls that write it and copies it, wait() waits without a copy, and device.synchronize() waits for every call submitted before it."
      ],
      [
        "code",
        "python",
        "layer = cache.layers[0]  # (1)!\nhost = engine.HostBuffer(len(layer))  # (2)!\ntransfer = layer.to_host(host)\ntransfer.wait()"
      ],
      [
        "p",
        "`cache.layers[0]`은 첫 번째 KV 레이어의 장치 저장 공간이고, `len(layer)`는 칩당 필요한 바이트 수입니다.",
        "The first cached layer's device storage. len(layer) bytes for each chip of the device, here one."
      ],
      [
        "h2",
        "LoRA 어댑터로 요청 실행",
        "Run requests with LoRA adapters"
      ],
      [
        "p",
        "LoRA를 지원하는 Decoder는 `decoder.adapters`에 `AdapterSpec`을 제공하며, 그 외에는 `None`입니다. `LoadOptions().adapters()`는 설정상 지원되지 않는 어댑터 로드를 거부합니다.",
        "A decoder whose projections take LoRA adapters describes them as decoder.adapters, an AdapterSpec, and any other decoder as None."
      ],
      [
        "p",
        "어댑터는 PEFT 형식 체크포인트이며, 요청마다 사용한 어댑터의 목록 인덱스를 지정합니다.",
        "An Adapter is a PEFT checkpoint loaded onto the decoder's device, and a call takes a list of adapters that each request names one of by its index."
      ],
      [
        "code",
        "python",
        "import json\n\nspec = decoder.adapters\nconfig = json.loads(open(\"/path/to/adapter/adapter_config.json\").read())\nadapter = engine.decoder.Adapter(spec, engine.Checkpoint(\"/path/to/adapter\", config))  # (1)!\nrequest = engine.decoder.Request([[0]], 0, prompt, adapter=0)  # (2)!\ntoken = decoder.forward([request], cache, [adapter])"
      ],
      [
        "list",
        [
          [
            "어댑터 디렉터리에는 `adapter_model.safetensors`가 있어야 합니다. Rank 또는 모듈이 허용 범위를 넘으면 장치 업로드 전에 거부합니다.",
            "The directory holds adapter_model.safetensors, opened with its adapter_config.json ... rank or module outside the supported set raises before any factor reaches the device."
          ],
          [
            "`adapter=0`은 호출에 전달된 어댑터 목록의 첫 요소를 뜻합니다. `adapter=None`은 원본 모델만 사용합니다.",
            "The request runs with the adapter at index 0 of the list; one with adapter=None runs the base model alone."
          ]
        ]
      ],
      [
        "p",
        "어댑터 목록 크기는 `AdapterSpec.SLOTS` 이하여야 하며, 추가 연산은 각 출력 행에 적용됩니다. 어댑터는 같은 장치 메모리를 유지하므로 슬롯 위치를 옮겨도 어댑터 자체를 재복사하지 않습니다.",
        "A list holds at most AdapterSpec.SLOTS adapters, and each costs its updates on every row of the call. An adapter never changes: putting it in a slot copies nothing."
      ],
      [
        "h2",
        "오류와 한도",
        "Errors and limits"
      ],
      [
        "p",
        "`parse`와 `load`는 미지원 설정·모델 타입을 가중치 로딩 전에 거부합니다. `forward`는 잘못된 블록/슬롯 등 호출 조건을 확인합니다. 장치 실행 실패는 `forward`, `wait`, `to_host` 등에서 `RuntimeError`로 드러날 수 있습니다.",
        "parse and load raise ValueError for a config no listed model serves and NotImplementedError for an architecture or option ... forward raises ValueError ... a launch that fails raises RuntimeError."
      ],
      [
        "p",
        "디바이스 실행이 실패했다면 프로세스를 재시작하고, 모델을 다시 로드한 뒤 각 시퀀스의 토큰을 새 캐시에 재생해야 합니다.",
        "Then restart the process, load the model and replay each sequence's tokens into a new cache."
      ]
    ]
  },
  "engine/frameworks": {
    "title": "vLLM·SGLang과 엔진 연결",
    "blocks": [
      [
        "p",
        "프레임워크 플러그인은 각 스케줄러 단계에서 요청을 엔진 호출로 바꾸고, 프레임워크가 필요로 하는 결과 행을 돌려줍니다. [[Python 엔진 사용|engine/python]]에서 캐시와 Request 생성 방법을 먼저 확인할 수 있습니다.",
        "A plugin turns each scheduler step into engine requests and returns the rows the framework needs from them."
      ],
      [
        "h2",
        "스케줄된 청크를 Request로 변환",
        "Map a scheduled chunk to a request"
      ],
      [
        "p",
        "스케줄된 시퀀스 하나는 `engine.decoder.Request` 하나가 됩니다. 캐시 그룹별 블록 ID, 이미 저장된 위치 수, 새 토큰, 반환할 행 범위를 전달합니다. 프레임워크가 블록 배정을 결정하고 플러그인은 블록 ID로 변환합니다.",
        "Each scheduled sequence becomes one engine.decoder.Request: the blocks that hold it, a list for each cache group, the positions they already hold, its new tokens and the rows to return."
      ],
      [
        "p",
        "**vLLM**은 블록 ID를 직접 배정하기 때문에 그대로 넘깁니다.",
        "vLLM assigns block IDs directly, so they pass through unchanged."
      ],
      [
        "code",
        "python · vLLM",
        "blocks = [2, 5]  # the request's block IDs from vLLM's block table\nrequest = engine.decoder.Request([blocks], 20, tokens, engine.decoder.Keep.LAST)"
      ],
      [
        "p",
        "**SGLang**은 토큰 위치를 배정하며 페이지 크기가 컴파일된 KV 블록 크기 16과 같습니다. 페이지 시작 위치를 16으로 나누면 블록 ID가 됩니다.",
        "SGLang assigns token locations, and its page size equals the compiled block size, 16. A page's start location divided by 16 is its block ID."
      ],
      [
        "code",
        "python · SGLang",
        "pages = [32, 80]  # page-start locations\nblocks = [location // 16 for location in pages]  # [2, 5]\nrequest = engine.decoder.Request([blocks], 20, tokens, engine.decoder.Keep.LAST)"
      ],
      [
        "p",
        "스케줄러 단계가 한 호출에서 처리할 수 있는 행 수보다 크면 플러그인이 순서를 유지하며 여러 호출로 분리합니다.",
        "A scheduler step can hold more rows than one call takes, so the plugin splits it into bounded calls in order."
      ],
      [
        "h2",
        "어떤 출력 행을 돌려줄까?",
        "Return the rows the framework needs"
      ],
      [
        "table",
        [
          "청크 종류",
          "`keep` 설정"
        ],
        [
          [
            "이후 단계에서 계속되는 프롬프트 중간 청크",
            "`Keep.NONE`: KV만 기록, 출력 행 없음"
          ],
          [
            "프롬프트 마지막 청크 또는 Decode 한 단계",
            "`Keep.LAST`: 샘플러가 사용할 마지막 행"
          ],
          [
            "프롬프트 Logprob 또는 Pooling",
            "`Keep.ALL`: 추가된 모든 행"
          ]
        ]
      ],
      [
        "p",
        "Logprob·Penalty 등 Sampling 수정이 없는 Greedy 요청만 NPU가 반환한 토큰을 다음 단계로 직접 전달할 수 있습니다. 그 밖의 요청은 Vocabulary Logits가 필요한데, 이 문서 시점의 Decoder API는 이를 반환하지 않으므로 플러그인이 거부합니다.",
        "A step whose requests are all greedy, without logprobs, penalties or other sampling modifiers, takes its tokens from Decoder.forward; every other step needs scores ... decoder calls do not return yet."
      ],
      [
        "h2",
        "캐시 할당의 수명",
        "Keep the cache allocation alive"
      ],
      [
        "p",
        "**핵심:** 프레임워크가 요청의 수명과 KV 블록 배정을 관리하지만, **실제 NPU 캐시 저장 공간의 소유자는 엔진**입니다. 요청을 제거하면 블록 배정은 반환되지만 캐시 자체의 장치 메모리 할당이 자동으로 해제되는 것은 아닙니다.",
        "The framework owns request lifetimes and block assignments; the engine owns the cache's device storage. Evicting a request releases its block assignments, not the cache allocation."
      ],
      [
        "p",
        "SGLang의 Offload/Relocation은 장치 메모리 풀을 없애는 대신 캐시 토큰 행을 이동합니다.",
        "SGLang's offload and relocation copy token rows without moving the allocation."
      ],
      [
        "h2",
        "SGLang의 추가 동작",
        "SGLang specifics"
      ],
      [
        "list",
        [
          [
            "SGLang은 일부 체크포인트의 Geometry를 자체 커널용으로 변경하므로, 플러그인은 원래 체크포인트 설정과 명시적 오버라이드를 기반으로 엔진을 로드합니다.",
            "SGLang rewrites some checkpoint geometry for its own kernels, so the plugin loads the engine from the original checkpoint config."
          ],
          [
            "Overlap Scheduling 시 다음 단계를 준비하는 동안 NPU가 이전 단계를 실행합니다. Recurrent State나 Embedding은 단계 내 완료가 필요하여 Overlap을 비활성화합니다.",
            "With the overlap schedule, SGLang schedules the next step while the device runs; recurrent state and embeddings turn overlap off."
          ],
          [
            "Mixed Chunk는 Prefill 청크와 진행 중인 Decode 행을 같은 단계에 섞습니다.",
            "Mixed chunks interleave prompt chunks with the running requests' decode rows in one step."
          ]
        ]
      ]
    ]
  },
  "design/architecture": {
    "title": "아키텍처 · 책임 경계",
    "blocks": [
      [
        "p",
        "체크포인트에서 Python API 호출까지 각 계층이 무엇을 맡고, 의존성이 어느 방향으로 흐르는지 설명합니다.",
        "The layers between a checkpoint and a Python call, and which way dependencies point."
      ],
      [
        "table",
        [
          "계층",
          "담당",
          "보장/의존"
        ],
        [
          [
            "1. Checkpoint",
            "파일의 텐서·설정",
            "잘못된 입력 거부; SDK에 의존"
          ],
          [
            "2. Registry",
            "설정을 모델 타입에 대응",
            "가중치 읽기 전 지원 여부 판정"
          ],
          [
            "3. Models Crate",
            "모듈 트리·가중치",
            "컴파일 시 Shape 확정; Checkpoint·SDK 사용"
          ],
          [
            "4. Host Composition",
            "커널 Launch·Decoder 호출",
            "NPU 실행 전에 요청 검사"
          ],
          [
            "5. Runtime Memory",
            "장치 메모리 할당과 View",
            "마지막 View가 사라지면 해제"
          ],
          [
            "6. Python Surface",
            "Checkpoint·LoadOptions·모델 객체",
            "타입/디바이스 계약 제공"
          ]
        ]
      ],
      [
        "p",
        "의존성은 아래 계층에서 위 계층으로 되돌아가지 않도록 설계합니다.",
        "No layer reaches back up."
      ],
      [
        "h2",
        "소유권 경계",
        "Boundaries"
      ],
      [
        "table",
        [
          "주체",
          "책임지는 일",
          "다른 계층에 맡기는 일"
        ],
        [
          [
            "Models",
            "모듈 트리, 가중치와 로딩, Registry",
            "실행 호출·요청·서빙"
          ],
          [
            "Engine",
            "LoadOptions, Launch, Decoder, KV Cache 저장소, Python Binding",
            "스케줄링·블록 배정·토큰 샘플링"
          ],
          [
            "Integrations",
            "프레임워크 데이터 변환",
            "수학적 연산 자체"
          ],
          [
            "Framework",
            "스케줄링·캐시 블록 배정·샘플링",
            "모델 연산과 엔진"
          ]
        ]
      ],
      [
        "p",
        "따라서 모델은 서빙 프레임워크 없이도 호출할 수 있으며, 하나의 엔진을 서로 다른 정책의 프레임워크가 공유할 수 있습니다.",
        "A loaded model is callable without a serving stack, and one engine serves frameworks that disagree on policy."
      ],
      [
        "h2",
        "1. 체크포인트",
        "1. Checkpoint"
      ],
      [
        "p",
        "Checkpoint는 디렉터리의 `config.json`과 `.safetensors` 텐서 이름을 매핑합니다. Diffusers 파이프라인인 경우 `model_index.json`에 표시된 하위 컴포넌트 폴더를 사용합니다. 파일 형식이나 중복 이름이 잘못되면 거부합니다.",
        "Maps a directory's tensors and reads its config, and chooses no architecture. A directory is one model, its .safetensors files beside config.json, or a diffusers pipeline."
      ],
      [
        "p",
        "매핑 단계는 실제 가중치를 읽지 않으며, 적재할 때 텐서를 하나씩 HBM으로 변환·업로드합니다.",
        "Mapping reads no weight; a load converts and uploads one tensor at a time."
      ],
      [
        "h2",
        "2. 모델 레지스트리",
        "2. Registry"
      ],
      [
        "p",
        "Registry는 체크포인트 설정을 실제 적재 가능한 모델 타입으로 변환합니다. `LoadOptions::parse`는 가중치/디바이스를 열지 않은 채 설정과 텐서 이름을 검사하고, 선택한 아키텍처·칩 수·KV 캐시 형식·레이어를 확인합니다.",
        "Turns a checkpoint's config into the model it loads as. LoadOptions::parse reads the config and tensor names only, with no weight or device."
      ],
      [
        "p",
        "`LoadOptions::load`는 선택한 타입을 HBM에 엄격하게 적재합니다. 미지원 아키텍처나 옵션은 가중치를 읽기 전에 판정합니다.",
        "LoadOptions::load loads that type strictly into HBM. Refuses early: unknown architectures and unsupported choices."
      ],
      [
        "h2",
        "3. 모델 크레이트",
        "3. Models crate"
      ],
      [
        "p",
        "`ops/`, `modules/`, `models/`은 장치 텐서를 처리하는 모듈 트리입니다. `Sequential`, `Then`, `Fork`, `Each`, `Layers`, 튜플 등으로 모듈을 조립하며, Python/서빙 정책에는 의존하지 않습니다.",
        "Numerical functions over device tensors, the weight trees they read and the registry, with no Python or serving knowledge."
      ],
      [
        "p",
        "가중치는 필드 이름에 맞춰 체크포인트에서 HBM으로 텐서별 로딩하며 호스트에 복사본을 계속 유지하지 않습니다. 텐서 Shape·dtype·mapping은 컴파일 시 검사하고 CPU 폴백은 없습니다.",
        "A tree loads from a checkpoint by field names, tensor by tensor into HBM, and nothing stays on host. Shapes, dtypes and mappings checked at compile time, with no CPU fallback."
      ],
      [
        "h2",
        "4. 호스트 측 실행 구성",
        "4. Engine host composition"
      ],
      [
        "p",
        "모델의 `forward`를 호출할 때 하나의 `#[device]` 엔트리 함수가 Module의 계산을 실행하며, `Function`은 해당 엔트리에 결합된 모듈 트리입니다. `AsyncModule`은 호스트의 대응 인터페이스입니다.",
        "Runs the layer 3 structure from the host, one device launch at a time. One #[device] function, forward, runs any module on the env, state and input its launch passes."
      ],
      [
        "p",
        "입력과 결과는 기본적으로 장치에 유지되며, 요청당 필요한 메타데이터(행 수·캐시된 위치·블록 목록)는 호스트에서 간략하게 구성해 전달합니다. 레이어별 Attention Context는 디바이스에서 한 번 계산합니다.",
        "No implicit tensor transfers: operands and results stay on the device. A decoder's call checks its requests on the host ... derives every layer's attention context from that history once."
      ],
      [
        "h2",
        "5. 런타임 메모리",
        "5. Runtime memory"
      ],
      [
        "p",
        "`Device`, `HbmBuffer`, `HostBuffer`와 텐서 View를 통한 얇은 Runtime Wrapper입니다. View가 원본 Allocation의 수명을 유지하므로 원본 텐서 객체가 사라져도 Slice가 유효합니다. 버퍼가 남아 있는 동안 디바이스를 유지합니다.",
        "A thin wrapper over the runtime's Device, HbmBuffer, HostBuffer and typed tensors. Views retain their allocations, so a row slice remains valid after its source object is dropped."
      ],
      [
        "h2",
        "6. Python 인터페이스",
        "6. Python surface"
      ],
      [
        "p",
        "Framework는 `Checkpoint`를 열고, `LoadOptions`로 선택 조건을 설정한 뒤 `Device`에 모델을 적재합니다. 결과는 `qwen3.ForCausalLM`처럼 구체적인 모델 클래스이며, Decoder 공통 호출 계약을 따릅니다.",
        "A framework opens a Checkpoint, states its choices in LoadOptions and loads once onto a Device it opened."
      ],
      [
        "table",
        [
          "검사 시점",
          "거부 예시"
        ],
        [
          [
            "타입/컴파일",
            "조립된 모듈 계약 불일치"
          ],
          [
            "적재",
            "다른 모델의 가중치를 읽으려 함"
          ],
          [
            "요청 실행",
            "잘못된 요청 규칙 또는 다른 장치의 텐서"
          ]
        ]
      ],
      [
        "h2",
        "새 모델 계열을 실행 가능하게 만들기",
        "Enabling a model family"
      ],
      [
        "table",
        [
          "계층",
          "필요한 구현",
          "미완료 시"
        ],
        [
          [
            "`ops/`",
            "각 Leaf 연산용 커널",
            "커널이 없으면 실행 불가"
          ],
          [
            "`modules/`, `models/`",
            "모듈 조합과 크기별 구체 타입",
            "적합한 모델 타입 없음"
          ],
          [
            "Registry",
            "각 아키텍처를 실제 타입에 연결",
            "`refused`로 남음"
          ],
          [
            "Engine",
            "Decoder와 Python 바인딩 클래스",
            "서빙 경로 없음"
          ]
        ]
      ],
      [
        "p",
        "커널이 없는 Operation은 형식만 맞는 `forward: todo!()`일 수 있습니다. 이 경우 모델을 컴파일·적재하더라도 첫 호출에서 장치 Panic이 발생할 수 있으므로, **컴파일 성공을 실행 성공으로 오해해서는 안 됩니다.**",
        "An operation without a kernel is a typed contract whose forward is todo!(). A model that uses it still compiles and loads, and its first launch fails with that operation's device panic."
      ],
      [
        "h2",
        "성능 측정",
        "Measurement"
      ],
      [
        "p",
        "`.github/benchmarks.json`이 모델 목록과 CI 벤치마크 대상을 정의합니다. 모델의 실제 실행·서빙 가능 여부는 이 기준의 측정 결과로 판단해야 합니다.",
        "The benchmarks inventory feeds the Models table and the checkpoints CI serves."
      ]
    ]
  },
  "reference/environment": {
    "title": "환경변수 · Environment variables",
    "blocks": [
      [
        "p",
        "이 문서는 `furiosa-opt-models`의 빌드 및 런타임이 직접 읽는 환경변수를 설명합니다. vLLM/SGLang 고유 변수는 원래 프레임워크 의미를 유지합니다.",
        "Variables that furiosa-opt-models, its build and its runtime read. Framework variables keep their framework's meaning."
      ],
      [
        "h2",
        "빌드",
        "Build"
      ],
      [
        "table",
        [
          "환경변수",
          "효과"
        ],
        [
          [
            "`CARGO`",
            "`uv pip install`이 엔진을 빌드할 때 사용할 Cargo. RNGD 커널을 생성하려면 `cargo-furiosa-opt`로 지정"
          ],
          [
            "`FURIOSA_OPT_OUT_DIR`",
            "`cargo-furiosa-opt`이 컴파일된 커널을 작성하고 조회할 디렉터리"
          ],
          [
            "`RUSTFLAGS`",
            "빌드용 Rust 컴파일러 플래그"
          ]
        ]
      ],
      [
        "h2",
        "런타임",
        "Runtime"
      ],
      [
        "table",
        [
          "환경변수",
          "효과"
        ],
        [
          [
            "`FURIOSA_VISIBLE_CHIPS`",
            "자동 배치에서 사용할 칩 번호 목록. 예: `2,3`. 미설정·빈 문자열이면 설치된 모든 칩 고려. 명시적 `Placement`는 자체 목록 사용"
          ],
          [
            "`FURIOSA_OPT_PROFILE`",
            "`info`, `debug`, `trace`. 함수 적재 전에 등록된 Tracing Subscriber가 있으면 해당 수준의 장치 Span 기록. 그 외 값은 경고 후 프로파일링 없이 실행"
          ]
        ]
      ],
      [
        "h2",
        "테스트",
        "Tests"
      ],
      [
        "table",
        [
          "환경변수",
          "효과"
        ],
        [
          [
            "`FURIOSA_OPT_REFERENCES`",
            "내려받은 기준 출력(Reference Output)의 루트 디렉터리. `<디렉터리>/<tag>` 형식으로 참조"
          ]
        ]
      ]
    ]
  },
  "reference/troubleshooting": {
    "title": "문제 해결 · Troubleshooting",
    "blocks": [
      [
        "p",
        "이 페이지는 실제 오류 메시지에서 출발해 원인과 해결 방법을 안내합니다.",
        "Each entry starts from the message you see, then gives its cause and the fix."
      ],
      [
        "h2",
        "설치 문제",
        "Installation"
      ],
      [
        "h3",
        "커널과 컴파일러 리비전 불일치",
        "The kernel was expanded by another rev"
      ],
      [
        "code",
        "text",
        "error: this kernel was expanded by rev <kernel rev>, but the driver is rev <driver rev>"
      ],
      [
        "p",
        "설치된 컴파일러와 `Cargo.toml`이 고정한 스냅샷이 다릅니다. 보통 저장소 변경으로 Pin이 이동한 경우 발생합니다. [[컴파일러 설치|getting-started/installation]] 절대로 동일한 버전을 다시 설치하세요.",
        "The installed compiler is another snapshot than the one Cargo.toml pins; install the pinned snapshot again."
      ],
      [
        "h3",
        "AArch64 C 헤더가 없음",
        "The aarch64 C headers are missing"
      ],
      [
        "code",
        "text",
        "fatal error: bits/wordsize.h: No such file or directory"
      ],
      [
        "p",
        "NPU 프로그램을 링크할 aarch64 크로스 툴체인이 필요합니다. 아래 명령으로 설치합니다.",
        "The compiler links the NPU programs with the aarch64 cross toolchain, which it does not ship."
      ],
      [
        "code",
        "bash",
        "sudo apt install gcc-aarch64-linux-gnu libc6-dev-arm64-cross"
      ],
      [
        "h2",
        "서버 시작 문제",
        "Startup"
      ],
      [
        "h3",
        "요청 컨텍스트가 컴파일된 한도를 초과",
        "The context length exceeds the compiled window"
      ],
      [
        "code",
        "text",
        "furiosa-opt-vllm requires max_model_len at most 131072\nfuriosa-opt-sglang requires context_length at most 131072"
      ],
      [
        "p",
        "요청한 컨텍스트 길이가 컴파일된 디코더의 Window보다 큽니다. 안내된 숫자 이하로 `--max-model-len`(vLLM) 또는 `--context-length`(SGLang)를 설정합니다.",
        "The server's context exceeds the window its decoder is compiled for. Pass at most the number in the message."
      ],
      [
        "h3",
        "한 요청의 전체 KV Cache가 장치 메모리에 들어가지 않음",
        "One full-length request does not fit in cache memory"
      ],
      [
        "code",
        "text",
        "ValueError: To serve at least one request with the model's max seq len (262144), (84.0 GiB KV cache is needed, which is larger than the available KV cache memory (35.09 GiB)."
      ],
      [
        "p",
        "컴파일 Window에는 들어가더라도 단일 요청의 KV Cache가 NPU 메모리에 들어가지 않을 수 있습니다. vLLM에서는 `--max-model-len -1`로 들어갈 수 있는 가장 긴 길이를 자동 선택하거나 안내된 범위로 줄입니다.",
        "The window fits, but the KV cache of one request at that length does not fit in device memory. Pass --max-model-len -1."
      ],
      [
        "h3",
        "옵션 거부",
        "An option is refused"
      ],
      [
        "code",
        "text",
        "furiosa_opt_vllm.admission.Refused: furiosa-opt-vllm serves no LoRA adapter"
      ],
      [
        "p",
        "지정한 옵션의 기능이 해당 모델·플러그인에서 지원되지 않는다는 뜻입니다. [[vLLM 옵션|serving/vllm]] 또는 [[SGLang 옵션|serving/sglang]]에서 허용값을 선택하세요.",
        "The plugin cannot honor the option, and the message states what it accepts."
      ],
      [
        "h3",
        "체크포인트에 맞는 KV Cache dtype 컴파일이 없음",
        "The checkpoint has no compiled cache dtype"
      ],
      [
        "code",
        "text",
        "the model has no specialization for cache dtype ..., compiled ..."
      ],
      [
        "p",
        "해당 모델의 KV Cache 자료형으로 컴파일된 버전이 없습니다. `--kv-cache-dtype`을 없애거나 원문 모델 표에서 지원하는 형식을 선택하세요.",
        "The decoder is compiled without that KV cache dtype. Drop --kv-cache-dtype or pick a compiled one."
      ],
      [
        "h3",
        "사용할 수 있는 칩이 없음",
        "No chip is free"
      ],
      [
        "code",
        "text",
        "npu0 is already reserved by another process\ninvalid request: no placement candidates"
      ],
      [
        "p",
        "다른 프로세스가 칩을 점유했거나 선택 조건에 맞는 설치 장치가 없습니다. 본인이 실행 중인 서버만 종료하거나 `FURIOSA_VISIBLE_CHIPS`로 비어 있는 칩을 선택하세요. 다른 사용자의 프로세스를 강제 종료하지 마세요.",
        "Another process holds the chip, or no installed chip matches the selection. Stop your own server or select free chips; do not stop another user's process."
      ],
      [
        "h3",
        "칩 번호 환경변수가 잘못됨",
        "A chip index is malformed"
      ],
      [
        "code",
        "text",
        "FURIOSA_VISIBLE_CHIPS: `a` is not a chip index"
      ],
      [
        "p",
        "`FURIOSA_VISIBLE_CHIPS`에는 `0,1`처럼 쉼표로 구분한 칩 번호만 입력합니다.",
        "FURIOSA_VISIBLE_CHIPS takes comma-separated chip numbers, such as 0,1."
      ],
      [
        "h3",
        "프로파일 기록이 없음",
        "Profiling records nothing"
      ],
      [
        "code",
        "text",
        "furiosa-opt: FURIOSA_OPT_PROFILE requested profiling, but no subscriber listens on span::npu; install a tracing subscriber before loading functions; profiling is disabled"
      ],
      [
        "p",
        "장치 Span을 받으려면 함수 적재 전에 Tracing Subscriber가 설치되어 있어야 합니다. 공식 Forward Test는 이 구독자를 등록하므로 측정 재현 시 참고할 수 있습니다.",
        "Device spans need a tracing subscriber before the functions load. Run a forward test whose harness installs one."
      ],
      [
        "h2",
        "서빙 중 발생하는 문제",
        "While serving"
      ],
      [
        "h3",
        "한 번 오류가 난 뒤 모든 요청이 실패",
        "Every request fails after one error"
      ],
      [
        "p",
        "NPU 장치 Launch 실패가 장치를 실패 상태로 만들었을 수 있습니다. 이후 호출도 `OSError`가 발생한다면 서버를 재시작하고 해당 요청을 다시 보내세요. 엔진 직접 사용 시에는 [[오류와 한도|engine/python]]를 참고합니다.",
        "A device launch failed, which fails the device: every later call on it raises OSError. Restart the server and resubmit the affected requests."
      ],
      [
        "h2",
        "벤치마크 문제",
        "Benchmarks"
      ],
      [
        "h3",
        "PR 댓글에서 성능 회귀가 보고됨",
        "A pull request comment lists a regression"
      ],
      [
        "p",
        "댓글에는 어떤 측정값이 기준 커밋 대비 허용 예산을 초과했는지 표시됩니다. 가장 낮은 수준의 측정부터 같은 조건의 Workload를 비교해야 원인을 파악할 수 있습니다.",
        "Each line names a measurement, its base and pull request values, and the budget it exceeds."
      ],
      [
        "h3",
        "비교할 수 없다는 메시지",
        "The comment says the comparison is unavailable"
      ],
      [
        "code",
        "text",
        "Measurements or comparison unavailable; see CI."
      ],
      [
        "p",
        "벤치마크 작업이 비교 전에 실패한 상태일 수 있습니다. 연결된 CI 실행에서 실패한 단계를 확인하세요.",
        "The benchmark job failed before it compared; the linked CI run shows the failed step."
      ]
    ]
  }
};
