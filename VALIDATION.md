# Verification record

## Browser speech option, v1.3.0 (2026-11-09)

Verified in desktop Chrome on Windows. **No iPhone/iPad Safari, Android Chrome, or Android Edge device was available.** User-Agent changes below are branch/layout checks, not real mobile-browser execution or speech-service availability proof.

Passed with controlled Web Speech API events:

- Both standard `SpeechRecognition` and prefixed `webkitSpeechRecognition` constructor paths; no user-agent block for Android Edge.
- Synchronous start inside a real click with user activation; en-US, continuous=false, interimResults=true. Native mode creates no extra getUserMedia stream, AudioContext, or inference Worker and downloads no vendor/model assets.
- Interim revisions, multiple final results and repeated final events without duplicated text; automatic end returns to a usable state without a restart loop.
- Repeated rounds preserve text; manual stop accepts a delayed final result; pending permission can be cancelled and a late start is aborted.
- Network, permission, unavailable-service and no-speech handling. A missing end event after an error releases the UI. Provisional text retained at termination is labelled rather than presented as confirmed output.
- Background and pagehide termination, usable state for back-forward cache restoration, native/model switching, per-engine text preservation, conditional privacy text, non-fabricated compute metrics, and exported API/error/end metadata.
- Startup and stop timeouts release sessions and abort a non-responsive service; the timeout paths were checked using short controlled timers.
- Five-option layout at 834×1112, 1112×834, 820×1180, 390×844 and 360×800 CSS pixels.
- Real Zipformer and Transformers.js tiny.en sample regressions after adding native mode; all existing model bytes/hashes remain unchanged.

Actual desktop Chrome API probe with synthetic fake microphone: the real SpeechRecognition service reached onstart and returned no-speech after about 8 seconds; the page recovered normally. It produced no transcript, so this is a service-start/error-path probe, not an end-to-end native recognition or accuracy pass.

Still requires target-device testing: actual spoken English transcription, Siri/system permission configuration, connectivity, browser-specific service access and interruptions in iPhone/iPad Safari and Android Chrome. Android Edge is explicitly a compatibility attempt pending the same service test. Native processing is browser-managed and may send audio to an online service; offline recognition is not asserted.

## Four configurations, v1.2.0 (2026-11-09)

The following checks passed with actual model inference in Windows desktop Chrome. No iPad Air 3 or Safari performance measurement was performed.

- Full 6.105-second self-check transcription with Zipformer, Transformers.js tiny.en q8, Transformers.js base.en q8, and whisper.cpp base.en Q5_1. All outputs contain the complete spoken content; punctuation/spelling differences remain unedited.
- Only selected model/runtime assets download; switching terminates the previous engine Worker, and all four latest-result cards retain their output.
- Real base.en q8 and Q5_1 microphone API → AudioWorklet → Worker → interim text → finalization. Automated microphone input uses the bundled WAV through Chrome's fake audio device, not personal recordings.
- Final Q5_1 buffering regression uses a real 48 kHz AudioContext and ScriptProcessor fallback: 7.04 seconds of captured input are preserved, including 770,048 PCM bytes held while synchronous inference is busy. Clicking Finish stops microphone tracks promptly, forwards held PCM with the finish request, and returns the complete sentence. Only two inference calls occur, including finalization, instead of replaying multiple stale interim windows.
- `initial_prompt` entered in the page reaches `whisper_full_params.initial_prompt` in the compiled C++ bridge. Different prompts and a blank prompt work in subsequent runs without reloading the model. The native bridge confirms the received string in `appliedPrompt`; prompt text is not appended to output.
- Prompt and engine controls lock during processing. Microphone tracks stop at the end of capture. Exported diagnostics retain all four configurations and the applied prompt.
- Real offline page reload and inference for both new models using cached ESM, WASM, configuration and model shards.
- Q5_1 initialization and inference succeed with `crossOriginIsolated === false` and a non-shared WASM memory buffer. The custom build does not require pthreads, SharedArrayBuffer or isolation response headers.
- No page/console errors or external model/CDN/inference requests in integration testing.
- Four-way controls, comparison cards and prompt input fit 834×1112, 1112×834, 820×1180 and 375×812 CSS viewports. These are layout checks, not Safari device tests.
- All 43 unique runtime/model assets match their manifest byte counts and SHA-256 values; reconstructed model files match the originals. Every distributable asset is below 25 MiB; unique runtime/model resources total about 297.1 MB.

