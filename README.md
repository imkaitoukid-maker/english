# Say it. 英文语音转文字 Demo

纯静态网页：英语语音 → 英语文字。使用 sherpa-onnx、流式英文 Zipformer 和单线程 WASM SIMD，在浏览器独立 Worker 中推理。模型和引擎已包含在本目录，不需要 API Key、后端、npm 安装或运行时访问 Hugging Face。

页面有麦克风输入、实时临时文字、结束定稿、复制、合成语音自检、离线缓存和设备测试信息导出。单次录音最长 60 秒；停顿会分段定稿，麦克风仍继续录音，直到点击完成。

## 部署到 GitHub Pages

1. 新建一个 GitHub 仓库，把**本目录内的全部文件及文件夹放在仓库根目录**，确保 `index.html` 在根目录，`vendor/` 内四个 `model-XX.data` 文件都在。
2. 在仓库打开 **Settings → Pages → Build and deployment → Source → GitHub Actions**。
3. 推送到 `main` 分支；已经包含 `.github/workflows/pages.yml`。如果文件先上传了，再开启 Pages，可以在 Actions 中手动运行 **Deploy speech demo to GitHub Pages**。
4. 等待工作流成功，打开 Pages 提供的 HTTPS 地址，例如 `https://你的用户名.github.io/仓库名/`。

如果不想使用工作流，也可以选择 **Deploy from a branch → main → /(root)**；本项目不需要构建，根目录的 `.nojekyll` 已包含。两种发布方式选一种即可。

所有模型文件已经拆到 20 MB 以内，可通过 GitHub 网页逐批上传，也可以使用 GitHub Desktop 或 Git。不要把模型改成 Git LFS 指针文件。不要只上传 HTML/JS 而遗漏 `vendor/`。仓库名称和子路径不需要写进代码，路径均相对于当前网页。

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
- **待处理音频**：主线程已送出的音频时长减去 Worker 已处理的音频时长；显示更新本身会带来很小的波动。超过 5 秒会自动停止本轮采集并尝试处理剩余音频。
- **WASM 内存**：WASM 线性内存容量，不是整个 Safari 页面的内存。官方运行时初始容量为 512 MiB，页面、音频和模型下载缓存还会占用额外内存；因此旧设备必须真机验收。

此 Demo 用于验证转写，不提供发音评分。示例是 Microsoft Zira 合成英语，不代表学生口音、儿童声音或真实环境识别率。模型通常输出大写英文且不自动补全标点。

## 资源与版本

- sherpa-onnx WASM 运行时：`v1.13.7`，CPU 单线程，不要求 WebGPU、SharedArrayBuffer 或 COOP/COEP 响应头，适合 GitHub Pages 的静态托管方式。
- 英文模型：`sherpa-onnx-streaming-zipformer-en-2023-06-26`，chunk 16 / left 128；编码器 INT8，解码器和 joiner FP32。
- 模型权重约 74.2 MB，引擎和封装约 13.3 MB，首次加载资源合计约 87.5 MB。
- 最初对照过 20M 模型，它在这段短句上出现明显漏词，因此最终包使用上面的模型。资源下载与实际推理仍全部采用本地方案。
- 完整来源、固定模型修订版、各文件大小和 SHA-256 均在 `asset-manifest.json`。模型只重新打包，未修改权重；运行时 JS 只替换了预加载文件偏移和数据长度，WASM 二进制及配套封装保持上游原样。
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
audio-utils.js               示例 PCM WAV 解析
sw.js                        同源静态资源缓存
sample.wav                   本地合成英语自检样本
asset-manifest.json          资源大小、SHA-256 和来源
vendor/                      运行时、模型分片及许可证
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
