# Verification record

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
