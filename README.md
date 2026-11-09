# Say it. 英文语音转文字 Demo

纯静态网页：英语语音 → 英语文字。可在同一页面切换 **sherpa-onnx + 流式 Zipformer** 与 **Transformers.js + Whisper tiny.en**，两者均在独立 Worker 中使用单线程 CPU WASM 本地推理。两套模型和运行时都已包含，不需要 API Key、后端、npm 安装或运行时访问 Hugging Face / CDN。

页面有引擎切换、麦克风输入、临时文字、结束定稿、复制、同一段合成语音自检、结果对照卡、离线缓存和测试信息导出。切换会终止上一个引擎的 Worker，不会同时把两套模型放在运行内存中。各自的文字和最近一次结果在当前页面内保留。

## 切换对比

1. 选择 **sherpa-onnx · Zipformer**，点击“用示例音频自检”。第一次会加载约 **87.5 MB**。
2. 选择 **Transformers.js · Whisper tiny.en**，再次点击“用示例音频自检”。第一次会加载约 **67.6 MB**。
3. “SIDE BY SIDE”会同时保留两种引擎对同一段示例的原始文字、首个结果时间和计算比。
4. 再分别测试麦克风。切换前需要完成当前录音；录音、模型加载和自检期间，切换按钮会禁用。

Whisper tiny.en 使用 q8 量化，运行于 Transformers.js **3.8.1**。这是短句分段方案：约每收到 3 秒新音频重算当前短句，停顿约 1.6 秒后尝试定稿，点击完成会重新处理剩余短句。单次最多 **20 秒**。识别本身较慢时，更新间隔会变长；当前短句可能被修订。

Zipformer 保持原来的流式方案，单次最多 **60 秒**。两者都使用相同的麦克风采集设置及示例文件，不把练习提示句喂给模型。

示例自检是批量处理：Whisper 对整段示例做一次识别，Zipformer 按流式帧解码；带 `*` 的首字时间不是实际说话时的交互延迟。Whisper 录音模式会重算临时结果，其计算比包含重复处理成本。请主要用各自的麦克风模式比较使用体验，不要把数字当成统一硬件基准。

## 部署到 GitHub Pages

1. 新建一个 GitHub 仓库，把**本目录内的全部文件及文件夹放在仓库根目录**，确保 `index.html` 在根目录，`vendor/` 内四个 `model-XX.data` 文件都在。
2. 在仓库打开 **Settings → Pages → Build and deployment → Source → GitHub Actions**。
3. 推送到 `main` 分支；已经包含 `.github/workflows/pages.yml`。如果文件先上传了，再开启 Pages，可以在 Actions 中手动运行 **Deploy speech demo to GitHub Pages**。
4. 等待工作流成功，打开 Pages 提供的 HTTPS 地址，例如 `https://你的用户名.github.io/仓库名/`。

如果不想使用工作流，也可以选择 **Deploy from a branch → main → /(root)**；本项目不需要构建，根目录的 `.nojekyll` 已包含。两种发布方式选一种即可。

模型权重已拆成 20 MB 以内的分片，最大的引擎文件约 21.6 MB，所有文件均低于 GitHub 网页上传的 25 MiB 限制。可逐批上传，也可以使用 GitHub Desktop 或 Git。不要把模型改成 Git LFS 指针文件。更新已有仓库时，要连同 **`vendor/whisper/`、`whisper-worker.js` 和 `whisper-manifest.json`** 一起提交；不要只更新页面文件。仓库名称和子路径不需要写进代码。

