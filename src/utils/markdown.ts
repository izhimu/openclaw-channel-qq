export class MarkdownToText {
  private codeBlockStore: Map<string, string> = new Map();
  private maskPrefix = '%%MD-MASK-';
  private maskCounter = 0;

  /**
   * 主入口：将 Markdown 转换为纯文本（移动端优化版）
   */
  public convert(markdown: string): string {
    if (!markdown) return '';

    // 初始化
    this.codeBlockStore.clear();
    this.maskCounter = 0;
    let text = markdown;

    // ============================================================
    // 阶段 1: 保护性预处理 (Protect)
    // ============================================================
    text = this.maskCodeBlocks(text);
    text = this.maskInlineCode(text);

    // ============================================================
    // 阶段 2: 优先处理特殊标签 (Priority Tags)
    // ============================================================

    // 2.1 图片 -> [图片] url（保留 URL，放在同一行）
    text = text.replace(/!\[([^\]]*)]\(([^)]+)\)/g, (_match, alt, url) => {
      const displayText = alt ? `[图片: ${alt}]` : '[图片]';
      return `${displayText} ${url}`;
    });

    // 2.2 自动链接 <http://...> -> http://...
    text = text.replace(/<((?:https?|ftp|email|mailto):[^>]+)>/g, '$1');

    // 2.3 普通链接 [Text](url) -> Text: url（冒号分隔，更清晰）
    text = text.replace(/\[([^\]]+)]\(([^)]+)\)/g, (_match, linkText, url) => {
      // 如果链接文本就是 URL，只显示一次
      if (linkText === url || linkText.trim() === url.trim()) {
        return url;
      }
      return `${linkText}: ${url}`;
    });

    // ============================================================
    // 阶段 3: 结构化转换 & 清理 (Structure & Clean)
    // ============================================================

    // 3.1 预处理换行和分割线标签
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<hr\s*\/?>/gi, '\n---\n');

    // 3.2 安全清理 HTML 标签
    text = text.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
    text = text.replace(/<!--[\s\S]*?-->/g, '');
    text = text.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, '');

    // 3.3 标题 -> 简洁样式
    text = text.replace(/^#\s+(.*)$/gm, '\n【$1】\n');
    text = text.replace(/^##\s+(.*)$/gm, '\n■ $1\n');
    text = text.replace(/^(#{3,6})\s+(.*)$/gm, '\n▸ $2\n');

    // 3.4 Markdown 分割线
    text = text.replace(/^(-\s*?|\*\s*?|_\s*?){3,}\s*$/gm, '---');

    // 3.5 引用
    text = text.replace(/^(>+)\s?(.*)$/gm, (_match, arrows, content) => {
      const level = arrows.length;
      return level > 1 ? `  ${content}` : `${content}`;
    });

    // 3.6 任务列表 & 无序列表
    text = text.replace(/^(\s*)-\s\[x]\s/gim, '$1✓ ');
    text = text.replace(/^(\s*)-\s\[\s]\s/gim, '$1□ ');
    text = text.replace(/^(\s*)[-*+]\s+(.*)$/gm, '$1· $2');

    // 3.7 表格
    text = text.replace(/^\s*\|?[\s\-:|]+\|?\s*$/gm, '');
    text = text.replace(/^\|(.*)\|$/gm, (_match, content) => {
      return content.split('|').map((s: string) => s.trim()).join(' | ');
    });

    // ============================================================
    // 阶段 4: 行内格式 (Inline Formatting)
    // ============================================================

    // 4.1 粗体 -> 保留文字
    text = text.replace(/(\*\*|__)([\s\S]*?)\1/g, '$2');

    // 4.2 斜体 -> 保留文字
    text = text.replace(/([*_])([\s\S]*?)\1/g, '$2');

    // 4.3 删除线 -> 保留文字
    text = text.replace(/~~([\s\S]*?)~~/g, '$1');

    // ============================================================
    // 阶段 5: 还原与收尾 (Restore & Finalize)
    // ============================================================

    // 5.1 还原代码块
    text = this.unmaskContent(text);

    // 5.2 解码 HTML 实体
    text = this.decodeHtmlEntities(text);

    // 5.3 最终排版优化
    text = text.replace(/\n{3,}/g, '\n\n');
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/^\s+|\s+$/gm, '');
    text = text.trim();

    return text;
  }

  /**
   * 保护代码块
   */
  private maskCodeBlocks(text: string): string {
    const codeBlockRegex = /(`{3,}|~{3,})(\w*)\n?([\s\S]*?)\n?\1/g;
    return text.replace(codeBlockRegex, (_match, _fence, lang, code) => {
      const key = `${this.maskPrefix}BLOCK-${this.maskCounter++}`;
      const langTag = lang ? `[${lang}]\n` : '';
      const formatted = `\n${langTag}${code.trim()}\n`;
      this.codeBlockStore.set(key, formatted);
      return key;
    });
  }

  /**
   * 保护行内代码
   */
  private maskInlineCode(text: string): string {
    return text.replace(/`([^`]+)`/g, (_match, code) => {
      const key = `${this.maskPrefix}INLINE-${this.maskCounter++}`;
      this.codeBlockStore.set(key, `'${code}'`);
      return key;
    });
  }

  /**
   * 还原掩码内容
   */
  private unmaskContent(text: string): string {
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