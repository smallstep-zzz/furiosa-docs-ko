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

Object.assign(window.OPT_DOCS_ADVANCED,{
  "design/testing": {
    "title": "검증 원칙 · Testing principles",
    "blocks": [
      [
        "p",
        "각 불변조건은 **보장할 수 있는 가장 높은 계층에서** 보장하고, 더 높은 계층에서 보장할 수 없을 때만 테스트를 추가합니다.",
        "Guarantee each invariant at the highest level that can hold it, and write a test only when no higher level can."
      ],
      [
        "table",
        [
          "단계",
          "보장 내용",
          "실패 시점"
        ],
        [
          [
            "1. 타입 시스템",
            "불법 상태는 컴파일 자체가 불가능",
            "빌드 시"
          ],
          [
            "2. 검증된 생성자",
            "외부 입력을 한 번 검증해 정제된 타입으로 구성",
            "경계에서"
          ],
          [
            "3. 런타임 검사",
            "외부 응답·데이터 진입 시 검사",
            "경계에서"
          ],
          [
            "4. 테스트",
            "타입/경계 검사로 보장할 수 없는 계약",
            "CI에서"
          ]
        ]
      ],
      [
        "p",
        "보다 높은 단계는 더 일찍 실패하며 모든 호출자를 포괄한다는 의미입니다.",
        "A level is higher when it fails earlier and covers every caller."
      ],
      [
        "h2",
        "1단계: 타입 시스템",
        "Level 1: type system"
      ],
      [
        "table",
        [
          "도구",
          "원문 예시"
        ],
        [
          [
            "축별 Shape 타입",
            "`geometry::Hidden<const N: usize>`"
          ],
          [
            "Const Assertion",
            "`Live::groups`"
          ],
          [
            "Phantom Type",
            "`Rows<D, Row>`"
          ],
          [
            "Newtype / Enum",
            "`Keep`"
          ],
          [
            "검증된 생성자",
            "`qwen3::Size<N>`"
          ],
          [
            "Typestate",
            "호출 순서마다 서로 다른 타입을 사용"
          ]
        ]
      ],
      [
        "p",
        "새 Variant를 추가하면 Exhaustive `match`가 각 사용처에서 컴파일 오류를 만들어야 합니다. 런타임 값은 검증된 생성자, 컴파일 상수는 Const Assertion으로 처리합니다.",
        "Exhaustive match makes a new variant a compile error at every use. Runtime values need a checked constructor; constants need a const assert."
      ],
      [
        "h2",
        "2단계: 검증된 생성",
        "Level 2: checked construction"
      ],
      [
        "p",
        "바이트, 설정 파일, 프레임워크 인자, 드라이버 응답, 요청 필드는 신뢰할 수 없는 입력입니다. `TryFrom` 또는 검증을 수행하는 `new`로 **한 번만** 정제하고, 무엇을 왜 거부했는지 명시합니다.",
        "Bytes, configs, framework arguments, driver answers and request fields are untrusted. Parse each once into a refined type with TryFrom or a validating new."
      ],
      [
        "p",
        "경계를 통과한 뒤에는 정제된 타입을 받아 같은 검사를 반복하지 않습니다. 그 뒤 불변조건이 깨지면 외부 입력 오류가 아니라 내부 버그이므로 `assert!`로 확인합니다.",
        "Past the boundary, take the refined type and do not check again. Inside it, a violated invariant is a bug: assert! it."
      ],
      [
        "h2",
        "3단계: 런타임 검사",
        "Level 3: runtime check"
      ],
      [
        "p",
        "타입으로 표현할 수 없는 조건은 외부 경계에서 검사합니다. 예를 들어 `LoadOptions::parse`는 레지스트리에서 지원하지 않는 칩 수를 `LoadError::Unsupported`로 거부합니다. 테스트에서는 이 검사가 일어나는지만 고정합니다.",
        "When no type can hold a value, check it where it enters: LoadOptions::parse rejects a chip count ... a level 4 test only pins that the check fires."
      ],
      [
        "h2",
        "4단계: 테스트",
        "Level 4: tests"
      ],
      [
        "list",
        [
          [
            "파서가 허용하거나 거부하는 입력.",
            "A parser's accepted and refused inputs."
          ],
          [
            "하드웨어·컴파일러·프레임워크·체크포인트 파일 형식 등 외부와의 계약.",
            "A contract with an outside party: hardware, compiler, framework, checkpoint format."
          ],
          [
            "기준 구현과의 수치적 일치.",
            "Numerical agreement with a reference."
          ]
        ]
      ],
      [
        "h2",
        "계약 하나당 테스트 하나",
        "One contract per test"
      ],
      [
        "table",
        [
          "계약",
          "테스트 접점"
        ],
        [
          [
            "NPU 커널",
            "실제 장치에서 `launch`"
          ],
          [
            "vLLM 동작",
            "`LLM.generate`"
          ],
          [
            "SGLang 동작",
            "HTTP 엔드포인트"
          ],
          [
            "병렬화 한도",
            "서버 시작 단계"
          ],
          [
            "캐시 전송",
            "Copy Hook"
          ]
        ]
      ],
      [
        "p",
        "가짜 객체(Mock)는 잘못된 가정을 공유할 수 있으므로, 실제 하드웨어와 고정된 프레임워크 버전으로 검증해야 합니다.",
        "Use real hardware and the pinned framework version, because a mock shares the code's wrong assumptions."
      ],
      [
        "h2",
        "테스트 파일의 위치",
        "Where a test lives"
      ],
      [
        "p",
        "Rust 단위 테스트는 구현을 소유한 파일 내부의 `#[cfg(test)] mod tests`에 둡니다. 별도의 `tests.rs`나 `#[path]` 모듈을 만들지 않습니다. 모듈·크레이트의 공개 경계를 검증할 때만 별도의 통합 테스트 파일을 사용합니다.",
        "A Rust unit test sits inline, in a #[cfg(test)] mod tests of the file that owns the behavior."
      ],
      [
        "h2",
        "독립된 기준값(Oracle)과 비교",
        "Assert against an oracle"
      ],
      [
        "p",
        "자체 출력의 녹화본이나 테스트 대상 코드를 다시 구현한 결과로 비교하지 않습니다. `adds_elementwise`는 호스트의 `f32` 계산을 기준으로 사용합니다.",
        "Never compare with a recording of our own output, or re-implement the code under test. adds_elementwise computes the expected sum on the host in f32."
      ],
      [
        "p",
        "기준은 동일 체크포인트의 Transformers, 같은 요청의 다른 경로(배치/단독, 캐시 적중/실패), 프레임워크 명세, 별도로 저장한 원본 프레임워크 출력 등이 될 수 있습니다.",
        "Oracles are Transformers on the same checkpoint, the same request through another path, framework semantics, and the upstream framework's reference outputs."
      ],
      [
        "list",
        [
          [
            "Log Probability 비교에서는 Cosine Similarity 계산 전에 중심화합니다.",
            "Log-probabilities are centered before cosine similarity."
          ],
          [
            "Greedy Token 검증은 BF16 반올림에 따른 상위 두 토큰의 순위 변경을 감안해 최상위 확률의 5% 이내를 허용합니다.",
            "A greedy token passes within 5% of the top probability, which allows for BF16 rounding tying the top two."
          ]
        ]
      ],
      [
        "h2",
        "각 거부 사유를 고정",
        "Pin each rejection"
      ],
      [
        "p",
        "거부되는 각 경로에 대해 오류 종류와 사유를 확인하는 독립 사례를 작성합니다. 알 수 없는 아키텍처는 `InvalidData`, 지원하지 않는 아키텍처나 구현 조건은 `Unsupported`로 구분합니다.",
        "Each way to be refused gets its own case asserting the kind and the reason."
      ],
      [
        "h2",
        "점검 순서",
        "Checklist"
      ],
      [
        "list",
        [
          [
            "타입으로 불가능하게 만들 수 있는가? 가능하면 타입으로 보장하고 테스트하지 않습니다.",
            "A type can make it unrepresentable: do that, no test."
          ],
          [
            "입력이 신뢰할 수 없는가? 한 번만 검증하고 허용·거부를 테스트합니다.",
            "The input is untrusted: parse once, test accepted and refused inputs."
          ],
          [
            "타입으로 보장할 수 없다면 경계에서 검사하고 각 거부를 검증합니다.",
            "No type can hold it: check at the boundary, test each refusal."
          ],
          [
            "상위 수준의 테스트가 이미 보장한다면 중복 테스트를 작성하지 않습니다.",
            "A higher test already covers it: write nothing, delete duplicates."
          ],
          [
            "그 외에는 관찰 가능한 가장 높은 경계에서 실장비·독립 Oracle을 이용해 계약 테스트 하나를 작성합니다.",
            "Otherwise write one test, named for its contract, at the highest boundary, on hardware, against an oracle."
          ]
        ]
      ]
    ]
  },
  "develop/kernel": {
    "title": "vISA 커널 작성",
    "partial": true,
    "blocks": [
      [
        "note",
        "원문은 `Add` 실제 구현과 테스트의 Rust 코드를 `--8<--` 매크로로 가져옵니다. 이 발췌 번역에서는 **설명·검증 규칙을 번역**하고, 코드 본문은 원문 GitHub에서 확인하도록 남깁니다. 따라서 완역으로 표시하지 않습니다.",
        "The example is Add, with code snippets from the model crate."
      ],
      [
        "p",
        "기존 모델 크레이트가 지원하지 않는 **Leaf Operation**을 새로 구현할 때 사용하는 가이드입니다. 이미 구현된 연산을 조립하는 방법은 Model Composition / Adding a model을 참고합니다.",
        "Write the device kernel of a leaf operation that a model needs and the models crate does not implement yet."
      ],
      [
        "p",
        "여기서 커널은 `furiosa-opt` SDK의 **vISA**로 작성합니다. 텐서·매핑·엔진 개념은 furiosa-opt 설명서를 따릅니다.",
        "Kernels are written in the Virtual ISA (VISA) of the furiosa-opt SDK."
      ],
      [
        "h2",
        "연산 정의",
        "Define the operation"
      ],
      [
        "p",
        "Leaf Operation은 `crates/furiosa-opt-models/src/ops/`에 있고 하드웨어를 직접 다루는 계층입니다. `ops/mod.rs`에 하위 모듈을 `pub mod <name>;`로 등록합니다.",
        "Leaf operations live in crates/furiosa-opt-models/src/ops/. They are the only modules that touch hardware."
      ],
      [
        "list",
        [
          [
            "연산 구조체는 RMSNorm 가중치 같은 파라미터를 갖고, `DeviceSend`를 구현해 `#[device]`로 전달될 수 있어야 합니다.",
            "The struct holds the operation's parameters ... derives DeviceSend."
          ],
          [
            "허용된 피연산자 타입마다 `Op` 구현을 제공하며, 입력 레이아웃/자료형/메모리는 타입에서 결정합니다.",
            "Each impl takes the device and operands; operand types fix each tensor's memory, element type and mapping."
          ],
          [
            "크기는 `Rows`, `Hidden`과 같은 축 타입으로 전달합니다. 구현은 모델 이름이나 레이어 수에 따른 분기를 피합니다.",
            "Axis sizes are type parameters, such as Add's Hidden and Rows, and the model definition fixes them."
          ],
          [
            "문서 주석은 수학과 정밀도 계약을 명시하고, 테스트가 그 계약을 독립적으로 확인해야 합니다.",
            "The doc comment states the mathematics and its precision, and the test checks the kernel against it."
          ],
          [
            "가중치가 있는 경우뿐 아니라 없는 경우에도 체크포인트 로딩 계약을 위해 `Load`를 선언합니다.",
            "To load as part of a model, the struct derives Load ... an operation without weights derives it too and reads nothing."
          ]
        ]
      ],
      [
        "h2",
        "Add 연산 예제의 데이터 흐름",
        "Example: Add"
      ],
      [
        "p",
        "HBM 텐서는 공용 원소별 연산을 재사용하며, DM의 `Spread` Row는 Leaf 커널이 직접 처리합니다. **Sub Context는 rhs를 VRF로 적재하고, Main Context는 lhs를 Vector Engine으로 스트리밍**합니다. 더한 결과를 BF16으로 Cast하고 DM에 Commit합니다.",
        "The sub context loads rhs into the vector register file, and the main context streams lhs through the vector engine, adds rhs, casts the sum to bf16 and commits it to DM."
      ],
      [
        "p",
        "Vector Engine은 32비트 값으로 연산하므로, 두 입력은 Fetch 시 f32로 변환됩니다. 계산의 통과 경로는 `Fetch → Collect → Vector → Cast → Commit`입니다.",
        "The vector engine computes on 32-bit lanes, so both terms are cast to f32 as they are fetched. The DM chain passes through fetch, collect, vector, cast and commit."
      ],
      [
        "h2",
        "커널이 없는 연산",
        "Operations without a kernel"
      ],
      [
        "p",
        "커널이 없는 `forward`는 필요한 연산을 설명하는 `todo!()`일 수 있습니다. `todo!()`도 출력 타입 검사를 통과하기 때문에 모델이 컴파일·적재되어도 첫 NPU Launch에서 Panic이 발생할 수 있습니다.",
        "An operation without a kernel is a typed contract whose forward is todo!(). A family that uses the operation still compiles and loads, and its first launch panics."
      ],
      [
        "code",
        "bash",
        "grep -rn 'todo!(' crates/furiosa-opt-models/src"
      ],
      [
        "p",
        "이 경우 기존 `Op` 구현 시그니처를 유지하며 `todo!()` 자리에 실제 커널을 작성합니다.",
        "Write the kernel in place of the todo!(). Keep the impl's signature."
      ],
      [
        "h2",
        "실제 칩에서 커널 검증",
        "Test the kernel on the chip"
      ],
      [
        "list",
        [
          [
            "`axes!`로 축 크기를 확정합니다(원문 예제 `Pinned=1024`).",
            "Fix the axis sizes with axes!, here Pinned = 1024."
          ],
          [
            "업로드·Launch가 비동기이므로 `#[tokio::test(flavor=\"current_thread\")]`를 사용합니다.",
            "Make the test a tokio test because uploads and launches are awaited."
          ],
          [
            "`Device::new(...)`로 장치를 열고 피연산자를 HBM에 올린 뒤 결과를 호스트로 되돌립니다.",
            "Open the device, upload operands with to_hbm, launch and read back with to_host."
          ],
          [
            "호스트의 독립 계산값과 비교하고 정밀도가 고정된 경우 비트 단위로 검증합니다.",
            "Compute expected values on host; compare within tolerance, or bits when contract fixes rounding."
          ],
          [
            "동시에 동일 칩을 사용하는 테스트는 공유 Device Lock으로 직렬화합니다.",
            "Hold crate::tests::DEVICE while a test uses the chip."
          ]
        ]
      ],
      [
        "code",
        "bash",
        "cargo furiosa-opt test -p furiosa-opt-models --release --lib \\\n  ops::pointwise::add::tests::adds_elementwise -- --test-threads 1"
      ],
      [
        "h2",
        "Lowering 단계의 함정",
        "Lowering traps"
      ],
      [
        "list",
        [
          [
            "HBM→DM Source Stride는 **8바이트 정렬**이 필요합니다. CPU 백엔드는 일부 잘못된 소스 정렬을 통과시키므로 NPU 빌드에서 확인해야 합니다.",
            "HBM-to-DM source strides must be 8-byte aligned."
          ],
          [
            "Collect의 패킷은 **32바이트 Flit 하나**입니다. 더 큰 패킷은 Lowering에 실패합니다.",
            "A collect packet is one 32-byte flit."
          ],
          [
            "`vector_widen_pad`로 추가된 Lane은 NPU에서 이전 값이 남아 있을 수 있습니다. CPU 백엔드에서는 0으로 보여 테스트를 속일 수 있으므로 실제 칩에서 확인해야 합니다.",
            "After vector_widen_pad, the new lanes hold stale values on the chip and zero on the CPU backend."
          ]
        ]
      ],
      [
        "p",
        "최종적으로 Leaf 테스트와 모델 전체 테스트를 모두 실행해야 합니다.",
        "Run the operation's test, then the model's tests."
      ]
    ]
  },
  "develop/compose": {
    "title": "모델 조립과 스트리밍",
    "partial": true,
    "blocks": [
      [
        "note",
        "원문에는 Mistral NeMo 실제 Rust 조합 코드, Streaming 루프 등 하위 절이 더 있습니다. 이 문서는 **주요 인터페이스·가중치 로딩·스트리밍 설계를 우선 번역한 발췌판**입니다.",
        "The worked example is Mistral NeMo; the source has full code snippets and additional sections."
      ],
      [
        "p",
        "모델은 하나의 `Module` 트레이트를 구현한 모듈 트리입니다. 트리에는 체크포인트에서 필드명으로 로드하는 가중치도 포함되며, 전체를 실행하거나 Row 타일 단위로 처리할 수 있습니다.",
        "A model is a tree of modules that all implement one trait, Module. The tree also holds the model's weights, which load from a checkpoint by its field names. It runs on the device whole, or a tile of rows at a time."
      ],
      [
        "h2",
        "Module의 네 인자",
        "The Module contract"
      ],
      [
        "table",
        [
          "인자",
          "역할",
          "결정 시점"
        ],
        [
          [
            "`self`",
            "가중치와 Checkpoint Config에서 읽은 상수",
            "모델 적재 시"
          ],
          [
            "`env`",
            "Position, Block Table, 현재 처리할 Row 등 호출 전역 정보",
            "호출마다"
          ],
          [
            "`state`",
            "KV Cache 블록 또는 Recurrent State 같은 쓰기 가능한 상태",
            "호출마다 빌림"
          ],
          [
            "`input`",
            "계산 중 흐르는 입력 데이터와 호출자가 소유한 출력 버퍼",
            "호출마다"
          ]
        ]
      ],
      [
        "p",
        "모듈이 **가중치는 소유하지만 요청별 State는 소유하지 않습니다.** 따라서 하나의 적재된 모델이 여러 요청을 처리할 수 있습니다.",
        "A module owns its weights, never its state, so one loaded tree serves any number of requests."
      ],
      [
        "p",
        "부모 모듈의 State는 하위 모듈 State의 조합이며, Stateless Module은 `&mut ()`을 사용합니다. 일반적인 `env`는 복합 모듈을 거쳐 전달됩니다.",
        "A composite's state is its children's states; a stateless module takes &mut (). A composite passes env on as a generic E."
      ],
      [
        "h2",
        "네 종류의 모듈",
        "Four kinds of module"
      ],
      [
        "table",
        [
          "종류",
          "소스 위치",
          "예시"
        ],
        [
          [
            "Leaf Operation",
            "`ops/`",
            "`Add`, `RmsNorm`, `Linear`"
          ],
          [
            "범용 Combinator",
            "`modules/generic/`",
            "`Sequential`, `Then`, `Layers`"
          ],
          [
            "관계 모듈(Relation)",
            "`modules/`",
            "`Attention`, `Residual`"
          ],
          [
            "모델 정의",
            "`models/`",
            "`mistral::Model`, `qwen3::ForCausalLM`"
          ]
        ]
      ],
      [
        "p",
        "하드웨어를 직접 사용하는 것은 Leaf이며, 범용 Combinator는 계산 구조만 조합합니다. `Sequential`은 첫 모듈의 결과를 두 번째에 전달하고 두 모듈 사이 타입이 다르면 컴파일이 실패합니다.",
        "Only leaves touch hardware. Sequential passes its first child's output to the second by value; a mismatch fails to compile."
      ],
      [
        "h2",
        "컴파일 시 Variant 선택",
        "Variant selection"
      ],
      [
        "p",
        "모듈과 연산은 피연산자의 타입별로 구현을 갖고, 컴파일러가 입력 타입과 자식 타입에 따라 구현을 고릅니다. **실행 중 Variant 디스패치는 없습니다.**",
        "A module or an op has one impl for each operand type it takes, and the compiler picks the impl from the operand and child types. Nothing dispatches at run time."
      ],
      [
        "list",
        [
          [
            "가중치 표현: `tensor/form` 타입으로 FP8·NVFP4 같은 저장/복구 방식을 표현.",
            "Weight form: a type in tensor/form that says how a weight is stored and restored."
          ],
          [
            "전략: `specialize/` 값으로 타일링과 Attention Strategy를 선택.",
            "Strategy: a value in specialize/, such as contraction tiling or attention strategy."
          ],
          [
            "캐시: `Scatter` 등의 연산은 KV Cache 레이아웃 타입별 구현을 가집니다.",
            "Cache: Scatter has an impl for each cache it writes into."
          ],
          [
            "배치: `Parallel<N>`이 N개 칩에 대한 Tensor Parallelism을 타입으로 지정합니다.",
            "Placement: a model alias takes Parallel<N>, tensor parallelism over N chips, as a type."
          ],
          [
            "Row: `Live<X,R>`는 한 호출이 실제 사용하는 Row 수를 나타냅니다.",
            "Rows: Live<X, R> carries the rows a call fills."
          ]
        ]
      ],
      [
        "h2",
        "가중치와 적재",
        "Weights and loading"
      ],
      [
        "p",
        "`#[derive(Load)]`는 체크포인트 필드명에 따라 가중치를 HBM으로 한 텐서씩 적재합니다. `T<Hbm>`이 가중치를 소유하고 호출은 `T<&Hbm>`로 빌려 사용합니다.",
        "A tree is generic over its memory: T<Hbm> owns its leaves in HBM, and a call borrows it as T<&Hbm>. Nothing stays on host."
      ],
      [
        "p",
        "원문은 `Update`를 이용해 **이미 적재한 모델 트리의 가중치를 원위치에 갱신**하는 경로도 설명합니다. 이는 재컴파일 없이 일부 가중치를 바꾸려는 응용에 중요한 단서입니다. 도중 실패하면 모델 값은 다시 적재할 때까지 불확정입니다.",
        "An Update writes new weights into a loaded tree as their chunks arrive, keeping its structure and ties. If a write fails after the device took it, the tree's values are unknown until it loads again."
      ],
      [
        "h2",
        "타일 단위 스트리밍 실행",
        "Streaming execution"
      ],
      [
        "p",
        "일반 `forward`는 한 모듈의 출력을 모두 계산한 뒤 다음 모듈을 시작합니다. 스트리밍은 Row 그룹 하나가 완성되면 다음 모듈로 전달합니다. 입력을 기다리는 모듈도 다음 가중치를 DM으로 미리 이동시키는 독립 작업을 할 수 있습니다.",
        "forward computes a module's whole output before the next module starts. The streaming form runs the same tree a tile at a time. A module that waits for input can do work such as moving its next weights to DM."
      ],
      [
        "table",
        [
          "모듈",
          "스트리밍 방식"
        ],
        [
          [
            "`RowWise` Leaf",
            "입력 Row 타일마다 `forward`"
          ],
          [
            "`CrossRow` Leaf (Attention 등)",
            "모든 입력 타일을 보관한 뒤 계산하고 결과를 타일별 출력"
          ],
          [
            "`Sequential`, `Then`",
            "첫 모듈의 스트림을 두 번째 모듈이 소비"
          ],
          [
            "`Residual`",
            "정규화된 타일을 Branch로 전달한 후 원본과 더함"
          ],
          [
            "반복 `Layers`",
            "활성 상태의 두 레이어를 순환 재사용하여 Layer 수 증가에도 코드 복사 최소화"
          ]
        ]
      ],
      [
        "p",
        "각 모듈은 필요한 시점에 입력 타일을 Pull하는 스트림 노드처럼 동작하며, `Scheduled<M>`이 루트를 반복 Poll합니다. 동작 보장은 원문 `schedule.rs`에 정의되어 있습니다.",
        "Each module streams as a node that the next module polls, like a futures::Stream. Scheduled<M> polls a model's root this way until it is done."
      ],
      [
        "h2",
        "전체 예제와 추가 세부 구현",
        "Further source"
      ],
      [
        "p",
        "원문에는 모델 레지스트리, 호스트 실행 구성, Device Entry, 수학적 Trait, NeMo 40 Layer 조립 등 코드 예시가 더 있습니다. 이 발췌 번역에서 생략된 부분은 상단 원문 링크에서 확인하세요.",
        "The original page has more sections including the model registry and the host."
      ]
    ]
  },
  "reference/rust": {
    "title": "Rust API 참조",
    "blocks": [
      [
        "p",
        "Rust API 문서는 `main` 브랜치를 기준으로 생성됩니다. 코드·트레이트의 최신 정확한 시그니처는 아래 공식 API에서 확인하세요.",
        "The reference is built from main."
      ],
      [
        "list",
        [
          [
            "**`furiosa_opt_models`**: 수치 연산, 모듈, 모델 정의, 모델 Registry, 가중치 적재 방식. 공식 API: https://developer.furiosa.ai/furiosa-opt-models/api/rust/furiosa_opt_models/",
            "furiosa_opt_models: numerical operations, modules, model definitions, the model registry and how weights load."
          ],
          [
            "**`furiosa_opt_engine`**: 로드 옵션, 실행 호출, Decoder API. 공식 API: https://developer.furiosa.ai/furiosa-opt-models/api/rust/furiosa_opt_engine/",
            "furiosa_opt_engine: load options, launches and decoder calls."
          ]
        ]
      ],
      [
        "p",
        "프레임워크는 Python 모듈을 통해 엔진을 호출하지만, 이 Rust API에는 새 모델을 추가할 개발자를 위한 내부 구조도 포함됩니다.",
        "Frameworks call the engine through its Python module, so this reference also documents its internal items, for developers adding a model."
      ]
    ]
  }
});

