# 原始 Web 版（上游项目保留）

> 本目录相关文件（`index.html`、`assets/css`、`assets/js`、`data/*.json`、`data/img`）
> 属于**原始 Web 版刷题网站**的内容，源自
> [zsc5725216-hub/408-quiz](https://github.com/zsc5725216-hub/408-quiz)。
>
> 安卓版（`android/`）是把它重写为移动端界面后移植过来的，
> 转换逻辑见 `tools/build_assets.py`：读取 `data/*.json` 与 `data/img`，
> 输出到 `android/app/src/main/assets/web/`（配图同时转成 WebP 以减小体积）。
> 编译后的安卓资源**不再依赖**这里的文件，`android/` 目录可独立构建。

## 在浏览器里跑 Web 版

```bash
python3 -m http.server 8000
# 打开 http://localhost:8000
```

## 若要更新题库

1. 替换 `data/*.json` 与 `data/img/`（保持原有结构）
2. 重新生成安卓资源：
   ```bash
   python tools/build_assets.py
   ```
3. 重新打包：
   ```bash
   python tools/build_apk.py
   ```

`data/*.json` 的结构说明见仓库根目录 `README.md` 的「题库格式」一节。
