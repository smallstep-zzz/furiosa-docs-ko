window.OPT_DOCS_SERVING={
  "serving/index": {
    "title": "서빙: KV Cache · LoRA · 컨텍스트",
    "partial": true,
    "blocks": [
      [
        "note",
        "**이 페이지는 공식 Serving 문서의 핵심 항목만 번역한 발췌판**입니다. 원문에는 임베딩, 도구 호출, Speculative Decoding, Sleep, 양자화, 배치 불변성, 미디어 인코더 등 추가 절이 있습니다. 전체 내용을 확인하려면 페이지 상단의 공식 영문 문서를 여세요.",
        "This page shows each serving task for both frameworks; the tabs switch together."
      ],
      [
        "h2",
        "기능별 지원 범위",
        "Feature support"
      ],
      [
        "table",
        [
          "기능",
          "vLLM",
          "SGLang"
        ],
        [
          [
            "텍스트 생성",
            "지원 (Greedy)",
            "지원 (Greedy)"
          ],
          [
            "임베딩",
            "지원",
            "지원"
          ],
          [
            "리랭킹/점수 헤드",
            "미지원",
            "미지원"
          ],
          [
            "이미지·영상·오디오 입력",
            "미지원",
            "미지원"
          ],
          [
            "구조화 출력",
            "미지원",
            "미지원"
          ],
          [
            "프리픽스 캐시",
            "지원",
            "지원"
          ],
          [
            "호스트 KV 오프로딩",
            "지원",
            "지원"
          ],
          [
            "FP8 KV Cache",
            "미지원",
            "미지원"
          ],
          [
            "LoRA",
            "Qwen3-0.6B 등 제한적 지원",
            "미지원"
          ],
          [
            "Data Parallel",
            "지원",
            "지원"
          ],
          [
            "Tensor/파이프라인 병렬",
            "해당 문서의 서빙에서 미지원",
            "해당 문서의 서빙에서 미지원"
          ]
        ]
      ],
      [
        "note",
        "원문 시점의 구현 범위입니다. 특히 `furiosa-opt-models` 엔진과 별도 제품인 `furiosa-llm`의 지원표를 혼합해 해석하면 안 됩니다.",
        "A feature that is not supported yet is refused only in the ways Features not supported yet lists."
      ],
      [
        "h2",
        "프리픽스 캐시 재사용",
        "Reuse cached prefixes"
      ],
      [
        "p",
        "두 서버 모두 이전에 계산한 프롬프트 Prefix가 캐시에 남아 있으면 해당 KV 행을 재사용합니다. 기본 활성화되어 있습니다.",
        "Both servers reuse the cache rows of a prompt prefix they computed before, as long as the cache holds them; the setting is on by default."
      ],
      [
        "list",
        [
          [
            "vLLM: `--no-enable-prefix-caching`으로 비활성화하고, `--enable-prompt-tokens-details`로 재사용 토큰 수를 `usage.prompt_tokens_details.cached_tokens`에서 확인할 수 있습니다.",
            "--no-enable-prefix-caching turns it off. With --enable-prompt-tokens-details, a response reports reused tokens in usage.prompt_tokens_details.cached_tokens."
          ],
          [
            "SGLang: `--disable-radix-cache`로 비활성화하며, `/generate` 응답의 `meta_info.cached_tokens`에서 재사용 토큰 수를 확인할 수 있습니다.",
            "--disable-radix-cache turns it off. A /generate response reports the reused tokens in meta_info.cached_tokens."
          ]
        ]
      ],
      [
        "h2",
        "KV 캐시를 호스트 메모리로 오프로딩",
        "Offload the KV cache to host memory"
      ],
      [
        "p",
        "계산했던 프롬프트의 KV 블록을 호스트 RAM 계층으로 복사해 두었다가, 동일 프리픽스를 가진 요청이 오고 장치 캐시에서 이미 제거된 경우 다시 복사합니다. 이렇게 하면 재계산을 줄일 수 있습니다.",
        "Both servers copy the cache blocks of computed prompts to a tier of host memory, and copy them back into the device cache when a later prompt shares a prefix whose blocks the device has evicted, instead of computing it again."
      ],
      [
        "code",
        "bash · vLLM",
        "vllm serve Qwen/Qwen3-0.6B --kv-offloading-size 16"
      ],
      [
        "p",
        "`--kv-offloading-size 16`은 **호스트 측 오프로딩 계층 16GiB**를 뜻합니다. NPU의 KV Cache 풀을 16GiB로 지정하는 옵션이 아닙니다. vLLM 스케줄러가 보관·복구·제거 결정을 맡고, 전송은 `RNGDOffloadingConnector`를 사용합니다.",
        "--kv-offloading-size sets the host tier in GiB, as on a GPU. The platform serves it through the plugin's RNGDOffloadingConnector instead of vLLM's OffloadingConnector."
      ],
      [
        "p",
        "추가 CPU 오프로딩 옵션(`blocks_per_chunk`, `eviction_policy` 등)은 `--kv-transfer-config`의 `kv_connector_extra_config`로 전달할 수 있습니다. `vllm:kv_offload_store_bytes`, `vllm:kv_offload_load_bytes` 메트릭으로 전송량을 측정합니다.",
        "Options of vLLM's CPU offloading, such as blocks_per_chunk and eviction_policy, go in --kv-transfer-config ... The metrics count the bytes moved each way."
      ],
      [
        "code",
        "bash · SGLang",
        "python -m sglang.launch_server --model-path Qwen/Qwen3-1.7B --enable-hierarchical-cache --hicache-ratio 2"
      ],
      [
        "p",
        "SGLang에서는 `--hicache-ratio`로 장치 KV 캐시 대비 호스트 캐시의 배수를, `--hicache-size`로 호스트 계층 크기(GB)를 지정할 수 있습니다. 둘 중 하나가 필요합니다.",
        "--hicache-ratio sizes the host tier as a multiple of the device cache, --hicache-size in GB; one of them is required."
      ],
      [
        "p",
        "오프로딩과 수면 모드(vLLM), 메모리 절약 모드(SGLang)는 같은 캐시 저장소의 생명주기를 변경하므로 동시에 사용하도록 허용하지 않습니다. Recurrent State 모델에서는 오프로딩이 거부됩니다.",
        "The memory saver frees the cache storage the host tier copies, so startup refuses it beside hierarchical cache. Only the attention cache moves."
      ],
      [
        "h2",
        "긴 컨텍스트 제공",
        "Serve long contexts"
      ],
      [
        "p",
        "서버가 받는 요청 길이는 **컴파일된 컨텍스트 창**을 넘을 수 없습니다. 별도 옵션이 없으면 체크포인트 설정의 길이를 사용합니다.",
        "A request may hold as many tokens as the checkpoint serves, up to the model's compiled context window."
      ],
      [
        "p",
        "컨텍스트가 컴파일 한도를 초과하면 vLLM은 `--max-model-len`, SGLang은 `--context-length`를 줄이도록 안내합니다. vLLM에서 요청 하나의 최대 길이가 KV 용량에 들어가지 않으면 `--max-model-len -1`로 적재 가능한 최장 길이를 선택할 수 있습니다.",
        "With vLLM, the KV cache of one full-length request does not fit in device memory; pass --max-model-len -1 to take the longest length that fits."
      ],
      [
        "h2",
        "LoRA 어댑터 서빙",
        "Serve LoRA adapters"
      ],
      [
        "p",
        "원문 기준 vLLM에서는 Qwen3-0.6B의 일부 Attention/MLP Projection을 대상으로 PEFT 형식의 LoRA 어댑터를 적용할 수 있습니다. Rank는 최대 32, 한 스텝에서 사용하는 어댑터는 최대 2개입니다. 다른 아키텍처 전반에 대한 범용 지원을 뜻하지 않습니다.",
        "With vLLM, each request may name a LoRA adapter ... up to rank 32, at most two adapters a step."
      ],
      [
        "code",
        "python",
        "from vllm import LLM, SamplingParams\nfrom vllm.lora.request import LoRARequest\n\nllm = LLM(\"Qwen/Qwen3-0.6B\", enable_lora=True, max_loras=2, max_lora_rank=32)\nsky = LoRARequest(\"sky\", 1, \"/path/to/adapter\")\noutputs = llm.generate([\"Why is the sky blue?\"], SamplingParams(temperature=0), lora_request=sky)"
      ],
      [
        "p",
        "로드된 어댑터는 장치에 상주하며 KV Cache가 남긴 메모리 여유 영역을 사용합니다. LoRA의 가중치는 `adapter_config.json`과 `adapter_model.safetensors`로 구성됩니다.",
        "A loaded adapter stays on the device, out of the memory the KV cache leaves free. The adapter directory holds adapter_config.json and adapter_model.safetensors."
      ],
      [
        "note",
        "**KV 풀 관찰 팁:** 이 문서의 오프로딩 옵션은 모두 호스트 계층을 제어합니다. 자체 엔진 API에서 `Cache`를 만들 때 지정하는 블록 수와는 별개입니다. [[Python 엔진 사용|engine/python]]과 [[프레임워크 통합|engine/frameworks]]의 캐시 소유권 설명을 함께 보세요.",
        "The framework owns request lifetimes and block assignments; the engine owns the cache's device storage."
      ],
      [
        "h2",
        "원문에서 더 확인할 항목",
        "Remaining sections in the source"
      ],
      [
        "p",
        "임베딩·도구 호출·Speculative Decoding·Sleep·BF16 양자화·로터리 스케일링·Data Parallel·메트릭·배치 불변성·인코더 단독 실행·미지원 기능 상세 표는 아직 번역하지 않았습니다. 페이지 상단의 원문 링크에서 확인할 수 있습니다.",
        "The original Serving page includes sections outside this excerpt."
      ]
    ]
  },
  "serving/vllm": {
    "title": "vLLM 플러그인 옵션",
    "blocks": [
      [
        "p",
        "이 문서는 `furiosa-opt-vllm` 플러그인이 검사하거나 재정의하는 vLLM 옵션을 설명합니다. 여기에 없는 옵션은 기본 vLLM 동작을 따릅니다. [[서빙|serving/index]]과 [[프레임워크 연동|engine/frameworks]]도 참고하세요.",
        "This page lists the vLLM options the plugin overrides or checks; other options keep vLLM's behavior."
      ],
      [
        "h2",
        "지원하는 옵션",
        "Options"
      ],
      [
        "table",
        [
          "옵션",
          "허용되는 값·동작"
        ],
        [
          [
            "`--dtype`",
            "`auto`(BF16 체크포인트), `bfloat16`"
          ],
          [
            "`--block-size`",
            "컴파일된 모델의 KV 캐시 블록 크기와 일치해야 함. 잘못되면 기대값을 알림"
          ],
          [
            "`--max-model-len`",
            "컴파일된 디코더의 컨텍스트 창 이내"
          ],
          [
            "`--kv-cache-dtype`",
            "`auto`, `bfloat16`. 문서 시점의 FP8 KV 캐시는 미지원"
          ],
          [
            "`--tensor-parallel-size`",
            "1 또는 해당 모델이 칩으로 분할되도록 컴파일된 수"
          ],
          [
            "`--convert classify`",
            "Score Head 체크포인트 또는 `classifier_from_token`"
          ],
          [
            "`head_dtype` (`--hf-overrides`)",
            "Score Head에서 `float32`"
          ],
          [
            "`rope_parameters`, `max_position_embeddings`",
            "엔진이 지원하는 RoPE 유형과 컴파일된 컨텍스트 범위"
          ],
          [
            "데이터·프리필·디코드 컨텍스트 병렬 수, `--nnodes`",
            "모두 1"
          ],
          [
            "`--logits-processors`",
            "`VLLM_USE_V2_MODEL_RUNNER=0`의 vLLM V1 인터페이스 처리기"
          ],
          [
            "`VLLM_BATCH_INVARIANT`",
            "`0` 또는 `1`(배치와 독립적 결과를 보존하도록 모델 적재)"
          ],
          [
            "`--ec-transfer-config`",
            "지원되는 Encoder-only `ECExampleConnector` 구성"
          ],
          [
            "`--kv-offloading-size`",
            "호스트 KV 캐시 용량. 제약: TP/PP/DP=1, Sleep 모드 미사용, Recurrent/Encoder 메모리 없는 모델 등"
          ]
        ]
      ],
      [
        "note",
        "`--kv-offloading-size`는 **호스트 오프로딩 용량**이고, `--max-model-len`은 최대 요청 길이입니다. 둘 중 어느 것도 이 플러그인의 NPU KV Cache 물리 풀 크기를 직접 지정한다는 뜻은 아닙니다.",
        "--kv-offloading-size: Native offloading through RNGDOffloadingConnector ... --max-model-len: At most the decoder's compiled window."
      ],
      [
        "h2",
        "현재 거부하는 설정",
        "These features are not supported yet"
      ],
      [
        "list",
        [
          [
            "동적 KV 스케일 및 레이어별 혼합 KV dtype(`kv_cache_dtype_skip_layers`).",
            "Dynamic KV scales and mixed layer KV dtypes."
          ],
          [
            "LoRA 제한 초과: Qwen3-8B 등 미지원 모델, Online Quantization과 동시 사용, Rank 32 초과, 최대 어댑터 2개 초과, 제한된 모듈 선택, BF16이 아닌 LoRA dtype, `--fully-sharded-loras`, Vision Tower·Expert·분류 Head LoRA, `adapter_model.bin`만 있는 어댑터.",
            "LoRA settings past the engine's adapter terms: ... rank above 32, max_loras above 2, unsupported module targets, unsupported dtype and saved adapter_model.bin."
          ],
          [
            "지원 범위 외 Speculative Decoding 방식 및 복합 Draft 설정, Recurrent 모델의 Speculation, `rejection_sample_method`의 비표준 값.",
            "Speculative decoding with a method other than ngram, suffix or draft_model ... with a recurrent model."
          ],
          [
            "Expert Parallelism.",
            "Expert parallelism."
          ],
          [
            "`RNGDOffloadingConnector` 이외의 KV Connector, 지원되지 않는 Encoder Connector, 호스트 가중치 오프로딩(`--cpu-offload-gb`, `--offload-group-size`).",
            "KV connectors other than RNGDOffloadingConnector ... and weight offloading to the host."
          ],
          [
            "LMCache KV Offloading, 단순 CPU Connector, 비표준 오프로딩 Spec/Layout, `kv_load_failure_policy=recompute`, 여러 칩이나 DP 복제본 간 KV 오프로딩 및 Sleep 모드 병행.",
            "KV offloading through LMCache, the simple CPU connector ... or over several chips or replicas, or with sleep mode."
          ],
          [
            "원문이 허용하지 않은 체크포인트 적재 양자화 조합. BF16 체크포인트의 Online 방식은 `fp8_per_tensor` 경로만 허용.",
            "Quantizing at load: a BF16 checkpoint takes only fp8_per_tensor ... other methods refused."
          ],
          [
            "`--prefix-match-unit`와 Mamba `align` 조합: 이 플러그인은 캐시 블록 복사를 제공하지 않습니다.",
            "--prefix-match-unit for a hybrid model with --mamba-cache-mode align."
          ]
        ]
      ],
      [
        "p",
        "Watermarking과 요청된 프롬프트 토큰 점수 계산은 지원한다고 명시되어 있습니다. 단, 기능 지원은 사용 중인 모델/플러그인 버전의 실제 동작을 확인해야 합니다.",
        "Watermarking and requested prompt-token scoring are supported."
      ]
    ]
  },
  "serving/sglang": {
    "title": "SGLang 플러그인 옵션",
    "blocks": [
      [
        "p",
        "`furiosa-opt-sglang`이 검사하거나 재정의하는 설정을 다룹니다. 표에 없는 옵션은 기본 SGLang 동작을 유지합니다.",
        "This page lists the SGLang options the plugin overrides or checks; other options keep SGLang's behavior."
      ],
      [
        "h2",
        "지원하는 설정",
        "Options"
      ],
      [
        "table",
        [
          "옵션",
          "허용되는 값·동작"
        ],
        [
          [
            "`--kv-cache-dtype`",
            "`auto`, `bf16`, `bfloat16`. 모델이 지원하지 않는 타입은 거부하며 FP8 캐시 미지원"
          ],
          [
            "`--dtype`",
            "`auto`, `bfloat16`"
          ],
          [
            "`--load-format`",
            "`auto`, `safetensors`"
          ],
          [
            "`--device`",
            "미설정 또는 `cpu` (프레임워크 텐서는 호스트에, 연산은 RNGD에)"
          ],
          [
            "`--attention-backend` 외 Attention Backend",
            "미설정 또는 `torch_native`; Attention 계산은 엔진 담당"
          ],
          [
            "`startup_weight_load_mode`",
            "`serial`"
          ],
          [
            "`disaggregation_mode`",
            "`null`"
          ],
          [
            "Attention DP·Expert·Context Parallel, `nnodes`",
            "모두 1"
          ],
          [
            "`--tp-size`",
            "컴파일된 모델의 칩 수. Scheduler 1개가 칩 전체를 구동"
          ],
          [
            "`--dp-size`",
            "원칙적으로 임의의 값; Speculative Decoding에서는 1"
          ],
          [
            "`--gpu-id-step`",
            "미설정. 복제본 배치는 TP 차수에 따라 플랫폼이 계산"
          ],
          [
            "`--context-length`",
            "컴파일된 컨텍스트 창 이내"
          ],
          [
            "RoPE 관련 `--json-model-override-args`",
            "지원하는 RoPE 종류와 컴파일 범위 이내"
          ],
          [
            "`--mem-fraction-static`",
            "미설정 시 기본 0.9. 모델의 칩 간 분할에 필요한 여유 메모리를 남김"
          ],
          [
            "`--enable-deterministic-inference`",
            "미사용 또는 배치 독립 실행 모드로 사용(래딕스 캐시 유지)"
          ],
          [
            "`--enable-hierarchical-cache`",
            "Recurrent State 없는 모델에서 호스트 계층 크기 `--hicache-ratio` 또는 `--hicache-size` 지정 등 제약 준수"
          ]
        ]
      ],
      [
        "note",
        "중요: `--mem-fraction-static`은 원문에 **0.9 기본값**으로 명시된 정적 메모리 비율 설정입니다. NPU KV 풀을 줄일 때 관련 있을 수 있지만, 실제 블록 수·메모리 할당식은 플러그인 구현/실측을 확인해야 합니다. 이를 곧바로 Furiosa-LLM의 메모리 옵션이라고 혼동하지 마세요.",
        "--mem-fraction-static: Unset defaults to 0.9, leaving the headroom a model split over chips needs."
      ],
      [
        "h2",
        "현재 거부하는 설정",
        "Not supported yet"
      ],
      [
        "list",
        [
          [
            "LoRA 및 NGRAM·STANDALONE을 제외한 Speculative 알고리즘.",
            "LoRA and speculative algorithms other than NGRAM and STANDALONE."
          ],
          [
            "위치당 후보 2개 이상의 Speculation, Adaptive Speculation, 외부 N-gram 코퍼스.",
            "Speculative decoding with more than one candidate a position, adaptive speculation or an external n-gram corpus."
          ],
          [
            "Watermarking과 Strict Thinking처럼 단계별 점수에 영향을 주는 옵션.",
            "Watermarking and strict thinking, which change the scores of each step."
          ],
          [
            "양자화 및 양자화 파라미터 파일.",
            "Quantization and quantization parameter files."
          ],
          [
            "계층형 캐시 외부 Storage Backend, HiSparse, Unified Memory, LMCache, FlexKV, 외부 Unified Cache Linker.",
            "Hierarchical cache storage backends, HiSparse, unified memory, LMCache, FlexKV and the unified cache external linker."
          ],
          [
            "Speculative Decoding·Hierarchical Cache와 동시에 사용되는 Memory Saver.",
            "The memory saver with speculative decoding and with the hierarchical cache."
          ],
          [
            "Per-layer Embedding Offload, Hidden State 반환, Routed Expert 반환, Indexer Top-k.",
            "Per-layer embedding offload, returning hidden states, routed experts or indexer top-k."
          ],
          [
            "Diffusion LLM 알고리즘과 `prefill_only_disable_kv_cache`.",
            "Diffusion LM algorithms and prefill_only_disable_kv_cache."
          ],
          [
            "인코더 분리(`--encoder-only`, `--language-only`).",
            "Encoder disaggregation."
          ]
        ]
      ],
      [
        "p",
        "플러그인은 CUDA Graph과 Piecewise CUDA Graph을 비활성화하고, 모델 유형별로 페이지 크기·Overlap Scheduling·혼합 청크 사용 여부를 설정합니다.",
        "The platform disables CUDA graphs and piecewise CUDA graphs, and sets the scheduling options by model kind."
      ],
      [
        "table",
        [
          "모델 유형",
          "페이지 크기",
          "Overlap",
          "Mixed Chunk"
        ],
        [
          [
            "비순환 생성 모델",
            "16",
            "사용(비활성화 가능)",
            "사용"
          ],
          [
            "Recurrent State 생성 모델",
            "1",
            "사용 안 함",
            "사용 안 함"
          ],
          [
            "임베딩",
            "16",
            "사용 안 함",
            "사용 안 함"
          ],
          [
            "Speculative Decoding",
            "16",
            "사용 안 함",
            "사용 안 함"
          ]
        ]
      ],
      [
        "p",
        "Recurrent State 모델에서는 `mamba_ssm_dtype`을 비우거나 `float32`로, `mamba_radix_cache_strategy`를 `auto` 또는 `no_buffer`로 설정해야 합니다. INT8 Mamba 체크포인트, Linear Replay SSM 등의 일부 기능은 아직 지원되지 않습니다.",
        "A model that keeps recurrent state also requires mamba_ssm_dtype unset or float32 and mamba_radix_cache_strategy auto or no_buffer."
      ],
      [
        "h2",
        "Speculative Decoding",
        "Speculative decoding"
      ],
      [
        "p",
        "플러그인은 NGRAM 또는 별도 Draft 모델을 사용한 **한 줄의 Draft 토큰 시퀀스**를 검증합니다.",
        "The plugin verifies one chain of drafts a request on a causal attention language model."
      ],
      [
        "code",
        "bash",
        "python -m sglang.launch_server --model-path Qwen/Qwen3-1.7B \\\n  --speculative-algorithm NGRAM --speculative-ngram-max-bfs-breadth 1\npython -m sglang.launch_server --model-path Qwen/Qwen3-1.7B \\\n  --speculative-algorithm STANDALONE --speculative-draft-model-path Qwen/Qwen3-0.6B"
      ],
      [
        "p",
        "STANDALONE Draft 모델은 Target 모델과 같은 칩에 올라가 메모리를 공유합니다. 두 모델은 Token-ID 매핑, Vocabulary, KV 블록 크기가 일치해야 하며 Draft의 컨텍스트 창도 충분해야 합니다.",
        "A STANDALONE draft model loads on the target's chips and shares their memory; it must share the target's token-to-id mapping, vocabulary and cache block size."
      ],
      [
        "h2",
        "요청 제한",
        "Requests"
      ],
      [
        "p",
        "디코더 호출은 토큰 ID를 받아 각 행의 Greedy 토큰을 반환하고, Vocabulary Logits는 반환하지 않습니다. 아래 기능을 요청하면 스케줄러 처리 전에 이유와 함께 HTTP 400으로 거부합니다.",
        "A decoder call takes token IDs and returns each row's greedy token, without the scores of the vocabulary."
      ],
      [
        "list",
        [
          [
            "Greedy가 아닌 샘플링(`temperature` 0 또는 `top_k` 1 외), Penalty, `min_new_tokens`, `logit_bias`, Grammar/JSON Schema/EBNF/Structural Tag, Beam Search, Watermark, Logprobs, Sampling Mask, 사용자 Logit Processor.",
            "Sampling other than greedy decoding, penalties, min_new_tokens, logit_bias, grammars, beam search, watermarks, logprobs, sampling masks and custom logits processor."
          ],
          [
            "토큰 ID 대신 입력 임베딩 또는 임베딩 오버라이드.",
            "Input embeddings and embedding overrides in place of token IDs."
          ],
          [
            "이미지·영상·음성 입력.",
            "Images, video and audio."
          ]
        ]
      ]
    ]
  }
};
