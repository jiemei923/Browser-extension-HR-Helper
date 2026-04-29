# HR 招聘搜索词助手

一个兼容 Google Chrome 和 Microsoft Edge 的 Manifest V3 浏览器拓展，用于帮助 HR 在招聘网站中基于选中的岗位名称，快速生成结构化招聘搜索关键词和对标公司。

HR 可以在网页中选中岗位名称，通过右键菜单调用 AI，结果会直接显示在当前网页右侧浮层中。关键词和公司名称均可单独点击复制。

## 功能特性

- 在任意网页选中岗位名称后，通过右键菜单生成结果
- 使用当前网页内浮层展示，不依赖浏览器 popup 展示结果
- 关键词按结构化分类展示：
  - 核心技能
  - 技术栈
  - 岗位别名
  - 行业相关
- 生成对标公司列表，优先匹配 HR 配置的公司行业
- 显示行业锁定提示，帮助 HR 理解对标公司来源逻辑
- 点击单个标签即可复制该词
- 支持重新生成
- 支持关闭浮层、点击页面外部关闭、Esc 关闭
- Popup 设置页支持保存公司信息和 AI 接口配置
- 设置保存到 `chrome.storage.local`
- API 请求格式兼容 OpenAI Chat Completions API

## 文件结构

```text
.
├── manifest.json
├── background.js
├── content.js
├── popup.html
├── popup.js
├── popup.css
├── styles.css
└── README.md
```

- `manifest.json`：浏览器拓展配置
- `background.js`：右键菜单、AI 请求、Prompt、JSON 解析
- `content.js`：网页浮层、分类展示、复制、重新生成
- `styles.css`：网页浮层样式
- `popup.html`：插件设置页
- `popup.js`：设置读取、保存、API Key 显示/隐藏
- `popup.css`：设置页样式

## 安装方式

### Chrome 加载未打包拓展

1. 打开 Chrome。
2. 访问 `chrome://extensions/`。
3. 打开右上角“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择本项目文件夹。
6. 工具栏中会出现“HR 招聘搜索词助手”图标。

### Edge 加载未打包拓展

1. 打开 Microsoft Edge。
2. 访问 `edge://extensions/`。
3. 打开“开发人员模式”。
4. 点击“加载解压缩的扩展”。
5. 选择本项目文件夹。
6. 工具栏中会出现“HR 招聘搜索词助手”图标。

## 配置方式

点击浏览器工具栏中的插件图标，打开设置页后填写：

- 公司名称
- 公司所在行业
- 目标招聘地区
- 关键词语言：中文、英文、双语
- AI API Key
- AI API Base URL
- 模型名称

填写完成后点击“保存设置”。

API Base URL 支持以下形式：

```text
https://api.openai.com
https://api.openai.com/v1
https://api.openai.com/v1/chat/completions
```

模型名称示例：

```text
gpt-4o-mini
```

## 使用方式

1. 打开招聘网站或任意包含岗位名称的网页。
2. 用鼠标选中岗位名称，例如“嵌入式软件工程师”。
3. 单击鼠标右键。
4. 点击“生成招聘搜索词和对标公司”。
5. 页面右侧会出现结果浮层。
6. 点击任意关键词或公司名称，即可复制单个词条。
7. 点击“重新生成”可再次调用 AI。
8. 点击关闭按钮、按 Esc 或点击页面其他区域可关闭浮层。

## AI 返回格式

插件期望 AI 返回严格 JSON，结构如下：

```json
{
  "keywords": {
    "core_skills": ["嵌入式开发", "RTOS", "驱动开发"],
    "tech_stack": ["STM32", "C语言", "CAN通信"],
    "job_aliases": ["嵌入式工程师", "固件工程师", "底层软件工程师"],
    "industry_keywords": ["航电系统", "飞控", "航空电子"]
  },
  "benchmark_companies": ["中航工业", "中国商飞", "航天科技"]
}
```

字段说明：

- `core_skills`：岗位必须具备的核心能力
- `tech_stack`：工具、语言、平台、协议、框架
- `job_aliases`：招聘网站和简历中常见岗位表达
- `industry_keywords`：结合公司行业和岗位生成的行业搜索词
- `benchmark_companies`：可能拥有类似岗位人才的对标公司

为了兼容旧版本，如果 AI 返回的 `keywords` 仍然是数组，插件会自动把它展示到“核心技能”分类下。

## 错误提示

- 未选中文本：`请先选中岗位名称`
- 未配置 API：`请先在插件设置中配置 API 信息`
- AI 请求失败：显示接口返回的具体错误
- JSON 解析失败：`AI 返回格式异常，请重试`
- 网络异常：`网络请求失败，请检查 API Base URL 或网络连接`

## 权限说明

插件使用以下权限：

- `contextMenus`：创建右键菜单
- `storage`：保存公司信息和 API 配置
- `scripting`：在当前页面注入内容脚本
- `activeTab`：访问当前激活标签页
- `<all_urls>`：允许在招聘网站和其他网页显示浮层

## 安全说明

当前版本会将 API Key 保存在本地浏览器的 `chrome.storage.local` 中，并直接从浏览器拓展调用 AI API。

正式上线时，建议改为通过公司后端代理请求 AI 服务，避免 API Key 暴露在员工浏览器环境中，同时便于统一鉴权、审计、限流和成本控制。

## 当前限制

- 初版直接从浏览器拓展请求 AI API
- 不包含招聘网站跳转搜索功能
- 不包含账号体系、团队配置同步或后台管理
- AI 结果质量依赖模型能力和公司行业配置完整度
