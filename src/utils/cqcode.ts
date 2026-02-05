/**
 * CQCode 节点接口
 */
export interface CQNode {
  type: string;
  data: Record<string, string>;
}

/**
 * 生产级 CQCode 解析工具类
 */
export class CQCodeUtils {
  // 定义转义映射表
  private static readonly UNESCAPE_MAP: Record<string, string> = {
    '&#91;': '[',
    '&#93;': ']',
    '&#44;': ',',
    '&amp;': '&',
  };

  // 定义转义正则（全局匹配）
  private static readonly UNESCAPE_REGEX = /&#91;|&#93;|&#44;|&amp;/g;

  /**
   * 反转义字符串
   * 使用单次正则替换，避免多次遍历和嵌套转义带来的逻辑错误
   */
  private static unescape(str: string): string {
    if (!str) return '';
    return str.replace(this.UNESCAPE_REGEX, (match) => this.UNESCAPE_MAP[match] || match);
  }

  /**
   * 解析 CQ 码字符串为 JSON 对象数组
   * @param text 原始消息字符串
   */
  static parse(text: string): CQNode[] {
    if (!text) return [];

    const nodes: CQNode[] = [];
    const regex = /\[CQ:([^\]]+)]/g;
    
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      // 1. 提取 CQ 码前的纯文本
      if (match.index > lastIndex) {
        const textContent = text.substring(lastIndex, match.index);
        nodes.push({
          type: 'text',
          data: { text: this.unescape(textContent) },
        });
      }

      // 2. 解析 CQ 码主体
      const content = match[1];
      const parts = content.split(',');
      const type = parts[0];
      
      // 使用 Object.create(null) 防止原型污染，或者在赋值时做检查
      const data: Record<string, string> = {};

      for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        if (!part) continue; // 跳过空段（处理类似 [CQ:at,,qq=1] 的情况）

        const eqIndex = part.indexOf('=');
        let key: string;
        let value: string;

        if (eqIndex !== -1) {
          key = part.substring(0, eqIndex).trim(); // key 通常不含空格，安全起见 trim
          value = this.unescape(part.substring(eqIndex + 1));
        } else {
          key = part.trim();
          value = '';
        }

        // 🛡️ 安全检查：防止原型污染
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
          continue;
        }

        if (key) {
          data[key] = value;
        }
      }

      nodes.push({ type, data });
      lastIndex = regex.lastIndex;
    }

    // 3. 提取剩余的纯文本
    if (lastIndex < text.length) {
      const textContent = text.substring(lastIndex);
      nodes.push({
        type: 'text',
        data: { text: this.unescape(textContent) },
      });
    }

    return nodes;
  }

  /**
   * 辅助方法：从解析结果中提取所有纯文本内容（去除 CQ 码）
   * 场景：用于生成通知摘要、日志记录等
   */
  static getTextOnly(nodes: CQNode[]): string {
    return nodes
      .filter(node => node.type === 'text')
      .map(node => node.data.text)
      .join('');
  }

  /**
   * 辅助方法：判断消息是否提及了某个 QQ
   */
  static isMentioned(nodes: CQNode[], qq: string | number): boolean {
    const targetQQ = String(qq);
    return nodes.some(
      node => node.type === 'at' && (node.data.qq === targetQQ || node.data.qq === 'all')
    );
  }
}