#include "whisper.h"
#include <emscripten/emscripten.h>
#include <string>

// Called synchronously inside a dedicated browser Worker. No C++ worker threads.
static whisper_context * context = nullptr;
static std::string result;
static std::string applied_prompt;

extern "C" {
EMSCRIPTEN_KEEPALIVE int sayit_load(const void * bytes, int length) {
    if (context) whisper_free(context);
    auto params = whisper_context_default_params();
    params.use_gpu = false;
    context = whisper_init_from_buffer_with_params(const_cast<void *>(bytes), length, params);
    return context ? 0 : -1;
}

EMSCRIPTEN_KEEPALIVE int sayit_transcribe(const float * samples, int length, const char * prompt) {
    if (!context) return -1;
    applied_prompt = prompt ? prompt : "";
    result.clear();
    auto params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    params.n_threads = 1;
    params.translate = false;
    params.language = "en";
    params.detect_language = false;
    params.no_context = true;
    params.no_timestamps = true;
    params.print_realtime = false;
    params.print_progress = false;
    params.print_timestamps = false;
    params.print_special = false;
    params.temperature = 0.0f;
    params.temperature_inc = 0.0f;
    params.greedy.best_of = 1;
    // Keep the UTF-8 string alive throughout whisper_full. This is the actual
    // Whisper decoder prompt, not text appended to the recognition result.
    params.initial_prompt = applied_prompt.empty() ? nullptr : applied_prompt.c_str();
    const int status = whisper_full(context, params, samples, length);
    if (status != 0) return status;
    for (int i = 0; i < whisper_full_n_segments(context); ++i) {
        result += whisper_full_get_segment_text(context, i);
    }
    return 0;
}

EMSCRIPTEN_KEEPALIVE const char * sayit_result() { return result.c_str(); }
EMSCRIPTEN_KEEPALIVE const char * sayit_prompt() { return applied_prompt.c_str(); }
EMSCRIPTEN_KEEPALIVE void sayit_free() {
    if (context) whisper_free(context);
    context = nullptr;
}
}
