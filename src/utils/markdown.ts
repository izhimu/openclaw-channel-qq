export class MarkdownToText {
  // 用于暂存被保护的代码块，防止被正则误伤
  private codeBlockStore: Map<string, string> = new Map();
  private maskPrefix = '%%MD_MASK_';
  private maskCounter = 0;

  /**
   * 主入口：将 Markdown 转换为纯文本
   * @param markdown 原始 Markdown 字符串
   */
  public convert(markdown: string): string {
    if (!markdown) return '';

    // 1. 初始化
    this.codeBlockStore.clear();
    this.maskCounter = 0;
    let text = markdown;

    // --- 阶段 1: 保护性预处理 (Protect) ---
    // 必须最先执行，防止代码里的注释 # 被当成标题，或 ** 被当成粗体
    text = this.maskCodeBlocks(text);
    text = this.maskInlineCode(text);

    // --- 阶段 2: 结构化转换 (Structure) ---

    // 2.1 清理 HTML 标签 (保留 <br> 的换行效果)
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<hr\s*\/?>/gi, '\n────────────────────\n');
    text = text.replace(/<[^>]+>/g, ''); // 移除剩余所有标签

    // 2.2 标题 (Headers) -> 转换为视觉醒目的文本
    // H1/H2 使用双线/单线分隔，H3+ 使用括号包裹
    text = text.replace(/^#\s+(.*)$/gm, '\n$1\n════════════════════\n');
    text = text.replace(/^##\s+(.*)$/gm, '\n$1\n────────────────────\n');
    text = text.replace(/^(#{3,6})\s+(.*)$/gm, '\n【 $2 】\n');

    // 2.3 水平分割线 (---, ***, ___)
    text = text.replace(/^(-\s*?|\*\s*?|_\s*?){3,}\s*$/gm, '────────────────────');

    // 2.4 引用 (Blockquotes) -> 使用竖线前缀
    // 处理多级引用 >> Text
    text = text.replace(/^(>+)\s?(.*)$/gm, (_match, _arrows, content) => {
      return `▎ ${content}`;
    });

    // 2.5 任务列表 (Task Lists)
    text = text.replace(/^(\s*)-\s\[x]\s/gim, '$1✅ '); // 完成
    text = text.replace(/^(\s*)-\s\[\s]\s/gim, '$1⬜ '); // 未完成

    // 2.6 无序与有序列表 (Lists)
    // 保留 $1 (缩进空格)，将 -/*/+ 替换为 •
    text = text.replace(/^(\s*)[-*+]\s+(.*)$/gm, '$1• $2');
    // 有序列表 1. 2. 通常不需要改动，保留原样即可

    // 2.7 表格 (Tables)
    // 移除对齐行 |---|---|
    text = text.replace(/^\s*\|?[\s\-:|]+\|?\s*$/gm, '');
    // 将 | Cell | Cell | 转换为空格分隔，尽量保持一行
    text = text.replace(/^\|(.*)\|$/gm, (_match, content) => {
      // 移除首尾管道符，中间管道符变为空格
      return content.split('|').map((s: string) => s.trim()).join('  ');
    });

    // --- 阶段 3: 行内格式清理 (Inline Formatting) ---

    // 3.1 粗体 (Bold) -> 使用中文引号或双星号强调
    // 使用 [\s\S] 确保匹配跨行粗体
    text = text.replace(/(\*\*|__)([\s\S]*?)\1/g, '“$2”');

    // 3.2 斜体 (Italic) -> 直接移除符号，纯文本很难表现斜体
    // 注意：必须在处理完粗体后处理斜体
    text = text.replace(/([*_])([\s\S]*?)\1/g, '$2');

    // 3.3 删除线 (Strikethrough) -> 移除内容或仅移除符号？通常仅移除符号
    text = text.replace(/~~([\s\S]*?)~~/g, '$1');

    // 3.4 图片 (Images) -> 转换为占位符
    text = text.replace(/!\[([^\]]*)]\(([^)]+)\)/g, (_match, alt) => {
      return `[图片: ${alt || 'Image'}]`;
    });

    // 3.5 链接 (Links) -> Text (URL)
    // 排除锚点链接或空链接
    text = text.replace(/\[([^\]]+)]\(([^)]+)\)/g, '$1 ($2)');
    // 处理自动链接 <http://example.com>
    text = text.replace(/<((?:https?|ftp|email):[^>]+)>/g, '$1');

    // --- 阶段 4: 还原与收尾 (Restore & Finalize) ---

    // 4.1 还原代码块
    text = this.unmaskContent(text);

    // 4.2 解码 HTML 实体 (&amp; -> &)
    text = this.decodeHtmlEntities(text);

    // 4.3 最终排版优化
    // 移除段首段尾多余空白，将连续3个以上换行压缩为2个（段落间距）
    text = text.replace(/\n{3,}/g, '\n\n').trim();

    return text;
  }

  /**
   * 保护代码块
   * 支持 ```language 和 ~~~ 两种写法
   */
  private maskCodeBlocks(text: string): string {
    // 匹配 3个或更多反引号/波浪线
    const codeBlockRegex = /(`{3,}|~{3,})(\w*)\n([\s\S]*?)\1/g;

    return text.replace(codeBlockRegex, (_match, _fence, lang, code) => {
      const key = `${this.maskPrefix}BLOCK_${this.maskCounter++}`;
      const langTag = lang ? ` [${lang}]` : '';
      // 构造美观的代码块样式
      const formatted = `\n────────────────────${langTag}\n${code.replace(/^\n+|\n+$/g, '')}\n────────────────────\n`;
      this.codeBlockStore.set(key, formatted);
      return key;
    });
  }

  /**
   * 保护行内代码
   * `code` -> 使用单引号包裹，区别于普通文本
   */
  private maskInlineCode(text: string): string {
    return text.replace(/`([^`]+)`/g, (_match, code) => {
      const key = `${this.maskPrefix}INLINE_${this.maskCounter++}`;
      this.codeBlockStore.set(key, ` ‘${code}’ `); // 加空格防止粘连
      return key;
    });
  }

  /**
   * 还原被掩码的内容
   */
  private unmaskContent(text: string): string {
    // 使用正则全局匹配所有 mask key
    const maskRegex = new RegExp(`${this.maskPrefix}\\w+_\\d+`, 'g');
    return text.replace(maskRegex, (key) => {
      return this.codeBlockStore.get(key) || '';
    });
  }

  /**
   * HTML 实体解码
   */
  private decodeHtmlEntities(text: string): string {
    const entities: { [key: string]: string } = {
      '&nbsp;': ' ',
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&apos;': "'",
      '&#39;': "'",
      '&copy;': '©',
      '&reg;': '®'
    };
    return text.replace(/&[a-z0-9#]+;/gi, (entity) => entities[entity] || entity);
  }
}

// 导出单例辅助函数，方便直接调用
export const markdownToText = (md: string) => new MarkdownToText().convert(md);