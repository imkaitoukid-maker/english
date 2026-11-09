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
