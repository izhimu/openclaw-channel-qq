export class MarkdownToText {
  // 用于存储被保护的代码片段
  private codeBlockStore: Map<string, string> = new Map();
  private maskPrefix = '%%MD_MASK_';
  private maskCounter = 0;

  /**
   * 将 Markdown 转换为适合阅读的纯文本
   */
  public convert(markdown: string): string {
    if (!markdown) return '';

    // 重置状态
    this.codeBlockStore.clear();
    this.maskCounter = 0;

    let text = markdown;

    // --- 阶段 1: 保护性预处理 (Protect) ---
    // 必须最先处理代码块，防止内部字符被误转
    text = this.maskCodeBlocks(text);
    text = this.maskInlineCode(text);

    // --- 阶段 2: 结构化转换 (Process) ---

    // 2.1 清理 HTML 标签 (保留换行)
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<[^>]+>/g, '');

    // 2.2 标题 (Headers) -> 使用视觉重格式化
    // H1/H2 加上双下划线风格，H3+ 加上括号
    text = text.replace(/^#\s+(.*)$/gm, '\n$1\n════════════════════\n');
    text = text.replace(/^##\s+(.*)$/gm, '\n$1\n────────────────────\n');
    text = text.replace(/^#{3,6}\s+(.*)$/gm, '\n【 $1 】\n');

    // 2.3 分割线
    text = text.replace(/^(-\s*?|\*\s*?|_\s*?){3,}\s*$/gm, '────────────────────');

    // 2.4 引用 (Blockquotes) -> 视觉条
    // 支持多级引用，统一转为竖线
    text = text.replace(/^>\s?(.*)$/gm, '▎ $1');

    // 2.5 任务列表 (Task Lists) - GFM
    text = text.replace(/^(\s*)-\s\[x]\s(.*)$/gim, '$1✅ $2'); // 完成
    text = text.replace(/^(\s*)-\s\[\s]\s(.*)$/gim, '$1⬜ $2'); // 未完成

    // 2.6 列表 (Lists)
    // 无序列表转为实心点，有序列表保留数字
    text = text.replace(/^(\s*)[-*+]\s+(.*)$/gm, '$1• $2');

    // 2.7 表格 (Tables) - 最难点
    // 策略：去除对齐行，将单元格用空格分开，尝试保留大致结构，但去掉管道符噪音
    // 移除对齐行 |---|---|
    text = text.replace(/^\s*\|?[\s\-:|]+\|?\s*$/gm, '');
    // 将 | data | data | 转为 data  data
    text = text.replace(/^\|(.*)\|$/gm, (match, content) => {
      return content.split('|').map((s: string) => s.trim()).join('  ');
    });

    // --- 阶段 3: 行内格式清理 (Clean) ---

    // 3.1 粗体、斜体、删除线 -> 仅保留文本
    text = text.replace(/(\*\*|__)(.*?)\1/g, '$2'); // Bold
    text = text.replace(/([*_])(.*?)\1/g, '$2');   // Italic
    text = text.replace(/~~(.*?)~~/g, '$1');        // Strikethrough

    // 3.2 图片 -> [图片: Alt]
    text = text.replace(/!\[([^\]]*)]\(([^)]+)\)/g, '🖼️ [图片: $1]');

    // 3.3 链接 -> Text (URL)
    // 很多时候 URL 太长，如果是聊天软件，最好换行显示
    text = text.replace(/\[([^\]]+)]\(([^)]+)\)/g, '$1 ($2)');
    // 处理自动链接 <http://...>
    text = text.replace(/<((?:https?|ftp|email):[^>]+)>/g, '$1');

    // --- 阶段 4: 还原与美化 (Restore & Polish) ---

    // 还原被保护的代码块
    text = this.unmaskContent(text);

    // 处理 HTML 实体
    text = this.decodeHtmlEntities(text);

    // 最终排版优化：去重多余空行
    text = text.replace(/\n{3,}/g, '\n\n').trim();

    return text;
  }

  /**
   * 掩码处理：代码块
   * 策略：将 ```code``` 替换为 %%MD_MASK_1%% 并在 map 中保存原始内容
   * 输出格式优化：为代码块增加上下边界
   */
  private maskCodeBlocks(text: string): string {
    return text.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const key = `${this.maskPrefix}${this.maskCounter++}`;
      const langTag = lang ? ` [${lang}]` : '';
      // 这里的格式决定了最终代码块长什么样
      const formattedBlock = `\n────────────────────${langTag}\n${code.trim()}\n────────────────────\n`;
      this.codeBlockStore.set(key, formattedBlock);
      return key;
    });
  }

  /**
   * 掩码处理：行内代码
   * 策略：`code` 不应被 markdown 语法解析，也不应该有太多视觉噪音
   */
  private maskInlineCode(text: string): string {
    return text.replace(/`([^`]+)`/g, (match, code) => {
      const key = `${this.maskPrefix}${this.maskCounter++}`;
      // 使用单引号或特殊空格包裹，使其在纯文本中稍显不同
      this.codeBlockStore.set(key, `‘${code}’`);
      return key;
    });
  }

  /**
   * 还原掩码内容
   */
  private unmaskContent(text: string): string {
    // 循环替换直到没有 mask 为止（防止嵌套，虽然逻辑上代码块不应嵌套）
    let result = text;
    // 使用正则匹配所有 mask key
    const maskRegex = new RegExp(`${this.maskPrefix}\\d+`, 'g');

    result = result.replace(maskRegex, (key) => {
      return this.codeBlockStore.get(key) || '';
    });

    return result;
  }

  /**
   * 解码常见的 HTML 实体
   */
  private decodeHtmlEntities(text: string): string {
    const entities: Record<string, string> = {
      '&nbsp;': ' ',
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&copy;': '©'
    };
    return text.replace(/&[a-z0-9#]+;/gi, (entity) => entities[entity] || entity);
  }
}

// --- 使用单例模式或直接导出函数 ---
export const markdownToText = (md: string): string => new MarkdownToText().convert(md);