# Say it. 英文语音转文字 Demo

纯静态网页，英文语音 → 英文文字。四种配置均在独立 Worker 中使用单线程 CPU WASM 本地识别；只加载当前选中的模型，切换会终止前一个 Worker。无需 API Key、后端或运行时访问 Hugging Face / CDN，可部署到 GitHub Pages。

## 切换对比

| 页面选项 | 首次完整加载 | 输入方式 |
| --- | --- | --- |
| sherpa-onnx · Zipformer | 约 87.5 MB | 原生流式，单次最多 60 秒 |
| Transformers.js · Whisper tiny.en q8 | 约 67.6 MB | 短句分段，单次最多 20 秒 |
| Transformers.js · Whisper base.en q8 | 约 103.7 MB | 短句分段，单次最多 20 秒 |
| whisper.cpp · base.en Q5_1 | 约 60.8 MB | 短句分段，支持 initial_prompt，单次最多 20 秒 |

“首次完整加载”包括模型、分词配置和运行库；tiny.en 与 base.en q8 共用 Transformers.js / ONNX Runtime，因此加载过一个后再切换，实际网络下载可能更少。四项的权重和运行库都已包含在目录中。

先分别点击“用示例音频自检”，再用麦克风说同一句 5～10 秒的英语。SIDE BY SIDE 保留当前页面内每项的最近结果和计算时间。Whisper 约每收到 3 秒新音频重算当前短句，停顿约 1.6 秒或点击完成后定稿；识别较慢时，更新会延后。四个选项的模型、量化及解码方式不同，结果不能单独归因于运行库。

示例自检使用同一个 6.105 秒合成英语文件。带 `*` 的首字时间是批量自检时间，不是实际说话时的交互延迟。麦克风模式的 Whisper 计算比包含临时结果重算。对比时保留原始输出，不会按练习句自动改写。

## initial_prompt

选择 **whisper.cpp · base.en Q5_1** 后，填写可选输入框，例如：

```text
Vocabulary: photosynthesis, chlorophyll, mitochondria.
```

- 默认留空；点击“开始录音”或“用示例音频自检”时，将当时内容固定为这一轮的提示。处理期间输入框禁用，下一轮可修改，无需重新加载模型。
- 提示以 UTF-8 传入 C++ `whisper_full_params.initial_prompt`，每次重算或定稿都使用本轮提示；各轮不会继承上一轮 Whisper 文本上下文。
- 页面最多 2000 字符，模型还会按自身的 token 上限截取。提示词是上下文引导，可能影响识别，不保证热词一定出现，也不提供发音评分。
- 提示不会直接拼接到识别结果。若模型因提示而输出未说出的内容，页面仍保留原始转写。对照卡标记“已用 prompt”，导出数据包含本轮提示和原生接口确认收到的 `appliedPrompt`，便于区分有无提示的测试。
- 此输入框仅作用于 whisper.cpp；另三个选项不使用该提示，也不自动使用页面的练习句。

## 部署到 GitHub Pages

1. 将**本目录内的全部文件及文件夹**放在 GitHub 仓库根目录，确保 `index.html` 在根目录；保留所有 `vendor/` 子目录和 `.data` 分片。
2. 在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**，推送到 `main`；已包含 `.github/workflows/pages.yml`。也可在 Actions 手动运行部署工作流。
3. 或选择 **Deploy from a branch → main → /(root)**，无需构建，根目录包含 `.nojekyll`。两种发布方式选一种。
4. 用 Safari 打开 Pages 提供的 HTTPS 地址。仓库名称和子路径无需写入代码。

每个发布文件低于 GitHub 网页上传的 25 MiB 限制；模型权重按不超过 20 MB 的分片存放。不要改成 Git LFS 指针文件。更新时提交全部新增文件，尤其是两个新 manifest、`whisper-session.js`、`whisper-cpp-worker.js`、`vendor/whisper/models/whisper-base.en/` 和 `vendor/whisper-cpp/`。不要仅更新页面。

whisper.cpp 是定制的 **SIMD 单线程构建，不使用 pthreads / SharedArrayBuffer**；与另外三个选项一样，无需 COOP/COEP 响应头。录音、模型和提示词均只在当前设备处理，不会上传。

## 在 iPad Air 3 上测试

1. 保持 Safari 页面在前台，首次连接 Wi-Fi。先运行示例自检，无需麦克风权限。
2. 清空结果，再点击“开始录音”，允许麦克风。先试 5～10 秒短句，点击“完成录音”。
3. 依次切换模型，观察文字、首个结果、待处理音频和设备发热。切换需要重新初始化所选模型；已有文本和对照结果保留在当前页面内。
4. whisper.cpp 先测试空提示，再填写少量课内词汇，对照识别变化。不要直接填入整段标准答案来评估学习者的真实转写。
5. 展开“设备与运行日志”，可导出 JSON，包括各项结果、提示词、性能和浏览器信息，不包含录音，不会自动发送。

当前验证环境是 Windows 桌面 Chrome，**没有在 iPad Air 3 / Safari 实机测量速度、峰值内存或稳定性**。合成示例不能代表学生口音、儿童声音、真实环境识别率或发音准确度。

