# quinn-ma.github.io

马沁桢 / Qinzhen Ma 的个人网站，托管于 GitHub Pages：https://quinn-ma.github.io/

纯静态站点（HTML / CSS / JS，无构建步骤），中英双语，支持深色 / 浅色主题。

```
index.html            页面骨架（各区块容器，文字由 JS 渲染）
assets/js/content.js  全部文案：zh / en 两份，改文字改这里
assets/js/main.js     交互逻辑：语言 / 主题切换、打字机、粒子背景、交付闭环图、时间线、技能高亮、复制联系方式
assets/css/style.css  样式与主题变量
assets/img/avatar.jpg 头像
assets/media/         LeRobot 叠衣服演示视频
assets/Qinzhen_Ma_Resume.pdf  简历下载
```

## 本地预览

```bash
python -m http.server 8765
```

然后打开 http://127.0.0.1:8765/ 。加 `?lang=en` 可强制英文。

## 部署

推送到 `main` 分支即自动发布（GitHub Pages，根目录）。
