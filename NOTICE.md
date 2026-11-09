# Third-party notices

This static demo includes the following open-source assets. The upstream notices and licenses remain applicable to those assets.

- **sherpa-onnx v1.13.7** — Copyright Xiaomi Corporation and contributors; Apache License 2.0. Source: https://github.com/k2-fsa/sherpa-onnx/tree/v1.13.7 . License: `vendor/LICENSE-sherpa-onnx`.
- **English streaming Zipformer model (2023-06-26)** — Apache License 2.0, as declared in the model repository. Export by Fangjun Kuang / k2-fsa; original training model by Zengwei Yao and icefall contributors. Sources and the exact model revision are recorded in `asset-manifest.json`; upstream model information is preserved in `vendor/MODEL-README.md`. License text: `vendor/LICENSE-sherpa-onnx`.
- **ONNX Runtime**, embedded in the upstream WASM binary — Microsoft Corporation, MIT License. See `vendor/LICENSE-onnxruntime` and `vendor/ThirdPartyNotices-onnxruntime.txt` for its bundled third-party notices.
- **Emscripten-generated runtime glue** — MIT License and University of Illinois/NCSA Open Source License, per upstream Emscripten licensing. See `vendor/LICENSE-emscripten`.

The upstream WASM binary and the version-matched `sherpa-onnx-asr.js` are unmodified. The generated loader's package metadata is changed to point to the bundled English model files and their offsets. The concatenated package is distributed as four smaller `.data` shards and assembled in the Worker before initializing the runtime. No neural-network weights are edited.

The self-check audio was generated locally with Microsoft Zira Desktop and the following authored text: “I would like to practice my English today. Could you help me find the library?” It contains no recorded user speech and is intended for functional testing, not speech-recognition accuracy claims.

## Additional comparison engine (v1.1.0)

- **Transformers.js 3.8.1** — Hugging Face and contributors, Apache License 2.0; bundled unmodified browser distribution, including its Jinja implementation. License: `vendor/whisper/LICENSE-transformers`. Source: https://github.com/huggingface/transformers.js/tree/3.8.1 .
- **Whisper tiny.en** — OpenAI Whisper, MIT License; ONNX conversion and quantization distributed by ONNX Community / Xenova. Upstream model information is retained at `vendor/whisper/models/whisper-tiny.en/README.md`, the original Whisper license at `vendor/whisper/LICENSE-whisper`, and the exact conversion revision in `whisper-manifest.json`. The q8 ONNX weights are unchanged. Decoder bytes are split for distribution and reassembled through the library's documented custom cache interface.
- **ONNX Runtime Web 1.22.0 development build** — Microsoft Corporation, MIT License. The exact runtime dependency is pinned by Transformers.js 3.8.1. See `vendor/whisper/LICENSE-onnxruntime` and `vendor/whisper/ThirdPartyNotices-onnxruntime.txt` for the v1.22 license and third-party notices.

The comparison engine does not use a remote inference provider. The included tokenizer, configuration, JavaScript, WASM and ONNX resources are loaded from the same static site.
