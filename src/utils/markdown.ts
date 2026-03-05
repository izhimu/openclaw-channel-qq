export class MarkdownToText {
  // 1. 存储池
  private codeBlockStore: Map<string, string> = new Map();

  // 2. 关键修复：使用连字符 "-" 而非下划线，避免被斜体正则(Text)误伤
  private maskPrefix = '%%MD-MASK-';
  private maskCounter = 0;

  /**
   * 主入口：将 Markdown 转换为纯文本
   */
  public convert(markdown: string): string {
    if (!markdown) return '';

    // 初始化
    this.codeBlockStore.clear();
    this.maskCounter = 0;
    let text = markdown;

    // ============================================================
    // 阶段 1: 保护性预处理 (Protect)
    // 必须最先执行，将代码块抽离，防止内部字符被后续逻辑误处理
    // ============================================================
    text = this.maskCodeBlocks(text);
    text = this.maskInlineCode(text);

    // ============================================================
    // 阶段 2: 优先处理特殊标签 (Priority Tags)
    // 必须在清理 HTML 之前处理，防止 <http://...> 被当成 HTML 标签误删
    // ============================================================

    // 2.1 图片 -> [图片: Alt]
    text = text.replace(/!\[([^\]]*)]\(([^)]+)\)/g, (_match, alt) => {
      return `[图片: ${alt || 'Image'}]`;
    });

    // 2.2 自动链接 <http://...> -> http://...
    // 注意：这一步非常重要，Markdown 的自动链接语法和 HTML 标签很像
    text = text.replace(/<((?:https?|ftp|email|mailto):[^>]+)>/g, '$1');

    // 2.3 普通链接 [Text](url) -> Text (url)
    text = text.replace(/\[([^\]]+)]\(([^)]+)\)/g, '$1 ($2)');

    // ============================================================
    // 阶段 3: 结构化转换 & 清理 (Structure & Clean)
    // ============================================================

    // 3.1 预处理换行和分割线标签
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<hr\s*\/?>/gi, '\n──────────\n');

    // 3.2 安全清理 HTML 标签 (Smart Strip)
    // A. 移除 <script> 和 <style> 及其内容
    text = text.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
    // B. 移除 HTML 注释 (修复了之前的语法错误)
    text = text.replace(/<!--[\s\S]*?-->/g, '');
    // C. 智能移除 HTML 标签
    // 逻辑：匹配 < 后紧跟字母的模式，保留 "a < b" 或 "1 < 5" 这种数学公式
    text = text.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, '');

    // 3.3 标题 (Headers) -> 视觉醒目文本
    text = text.replace(/^#\s+(.*)$/gm, '\n$1\n\n\n');
    text = text.replace(/^(#{2,6})\s+(.*)$/gm, '\n$2\n\n');

    // 3.4 Markdown 分割线 (---, ***)
    text = text.replace(/^(-\s*?|\*\s*?|_\s*?){3,}\s*$/gm, '──────────');

    // 3.5 引用 (Blockquotes)
    text = text.replace(/^(>+)\s?(.*)$/gm, (_match, _arrows, content) => `▎ ${content}`);

    // 3.6 任务列表 & 无序列表
    text = text.replace(/^(\s*)-\s\[x]\s/gim, '$1✅ '); // 完成的任务
    text = text.replace(/^(\s*)-\s\[\s]\s/gim, '$1⬜ '); // 未完成的任务
    text = text.replace(/^(\s*)[-*+]\s+(.*)$/gm, '$1• $2'); // 列表项变圆点

    // 3.7 表格 (Tables) -> 空格分隔
    text = text.replace(/^\s*\|?[\s\-:|]+\|?\s*$/gm, ''); // 移除 |---|---| 分隔行
    text = text.replace(/^\|(.*)\|$/gm, (_match, content) => {
      return content.split('|').map((s: string) => s.trim()).join('  ');
    });

    // ============================================================
    // 阶段 4: 行内格式 (Inline Formatting)
    // ============================================================

    // 4.1 粗体 (**Text**) -> “Text”
    text = text.replace(/(\*\*|__)([\s\S]*?)\1/g, '“$2”');

    // 4.2 斜体 (*Text*) -> Text
    // 此时 Mask Key 是 "MD-MASK"，不包含下划线或星号，所以不会被这里误伤
    text = text.replace(/([*_])([\s\S]*?)\1/g, '$2');

    // 4.3 删除线 (~~Text~~) -> Text
    text = text.replace(/~~([\s\S]*?)~~/g, '$1');

    // ============================================================
    // 阶段 5: 还原与收尾 (Restore & Finalize)
    // ============================================================

    // 5.1 还原代码块
    text = this.unmaskContent(text);

    // 5.2 解码 HTML 实体 (&amp; -> &)
    text = this.decodeHtmlEntities(text);

    // 5.3 最终排版优化：合并多余换行
    text = text.replace(/\n{3,}/g, '\n\n').trim();

    return text;
  }

  /**
   * 保护代码块 (```)
   * 生成 Key 格式：%%MD-MASK-BLOCK-0
   */
  private maskCodeBlocks(text: string): string {
    const codeBlockRegex = /(`{3,}|~{3,})(\w*)\n([\s\S]*?)\1/g;
    return text.replace(codeBlockRegex, (_match, _fence, lang, code) => {
      const key = `${this.maskPrefix}BLOCK-${this.maskCounter++}`;
      const langTag = lang ? ` [${lang}]` : '';
      const formatted = `\n──────────${langTag}\n${code.replace(/^\n+|\n+$/g, '')}\n──────────\n`;
      this.codeBlockStore.set(key, formatted);
      return key;
    });
  }

  /**
   * 保护行内代码 (`)
   * 生成 Key 格式：%%MD-MASK-INLINE-0
   */
  private maskInlineCode(text: string): string {
    return text.replace(/`([^`]+)`/g, (_match, code) => {
      const key = `${this.maskPrefix}INLINE-${this.maskCounter++}`;
      this.codeBlockStore.set(key, ` ‘${code}’ `);
      return key;
    });
  }

  /**
   * 还原掩码内容
   * 必须匹配连字符，支持 %%MD-MASK-BLOCK-1 格式
   */
  private unmaskContent(text: string): string {
    // 这里的正则 [\w-]+ 允许匹配字母、数字、下划线和连字符
    const maskRegex = new RegExp(`${this.maskPrefix}[\\w-]+`, 'g');
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