Representative self-check measurements after model preparation in this desktop run:

| Configuration | Compute / 6.105 s input | Compute ratio |
| --- | --- | --- |
| Transformers.js base.en q8 | about 4.2 s | 0.69 |
| whisper.cpp base.en Q5_1, this single-thread build | about 51.9 s | 8.50 |

This Q5_1 build is substantially slower in this test despite its smaller download (60.8 MB versus 103.7 MB cold-load resources). These figures are specific to this build, quantization, input and machine. They are not a universal comparison of the libraries, a real-time guarantee, or an iPad result. The browser page keeps timings visible so users can assess actual device behavior.

The Q5_1 buffering test's final WASM linear memory capacity was 758,120,448 bytes (about 723 MiB). This is the grown linear memory buffer, not physical memory usage or the browser page's peak memory. A smaller model download does not imply low total runtime memory; iPad Safari still requires a device test.

Earlier verification records follow for the original capture and resampling implementation.

Verified locally on 2026-11-09 with desktop Chrome on Windows. This is **not** an iPad Air 3 / iPad Safari performance result.

Passed:

- Real sherpa-onnx WASM initialization, model loading and warm-up.
- Actual inference over the included 6.105-second synthetic English sample. The output covers the whole sentence; the model uses the British spelling `PRACTISE` and tokenization `TO DAY`. The application preserves that raw output.
- Model-provided 16 kHz and 8 kHz speech samples decoded in a browser Worker. These additional test recordings are not distributed with the demo.
- Microphone API → AudioWorklet → Worker → live partial results → final result. For automated verification, Chrome's fake audio device read the included WAV; no personal microphone audio was used.
- Microphone tracks stopped after clicking Complete.
- ScriptProcessor compatibility path with an actual 48 kHz AudioContext and native engine resampling.
- Three repeated self-checks using one initialized model.
- Offline page reload and successful real inference from Service Worker cache.
- Copy result, clear result, change practice prompt, and export diagnostic JSON.
- Simulated denied microphone permission returns to a usable state with a clear error.
- No page/console errors or requests to external model/CDN services during the integration test.
- No horizontal overflow at 834×1112, 1112×834, 820×1180 or 375×812 CSS pixels. These viewport checks are not Safari compatibility tests.
- Bundled runtime/model SHA-256 hashes and byte counts verified. Each distributable model/runtime file is below 25 MiB.

Still requires the user's device test:

- iPad Air 3's installed iPadOS / Safari version, memory limits and sustained transcription speed.
- Real learner accents, children’s voices, pauses, room noise, headphones and device interruptions.
- Whether Safari retains the model cache across subsequent visits and storage pressure.

Use the page's Device Check panel and diagnostic export for those measurements. Do not treat the synthetic sample or desktop compute ratio as an accuracy or latency guarantee.

## Comparison engine, v1.1.0

The following additional checks passed in desktop Chrome. They do not constitute iPad Safari compatibility or performance results.

- Transformers.js 3.8.1 + q8 Whisper tiny.en initialization, warm-up, and real transcription of the complete included sample, including punctuation.
- The default Zipformer selection does not download Whisper model/runtime assets.
- Switching terminates the previous engine Worker; round-trip switching restores each engine's transcript. Switching is disabled during loading, inference self-checks, recording and finalization.
- Both latest-result cards retain the original model output from the same sample and label sample timings separately from live microphone timings.
- Actual getUserMedia + AudioWorklet input, periodic Whisper interim text, finalization and microphone-track cleanup. Automated tests use Chrome's looping fake audio device and the bundled WAV, so repeated phrases in live-test output correspond to repeated input audio.
- Whisper's 48 kHz AudioContext + ScriptProcessor fallback path, including streaming resampling and final output.
- Resampler duration and chunk consistency at 8 / 44.1 / 48 kHz, preservation of a 1 kHz test tone, and attenuation of a 12 kHz tone before 48-to-16 kHz downsampling.
- Offline reload followed by a real Whisper self-check, including local ESM, WASM, tokenizer and split decoder resources.
- Two-engine controls and result cards fit the tested iPad and 375 px phone viewports.
- No page/console errors or external model/CDN requests during the additional integration test.
- SHA-256 verification includes all 23 runtime/model resources across both engines and verifies the reassembled Whisper ONNX bytes. Every deployed file remains below 25 MiB.

Whisper's WASM memory size is not publicly exposed by this runtime, so the UI reports it as unavailable instead of inventing a comparable memory metric.