GitHub 官方说明：[Pages 工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[网页上传 25 MiB / Git 单文件 100 MiB 限制](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)。

## 在 iPad Air 3 上测试

1. 使用 Safari 打开部署后的 **HTTPS** 地址，保持页面在前台，首次使用建议连接 Wi-Fi。
2. 点击“用示例音频自检”。它会加载模型并处理一段 6.1 秒的合成英语，无需麦克风权限。可以对照“示例原文”观察结果。
3. 点击“清空”，再点击“开始录音”，允许麦克风。先试一句 5～10 秒的英语，再点“完成录音”。
4. 重复练习多轮，留意页面是否卡顿、首字是否太慢、“待处理音频”是否持续增长，以及设备发热情况。
5. 展开“设备与运行日志”，点击“导出测试信息”。导出的 JSON 包含浏览器信息、性能数字和识别文字，**不包含录音**。文件保存在本机，不会自动发送。

请先保留 Air 3 的当前系统版本进行测试。首发版本未在 iPad Air 3 实机上测量，桌面浏览器的结果不代表 Air 3 速度。

### 这些数字是什么意思

- **模型准备**：包含下载、引擎初始化和预热；缓存后通常会缩短。
- **首个文字**：麦克风模式下，从开始采集到收到首个非空识别结果的墙钟时间；包含用户开口前的等待。示例自检带 `*`，表示批量处理示例时的首个结果时间，两者不能直接比较。
- **识别计算 / 音频时长**：Worker 内音频接收、原生重采样、解码及尾部收尾所耗计算时间除以实际输入时长；不包含模型加载及网络下载。持续输入应低于 1，仍需结合“待处理音频”观察实际体验。
- **待处理音频**：主线程已送出的时长减去已经分析的时长。Zipformer 在持续解码后更新，Whisper 在短句识别完成后更新，因此 Whisper 在两次识别之间自然会积攒几秒。Zipformer 超过 5 秒、Whisper 超过 12 秒时，会自动停止采集并尝试处理剩余音频。
- **WASM 内存**：Zipformer 显示其线性内存容量，初始为 512 MiB；这不是整个 Safari 页面的内存。Transformers.js 所用运行时不公开同等指标，页面明确显示“未公开”，不伪造可比较的内存数字。页面、音频和下载缓存还会占用额外内存，因此旧设备必须真机验收。

此 Demo 用于验证转写，不提供发音评分。示例是 Microsoft Zira 合成英语，不代表学生口音、儿童声音或真实环境识别率。保留各模型原始输出：Zipformer 通常是大写且无标点，Whisper 通常会补充大小写及标点。

## 资源与版本

- sherpa-onnx WASM 运行时：`v1.13.7`，CPU 单线程，不要求 WebGPU、SharedArrayBuffer 或 COOP/COEP 响应头，适合 GitHub Pages 的静态托管方式。
- Transformers.js：`3.8.1`，ONNX Runtime Web `1.22.0-dev.20250409-89f8206ba4`，强制 `device: 'wasm'`、`numThreads: 1`、`proxy: false`。此版本用于 CPU 对照，不启用 WebGPU。其 WASM 文件名带 `threaded`，本 Demo 仍只启用单线程，不启动额外推理线程。
- Whisper 模型：`onnx-community/whisper-tiny.en`，固定修订 `2575352d61be1bf7225cf8f8b268a4678025fc58`；q8 编码器与合并解码器。解码器分片在 Worker 内重组，使用 Transformers.js 的 `customCache` 接口提供给模型加载器。
- 英文模型：`sherpa-onnx-streaming-zipformer-en-2023-06-26`，chunk 16 / left 128；编码器 INT8，解码器和 joiner FP32。
- Zipformer 模型权重约 74.2 MB，引擎和封装约 13.3 MB，首次加载资源合计约 87.5 MB；Whisper 方案首次约 67.6 MB。
- 最初对照过 20M 模型，它在这段短句上出现明显漏词，因此最终包使用上面的模型。资源下载与实际推理仍全部采用本地方案。
- 两套引擎合计部署资源约 **155.1 MB**，但首次加载只下载所选引擎。完整来源、固定模型修订、大小和 SHA-256 分别在 `asset-manifest.json` 与 `whisper-manifest.json`。模型权重未修改；sherpa 的加载器仅调整预加载包信息，Whisper 的运行时保持上游原样。
- 开源许可证与第三方说明见 `vendor/` 和 `NOTICE.md`。

## 本机预览与校验

需要已有 Node.js；部署本身不需要 Node.js。命令在本项目目录运行：

```powershell
node tools/verify-assets.cjs
node tools/serve.cjs
```

然后在这台电脑打开 `http://127.0.0.1:8844/english-speech-demo/`。本机 localhost 可使用麦克风。不能通过 iPad 访问电脑的 `127.0.0.1`；普通局域网 HTTP IP 地址也不具备 HTTPS 的录音权限条件，请在 iPad 上使用 GitHub Pages HTTPS 地址。

## 文件结构

```text
index.html / styles.css       页面和移动端布局
app.js                       页面状态、麦克风与测试信息
capture-worklet.js           麦克风 PCM 采集
recognizer-worker.js          模型加载、单线程推理、流式结果及收尾
whisper-worker.js             Transformers.js 模型加载、短句重算及停顿定稿
audio-utils.js               示例 PCM WAV 解析
sw.js                        同源静态资源缓存
sample.wav                   本地合成英语自检样本
asset-manifest.json          资源大小、SHA-256 和来源
whisper-manifest.json        Whisper 资源与虚拟模型文件映射
vendor/                      运行时、模型分片及许可证
vendor/whisper/              Transformers.js、WASM、Whisper 权重与分词器
tools/                       本机预览和完整性校验
.github/workflows/pages.yml  可选的 Pages 部署工作流
```

## 更新与排错

- 页面首次打开只准备界面，不会申请麦克风或下载大型模型。点击加载或示例自检才开始下载模型。
- 无麦克风权限：在 Safari 的网站设置中允许麦克风，再点开始。不要使用本地 `file://` 地址。
- GitHub Pages 404：确认根目录有 `index.html`，Pages 发布源与所选方式一致，工作流已经成功。
- 资源大小不符：确认没有漏传模型分片、没有上传 Git LFS 指针，或把旧版本文件混在新版本中。
- 页面在后台、锁屏或音频设备断开时会结束录音；返回页面后重新点击开始。麦克风拒绝或初始化失败会给出可重试信息。
- 离线功能需首次在线加载并缓存所有资源。Safari 可能清理网站存储；无痕模式、空间不足或系统清理都会使离线缓存失效。缓存状态见设备信息。
- 更新代码或模型时，同时修改 `app.js`、`sw.js` 的版本号与 `asset-manifest.json` 版本，避免使用旧缓存。首次上线无需修改任何配置。
- 不要把识别结果自动纠正成练习句原文。本 Demo 不把提示句注入模型，保留实际识别结果。