本次桌面测试中，6.105 秒示例在 Transformers.js base.en q8 上约需 4.2 秒计算，在这个 whisper.cpp Q5_1 单线程构建上约需 51.9 秒。Q5_1 下载更小，但当前构建识别明显更慢；建议 Air 3 先测试 base.en q8，再对照 Q5_1。详见 `VALIDATION.md`，这些数字不代表两种运行库在所有构建和设备上的表现。

## 指标与缓存

- 模型准备：下载、初始化和预热时间。
- 首个文字：麦克风模式从采集开始到首个非空结果的墙钟时间，包含开口前等待；自检带 `*`。
- 识别计算 / 音频时长：Worker 内处理计算量除以输入时长，不含模型下载。Whisper 包含重复重算的成本。
- 待处理音频：已发送时长减去已分析时长。Zipformer 积压超过 5 秒、Whisper 超过 12 秒，会自动结束采集后处理剩余音频；单次时长限制同样会结束采集。
- WASM 内存：Zipformer 和 whisper.cpp 显示线性内存容量，包含预留和增长的空间，**不是整页真实占用或物理内存峰值**。Transformers.js 未公开同等指标，显示“未公开”。Q5_1 文件较小不意味着整页内存按同样比例减少。
- 模型只从本站按需加载，并通过 Service Worker 缓存。首次在线完成所选配置的加载和缓存后，可离线使用；Safari 仍可能清理网站存储。页面缓存提示针对当前选项。
- 录音、识别和加载期间切换按钮禁用。切到后台或锁屏会结束当前录音；返回后可重新开始。

## 固定版本与资源

- sherpa-onnx `v1.13.7`；英语流式 Zipformer `2023-06-26`，chunk 16 / left 128，编码器 INT8，解码器与 joiner FP32。
- Transformers.js `3.8.1` / ONNX Runtime Web `1.22.0-dev.20250409-89f8206ba4`，`device:'wasm'`、`dtype:'q8'`、`numThreads:1`、`proxy:false`。不启用 WebGPU；运行库文件名中的 `threaded` 不代表本 Demo 启用多线程。
- tiny.en ONNX 固定修订：`2575352d61be1bf7225cf8f8b268a4678025fc58`。
- base.en ONNX 固定修订：`51eefc0af78b103839eda9e7e4f4186acc6517fe`，原始 q8 编码器与合并解码器共 76,894,123 字节，权重未修改。
- whisper.cpp `v1.8.2` / Emscripten `3.1.74`，自定义单线程 SIMD C++ bridge。Q5_1 模型固定修订：`5359861c739e955e79d9a303bcbc70fb988958b1`，原始文件 59,721,011 字节，SHA-256 为 `4baf70dd0d7c4247ba2b81fafd9c01005ac77c2f9ef064e00dcf195d0e2fdd2f`。
- `asset-manifest.json`、`whisper-manifest.json`、`whisper-base-manifest.json` 和 `whisper-cpp-manifest.json` 记录资源、来源、字节数、哈希及重组映射；许可证见 `NOTICE.md` 和各 vendor 目录。

## 本机预览与校验

需要已有 Node.js；部署本身不需要 Node.js。在项目目录运行：

```powershell
node tools/verify-assets.cjs
node tools/serve.cjs
```

电脑预览地址：`http://127.0.0.1:8844/english-speech-demo/`。iPad 无法通过自身的 `127.0.0.1` 访问电脑；普通局域网 HTTP 不满足录音所需的 HTTPS 条件，请用 GitHub Pages HTTPS 地址测试。

## 重建 whisper.cpp（仅开发时需要）

发布目录已包含生成的 `.mjs` / `.wasm`，普通部署不需要编译。重建需要 Emscripten 3.1.74、CMake、Ninja 和 whisper.cpp v1.8.2 源码；启用 emsdk 环境后运行：

```text
node tools/configure-whisper-cpp.cjs <whisper.cpp-v1.8.2-source-directory>
emcmake cmake -S <source> -B <build> -G Ninja -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_EXAMPLES=OFF -DWHISPER_BUILD_SERVER=OFF -DGGML_OPENMP=OFF -DGGML_NATIVE=OFF -DGGML_LLAMAFILE=OFF -DGGML_BACKEND_DL=OFF -DGGML_CCACHE=OFF
cmake --build <build> --target sayit
```

配置工具仅修改指定的上游源码目录，关闭强制 pthread 标志、启用 SIMD 并加入 `tools/whisper-cpp-bridge.cpp` 目标。生成的 `bin/whisper-cpp.mjs` 与 `.wasm` 对应 `vendor/whisper-cpp/`；替换后须重新计算 manifest 中大小和 SHA-256，再重新验证。使用其他构建或模型时同样要更新清单和缓存版本号。

## 排错

- 404 或资源不完整：检查是否上传全部新增文件和模型分片，Pages 发布源是否正确，工作流是否成功。
- 更新后仍显示旧版：本版页脚为 `v1.2.0`。刷新并等待新 Service Worker 接管；必要时在 Safari 网站数据中清理本站缓存后重试。
- 页面因内存关闭：关闭其他标签页，重开后先测试 tiny.en，缩短录音；以 Air 3 真机结果为准。
- 麦克风权限拒绝：在 Safari 网站设置中允许麦克风后再试，不要用 `file://` 打开。
- 离线加载失败：首次在线加载并确认当前选项已缓存；存储空间不足或系统清理可导致缓存丢失。