Object.assign(window.OPT_DOCS_ADVANCED,{
  "develop/add-model": {
    "title": "기존 연산으로 모델 추가하기",
    "partial": true,
    "blocks": [
      [
        "note",
        "원문에는 Mistral NeMo·Qwen3의 Rust 코드 포함(`--8<--`)과 레지스트리 연결 예제가 있습니다. 이 페이지는 **작업 절차와 파일 관계를 번역**하고 코드 본문은 영문 GitHub에서 보도록 남깁니다.",
        "The composition example is Mistral NeMo, and the later steps follow the Qwen3 files."
      ],
      [
        "p",
        "이미 구현된 연산 블록을 조합해 새 모델을 추가할 때의 안내입니다. 커널이 새로 필요하지 않은 경우를 전제로 합니다. 수학적 연산을 추가해야 한다면 [[vISA 커널 작성|develop/kernel]]을 먼저 참고하세요.",
        "Add a model whose building blocks already exist in the models crate, so no new kernel is written."
      ],
      [
        "table",
        [
          "단계",
          "코드 위치"
        ],
        [
          [
            "모델 모듈 조립",
            "`crates/furiosa-opt-models/src/models/<family>/<model type>.rs`"
          ],
          [
            "가중치 로더",
            "같은 모델 파일"
          ],
          [
            "서빙 Decoder와 Python 바인딩",
            "`crates/furiosa-opt-engine/src/decoder/`, `crates/furiosa-opt-python/src/model/`"
          ],
          [
            "Registry 등록",
            "`crates/furiosa-opt-engine/src/registry.rs`"
          ],
          [
            "체크포인트 벤치마크 등록",
            "`.github/benchmarks.json`"
          ],
          [
            "문서 등록",
            "`docs/models/<name>.md`, `mkdocs.yml`"
          ],
          [
            "테스트 추가",
            "`crates/furiosa-opt-engine/tests/`"
          ]
        ]
      ],
      [
        "h2",
        "모듈 구조 정의",
        "Define the composition"
      ],
      [
        "p",
        "모델 계열의 `models/` 경로에 새 타입을 만들고 `mod.rs`에 `pub mod <model type>;`을 등록합니다. 체크포인트의 아키텍처와 Shape에 맞는 기존 모듈을 조립합니다.",
        "Create the model type's file in its family's directory and bind the checkpoint's architecture to existing modules at its dimensions."
      ],
      [
        "p",
        "각 크기별 `Geometry`와 `Decode` 조건을 타입으로 정의합니다. 체크포인트 설정이 타입으로 고정한 크기나 연산 형식과 다르면 명시적으로 거부해야 합니다.",
        "Each size implements Geometry and Decode. Converting the parsed Config to a size checks every value the size fixes."
      ],
      [
        "list",
        [
          [
            "모델 파일은 위에서 아래로 **모델 타입 → 구성 요소(Embedding/Layer/Norm/Head) → 입출력 타입 → 축/상수 → Config 파싱 → 테스트** 순서로 작성합니다.",
            "Declare items top-down: model type, parts, input/output/context types, axes/constants, Config and parsing, tests."
          ],
          [
            "카탈로그 템플릿에는 따라 만든 Transformers/vLLM 소스의 정확한 커밋 URL을 `/// Source: <URL>`로 기록합니다.",
            "Give every catalog template a /// Source: <URL> line at a pinned commit."
          ]
        ]
      ],
      [
        "h2",
        "체크포인트 가중치 적재",
        "Load its weights"
      ],
      [
        "p",
        "새 구조체에는 `Load`를 파생(`derive`)하고 실제 체크포인트 텐서 이름과 각 필드가 일치하게 작성합니다. 이름이나 Shape가 다르면 매핑 속성으로 처리합니다. 사용하지 않는 체크포인트 텐서는 명시적으로 무시할 접두사를 선언해야 합니다.",
        "Derive Load on each struct ... name each field as the checkpoint names it. A checkpoint tensor that no field reads fails the load unless an ignore prefix covers it."
      ],
      [
        "h2",
        "엔진 서빙 연결",
        "Serve it from the engine"
      ],
      [
        "p",
        "엔진 Decoder는 호출의 행과 결과, Cache Layer View를 구성합니다. Python 쪽 타입은 공통 `Decoder`를 상속하며, 바인딩 등록과 `LoadOptions.load`에 새 모델 타입을 연결합니다.",
        "The decoder states what one call holds and returns, views each layer of the cache, and launches the call. The Python class derives from Decoder."
      ],
      [
        "p",
        "Python 타입 Stub이 바뀌면 다음 명령으로 재생성합니다. 설치된 Python의 `LIBDIR` 경로를 `LD_LIBRARY_PATH`에 포함해야 할 수 있으며, Stub이 소스와 다르면 CI가 실패합니다.",
        "Regenerate the Python type stubs with cargo furiosa-opt run ...; CI fails when the stubs differ from the code."
      ],
      [
        "code",
        "bash",
        "cargo furiosa-opt run -p furiosa-opt-python --release --bin stub"
      ],
      [
        "h2",
        "레지스트리 등록",
        "Add it to the registry"
      ],
      [
        "p",
        "지원할 크기마다 `Implementation::of::<T>()`를 등록합니다. 모델 아키텍처 이름은 레지스트리에 한 번만 나타나며, 제공할 구체 타입이 없으면 거부 상태로 남습니다.",
        "Add Implementation::of::<T>() for each concrete type, one per size, to the row of each upstream architecture."
      ],
      [
        "h2",
        "벤치마크 목록 등록",
        "List the checkpoint"
      ],
      [
        "p",
        "`.github/benchmarks.json`의 `models` 배열에 새 행을 추가합니다.",
        "Add a row to models in .github/benchmarks.json, copying a similar model's row."
      ],
      [
        "code",
        "json",
        "{\n  \"id\": \"org/Model-Name\",\n  \"tier\": \"nightly\",\n  \"task\": \"text\",\n  \"doc\": \"model-name\",\n  \"serve\": [\"--max-model-len\", \"40960\"],\n  \"download\": [\"*.json\", \"*.safetensors\"]\n}"
      ],
      [
        "list",
        [
          [
            "`tier`: Gate 또는 Nightly 측정 주기.",
            "tier sets how often CI runs the row."
          ],
          [
            "`revision`: 다운로드할 Checkpoint 커밋 고정.",
            "revision pins the checkpoint commit that CI downloads."
          ],
          [
            "`reference`: 비교할 참조 출력 태그.",
            "reference names the reference outputs that the tests compare with."
          ],
          [
            "`download`: Hugging Face에서 받을 파일 패턴.",
            "download lists the files CI downloads as hf download --include patterns."
          ],
          [
            "`quantization`: 양자화 가중치/활성화 정밀도와 해당 레이어.",
            "quantization lists the precision of a quantized checkpoint."
          ],
          [
            "`forward`: 독립적으로 측정할 NPU Forward 테스트.",
            "forward names the row's device test."
          ]
        ]
      ],
      [
        "h2",
        "문서와 테스트",
        "Document and test"
      ],
      [
        "p",
        "`docs/models/<name>.md`를 추가하고 `mkdocs.yml` 탐색 메뉴에 등록합니다. `mkdocs build --strict`는 목차 밖의 문서를 오류로 처리합니다. 테스트는 Transformers의 동일 체크포인트 Greedy 출력과 비교하고, 지원하지 않는 요청이 거부되는지도 고정합니다.",
        "Create docs/models/<name>.md and add it to nav. Test the model type ... compare a greedy continuation with Transformers and pin each refusal."
      ]
    ]
  },
  "develop/testing": {
    "title": "모델 테스트와 벤치마크",
    "partial": true,
    "blocks": [
      [
        "note",
        "원문에서 일부 벤치마크 명령은 MkDocs 템플릿(`{{ ... }}`)으로 최신 모델을 선택해 생성합니다. 여기서는 재현 가능한 고정 명령과 측정 원칙을 번역했습니다. 전체 템플릿이 렌더링된 명령은 공식 웹 문서를 보세요.",
        "Testing commands use macros to select the served checkpoint at build time."
      ],
      [
        "p",
        "모델 및 프레임워크 테스트를 수행하려면 RNGD 장치, `uv`, `cargo-furiosa-opt`가 필요합니다. 체크포인트 Fixture는 `uv`로 다운로드됩니다.",
        "You need an RNGD device, uv and cargo-furiosa-opt on your PATH."
      ],
      [
        "h2",
        "모델 단위 테스트",
        "Test a model"
      ],
      [
        "p",
        "장치에서 Checkpoint를 적재하고 디코딩한 결과를 Transformers와 비교합니다.",
        "They load the checkpoint, decode on the device and check the output against Transformers."
      ],
      [
        "code",
        "bash",
        "cargo furiosa-opt test -p furiosa-opt-engine --release --test qwen3_bf16 \\\n  -- --include-ignored --test-threads 1"
      ],
      [
        "p",
        "장치를 여는 테스트는 기본적으로 Ignored이므로 `--include-ignored`로 실행합니다. 새 컴파일러 리비전에서 첫 빌드가 오래 걸릴 수 있습니다.",
        "A test that opens a device is ignored by default ... the first build on a new compiler revision is slow."
      ],
      [
        "p",
        "개별 연산은 `-p furiosa-opt-models`와 `adds_elementwise` 같은 테스트로 검사합니다. Checkpoint 설정만 검증하는 테스트는 `config.json` 및 Safetensors 헤더만 읽어 처음 실행 시 Hugging Face 캐시에 저장하고 다음부터 재사용합니다.",
        "To test one numerical operation, run a models test. The engine's tests of a checkpoint's config and strict load fetch no weights."
      ],
      [
        "h2",
        "프레임워크 테스트",
        "Run the framework tests"
      ],
      [
        "p",
        "플러그인을 설치한 뒤 RNGD에서 vLLM과 SGLang 테스트를 각각 실행합니다. 일부 테스트는 `FURIOSA_OPT_REFERENCES`의 독립 기준값을 읽습니다.",
        "Install a plugin ... then run its tests on RNGD. A test that compares with reference outputs reads them from FURIOSA_OPT_REFERENCES."
      ],
      [
        "code",
        "bash",
        "python -m pytest integrations/furiosa-opt-vllm/tests\npython -m pytest integrations/furiosa-opt-sglang/tests"
      ],
      [
        "h2",
        "기준 출력(Reference Output)",
        "Reference outputs"
      ],
      [
        "p",
        "기준 출력은 원본 프레임워크가 자신에게 맞는 장치에서 **같은 고정 요청**을 실행한 결과입니다. 자체 구현의 출력을 저장하면 현재 버그까지 고정할 수 있으므로 기준값으로 사용하지 않습니다.",
        "A reference output is what the upstream framework returns for one fixed request ... It is never our own output."
      ],
      [
        "p",
        "참조 결과는 체크포인트의 리비전에 묶인 `references/<org>--<name>@<revision>` 태그로 저장합니다. `manifest.json`에 버전, 요청, Hash 등을 기록하며, CI는 Tag 단위로 캐시하므로 기존 Tag를 덮어쓰면 안 됩니다.",
        "Each reference is a release of this repository, tagged references/<org>--<name>@<revision>. A tag is never changed."
      ],
      [
        "code",
        "bash",
        "export FURIOSA_OPT_REFERENCES=~/.cache/furiosa-opt-models/references\ntag=references/<org>--<checkpoint>@<revision>\ngh release download \"$tag\" --repo furiosa-ai/furiosa-opt-models --dir \"$FURIOSA_OPT_REFERENCES/$tag\""
      ],
      [
        "h2",
        "벤치마크 재현",
        "Reproduce a benchmark"
      ],
      [
        "p",
        "커널 실행 시간과 Forward 시간은 `FURIOSA_OPT_PROFILE=info`로 장치 Span을 기록한 뒤 확인합니다. Chrome Trace는 `trace/<org>--<checkpoint>/forward.json`에 생성되며 Perfetto로 열 수 있습니다.",
        "To reproduce kernel and forward figures, run a checkpoint's forward test with FURIOSA_OPT_PROFILE=info. The trace lands in trace/<org>--<checkpoint>/forward.json."
      ],
      [
        "h2",
        "측정 구현",
        "Measurement implementation"
      ],
      [
        "table",
        [
          "측정 단계",
          "기준 Span",
          "기록 방식"
        ],
        [
          [
            "Kernel",
            "Forward 내부의 `NPU` Span",
            "Chrome Trace·장치 Cycle"
          ],
          [
            "Forward",
            "`forward` Span",
            "Host 시간, ms로 게시"
          ],
          [
            "Serving",
            "클라이언트가 관측한 전체 요청",
            "vLLM Bench 또는 Contract Test의 Trace"
          ]
        ]
      ],
      [
        "p",
        "커널 시간은 `begin_cycle`부터 `end_cycle`까지 집계하고, Forward의 호스트 시간과 구분합니다. CI는 같은 단계의 중앙값을 기록하며 PR에서는 기준 커밋 대비 예산 초과 여부를 검사합니다.",
        "Kernel time is begin_cycle to end_cycle. Forward time is recorded in microseconds and published in milliseconds. The metrics action takes the median."
      ],
      [
        "p",
        "서빙 결과는 동시성·워크로드별 TTFT(Time To First Token), TPOT(Time Per Output Token), 전체 요청 지연으로 기록합니다.",
        "Serving records median time to first token, time per output token and whole-request latency per concurrency width and workload."
      ]
    ]
  },
  "reference/python": {
    "title": "Python API 참조 안내",
    "partial": true,
    "blocks": [
      [
        "note",
        "공식 Python Reference는 Python 타입 Stub에서 자동 생성되는 API 시그니처 페이지입니다. 이 한국어판은 **API 계층과 주요 타입의 역할**을 설명하고, 실제 함수 매개변수·반환값의 최신 표는 상단 원문을 보도록 연결합니다.",
        "This page is generated from its type stubs and grouped by task."
      ],
      [
        "p",
        "엔진은 양쪽 플러그인의 의존성으로 설치되는 `furiosa_opt_engine` 패키지입니다. 실제 사용 순서는 [[Python 엔진 사용|engine/python]]을 참고하세요.",
        "The engine is the furiosa_opt_engine package, which both plugins install as a dependency."
      ],
      [
        "h2",
        "체크포인트 적재",
        "Load a checkpoint"
      ],
      [
        "p",
        "`Checkpoint`는 모델 파일과 설정을 표현합니다. `LoadOptions`는 가중치를 읽기 전에 선택한 구성이 체크포인트에 적합한지 검사하고, Registry가 선택한 모델을 `Device`에 적재합니다.",
        "LoadOptions checks its choices against a Checkpoint before any weight is read, then loads the model the registry selects onto a Device."
      ],
      [
        "table",
        [
          "타입",
          "역할"
        ],
        [
          [
            "`Checkpoint`",
            "체크포인트와 텐서/설정 확인"
          ],
          [
            "`LoadOptions`",
            "아키텍처·KV 타입·배치 등의 로딩 계약"
          ]
        ]
      ],
      [
        "h2",
        "디바이스 메모리",
        "Device memory"
      ],
      [
        "table",
        [
          "타입",
          "역할"
        ],
        [
          [
            "`Placement`",
            "칩·PE 위치 지정"
          ],
          [
            "`Device`",
            "RNGD 장치 핸들"
          ],
          [
            "`HbmBuffer`",
            "HBM의 바이트 버퍼"
          ],
          [
            "`HostBuffer`",
            "호스트 메모리 버퍼"
          ],
          [
            "`Transfer`",
            "비동기 데이터 이동 완료 객체"
          ],
          [
            "`HostTensor`",
            "호스트 텐서"
          ],
          [
            "`HbmTensor`",
            "NPU 상주 텐서"
          ]
        ]
      ],
      [
        "h2",
        "적재된 모델",
        "Loaded models"
      ],
      [
        "p",
        "모델 적재는 모델 타입별 Python 클래스(예: `qwen3.ForCausalLM`, `llama.ForCausalLM`)를 반환하지만, 공통 `Decoder` 인터페이스를 사용합니다. `forward()`는 장치가 작업을 수락한 직후 반환할 수 있으므로 완료를 기다리는 함수와 구분해야 합니다.",
        "A load returns a Decoder as an object of the model type's class. Every forward returns once the device accepted the call."
      ],
      [
        "p",
        "비전 언어 모델의 미디어 Encoder를 단독으로 로드하면 `Encoder`를 반환하며 `vision_language.Image`, `vision_language.Audio` 같은 입력 타입을 지원하는 구성이 따로 있습니다.",
        "A load of a vision-language model's media encoder alone returns an Encoder."
      ],
      [
        "h2",
        "요청과 KV 캐시",
        "Requests and cache"
      ],
      [
        "p",
        "`decoder.Request`는 한 시퀀스의 토큰·캐시 블록 ID·기존 위치 등을 담습니다. `decoder.Cache(spec, blocks)`는 적재된 모델의 `CacheSpec`을 기준으로 실제 메모리를 할당합니다. `Pool`, `Group`, `Kind`는 캐시 구조를 나타냅니다.",
        "A call takes one Request per sequence and the Cache they append to; Cache(spec, blocks) allocates the CacheSpec that a loaded model describes."
      ],
      [
        "note",
        "**KV 풀 크기를 직접 제어하려는 경우:** 프레임워크 없이 엔진을 직접 사용하면 `Cache(spec, blocks)`의 블록 수가 **메모리 할당의 명시적 입력**입니다. 이 기능이 `furiosa-llm serve`에도 그대로 노출되어 있다는 뜻은 아닙니다.",
        "Cache(spec, blocks) allocates the CacheSpec that a loaded model describes."
      ]
    ]
  },
  "models/index": {
    "title": "지원 모델과 벤치마크 읽기",
    "partial": true,
    "blocks": [
      [
        "note",
        "이 문서는 CI의 `.github/benchmarks.json`과 대시보드 데이터로 표를 **동적으로 생성**합니다. 여기서는 원문의 기준과 대표 모델군만 한글화했으며, 실시간 모델 목록·그래프는 상단 공식 문서를 참고하세요.",
        "The inventory feeds the model tables and the checkpoints CI downloads."
      ],
      [
        "p",
        "공식 목록에 실리는 체크포인트는 CI에서 실제 RNGD에 실행되고, 그 실행 속도가 측정된 경우입니다. 단순히 코드만 존재하는 모델을 지원 모델로 표시하지 않습니다.",
        "These checkpoints run on RNGD at the speed CI measures for them. A model is listed only while it runs in CI."
      ],
      [
        "h2",
        "현재 검증 대상의 예시",
        "Available models"
      ],
      [
        "table",
        [
          "모델 계열",
          "원문에서 열거한 예시",
          "용도"
        ],
        [
          [
            "Qwen3",
            "0.6B, 1.7B, 4B, 8B",
            "텍스트 생성"
          ],
          [
            "Llama",
            "Llama 3 8B, Llama 3.1 NVFP4",
            "텍스트 생성"
          ],
          [
            "Mistral",
            "Mistral 7B, NeMo",
            "텍스트 생성"
          ],
          [
            "Gemma 4",
            "12B NVFP4",
            "텍스트 생성"
          ],
          [
            "Qwen3 Embedding",
            "0.6B, 4B, 8B",
            "임베딩"
          ],
          [
            "Qwen3 Reranker",
            "0.6B, 4B, 8B",
            "리랭킹"
          ]
        ]
      ],
      [
        "p",
        "모델별 표에는 Checkpoint, Gate/Nightly 등급, Weight/Cache Precision, Kernel/Forward 검증, 서빙 검증이 표시됩니다. 최신 상태는 공식 Dashboard와 CI 이력을 함께 확인해야 합니다.",
        "The tables list checkpoints, weights, KV cache, kernel and forward, and serving measures."
      ],
      [
        "h2",
        "지원 여부를 어떻게 유지하나요?",
        "How availability is kept"
      ],
      [
        "p",
        "Gate 등급 모델은 모든 Pull Request마다 Forward와 서빙 스모크 테스트를 거칩니다. Nightly 등급은 매일 여러 동시성·워크로드에서 측정합니다.",
        "Gate checkpoints are measured on every pull request; nightly checkpoints are measured once a day on main."
      ],
      [
        "h2",
        "회귀 방지 기준",
        "Regression gate"
      ],
      [
        "table",
        [
          "단계",
          "기본 회귀 예산",
          "측정"
        ],
        [
          [
            "Kernel",
            "0.5%",
            "장치 Cycle Counter"
          ],
          [
            "Forward",
            "3%",
            "모델 호출의 Host Wall Time"
          ],
          [
            "Serving",
            "차단 게이트가 아닌 관찰 측정",
            "vLLM 요청 지연"
          ]
        ]
      ],
      [
        "p",
        "장치 커널이 0.5%를 초과해 느려지면 전체 Forward가 3% 이내라도 PR이 차단될 수 있습니다. 반면 Serving 측정은 실행 간 편차가 커서 기록만 합니다.",
        "A kernel slowdown of more than 0.5% blocks even when forward time stays within 3%. Serving measurements are recorded but do not block."
      ],
      [
        "h2",
        "어떤 시간을 측정하나요?",
        "What is measured"
      ],
      [
        "table",
        [
          "측정",
          "대상",
          "단위"
        ],
        [
          [
            "Kernel",
            "NPU에서 커널이 실행된 시간",
            "Device Cycle → ms"
          ],
          [
            "Forward",
            "모델 함수 전체 호출 시간",
            "Host ms"
          ],
          [
            "Serving",
            "프레임워크를 거친 요청",
            "TTFT, TPOT, Request Latency"
          ]
        ]
      ],
      [
        "p",
        "Serving은 동시성을 바꿔가며 여러 요청을 실행하고 각 단계의 중앙값을 기록합니다. Trace의 최하위 단계부터 병목을 찾아야 전체 지연 증가 원인을 판단할 수 있습니다.",
        "Three levels cover three layers of the stack, and a regression is attributed to the lowest level that shows it."
      ],
      [
        "h2",
        "대시보드 읽기",
        "Reading the dashboards"
      ],
      [
        "p",
        "추세 그래프는 커밋 간 성능 변화를 표시하고, Throughput 그래프는 최신 Nightly의 동시성별 처리량과 상호작용 속도 관계를 보여 줍니다. 데이터가 없는 경우 측정이 아직 없음을 뜻합니다.",
        "Trend charts plot each measurement as its change from the commit measured before it. Throughput charts draw the latest four nightly commits."
      ]
    ]
  }
});
