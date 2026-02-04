# NapCat WebSocket API 文档

本文档基于 NapCat 在线接口文档，转换为 WebSocket 请求方式。

## WebSocket 连接说明

### 连接地址

```
ws://your-host:port?access_token=your_token
```

或者使用 `wss://` 进行加密连接。

### 认证方式

在连接时通过 URL 参数传递 `access_token`：

```
ws://localhost:3001?access_token=your_access_token
```

### 请求格式

所有 WebSocket 请求遵循以下格式：

```json
{
    "action": "接口名称",
    "params": {
        // 接口参数
    },
    "echo": "自定义标识"
}
```

- `action`: 接口名称（对应 HTTP API 的路径，去掉前缀 `/`）
- `params`: 接口参数对象
- `echo`: 可选，用于关联请求和响应的自定义标识

### 响应格式

```json
{
    "status": "ok",
    "retcode": 0,
    "data": {
        // 返回数据
    },
    "message": "",
    "wording": "",
    "echo": "自定义标识"
}
```

---

## 消息段类型

NapCat 使用消息段（Message Segment）数组来表示复杂的消息内容。每个消息段是一个对象，包含 `type` 和 `data` 字段。

### 消息段格式

```json
{
    "type": "消息段类型",
    "data": {
        // 消息段数据
    }
}
```

### 支持的消息段类型

#### 1. text - 文本

纯文本消息。

```json
{
    "type": "text",
    "data": {
        "text": " Hello "
    }
}
```

#### 2. face - 表情

使用 QQ 自带的表情。

```json
{
    "type": "face",
    "data": {
        "id": "123"
    }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 表情 ID |

#### 3. mface - 商城表情

使用 QQ 商城的表情。

```json
{
    "type": "mface",
    "data": {
        "type": "1",
        "id": "123456",
        "text": "你好",
        "url": "https://...",
        "emoji_package_id": "1"
    }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 否 | 商城表情类型 |
| id | string | 否 | 商城表情 ID |
| text | string | 否 | 表情文本 |
| url | string | 否 | 表情图片 URL |
| emoji_package_id | string | 否 | 表情包 ID |

#### 4. at - 艾特

艾特某人或所有人。

```json
{
    "type": "at",
    "data": {
        "qq": "654321"
    }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| qq | string | 是 | 被艾特的 QQ 号，`all` 表示艾特所有人 |

#### 5. reply - 回复

回复某条消息。

```json
{
    "type": "reply",
    "data": {
        "id": "123456"
    }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 回复的消息 ID |

#### 6. image - 图片

发送图片。

```json
{
    "type": "image",
    "data": {
        "file": "http://...",
        "type": "flash",
        "url": "https://...",
        "summary": "[图片]"
    }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | string | 是 | 图片文件路径、URL 或 Base64 |
| type | string | 否 | 图片类型，`flash` 表示闪照 |
| url | string | 否 | 图片 URL |
| summary | string | 否 | 图片摘要 |

#### 7. record - 语音

发送语音消息。

```json
{
    "type": "record",
    "data": {
        "file": "http://...",
        "url": "https://..."
    }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | string | 是 | 语音文件路径或 URL |
| url | string | 否 | 语音文件 URL |

#### 8. video - 视频

发送视频消息。

```json
{
    "type": "video",
    "data": {
        "file": "http://...",
        "url": "https://..."
    }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | string | 是 | 视频文件路径或 URL |
| url | string | 否 | 视频文件 URL |

#### 9. file - 文件

发送文件消息。

```json
{
    "type": "file",
    "data": {
        "file": "file://...",
        "url": "https://..."
    }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | string | 是 | 文件路径，需使用 `file://` 协议 |
| url | string | 否 | 文件 URL |

#### 10. music - 音乐分享

发送音乐分享卡片，支持多个音乐平台。

**QQ音乐示例**：
```json
{
    "type": "music",
    "data": {
        "type": "qq",
        "id": "123456"
    }
}
```

**网易云音乐示例**：
```json
{
    "type": "music",
    "data": {
        "type": "163",
        "id": "123456"
    }
}
```

**自定义音乐分享**：
```json
{
    "type": "music",
    "data": {
        "type": "custom",
        "url": "https://...",
        "audio": "https://...",
        "title": "歌曲标题",
        "content": "歌曲描述",
        "image": "https://..."
    }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 是 | 音乐平台：`qq`、`163`、`kugou`、`migu`、`kuwo`、`custom` |
| id | string | type≠custom 时必填 | 歌曲 ID（非自定义时使用） |
| url | string | type=custom 时必填 | 点击跳转链接 |
| audio | string | type=custom 时必填 | 音频链接 |
| title | string | type=custom 时必填 | 歌曲标题 |
| content | string | type=custom 时必填 | 歌曲描述 |
| image | string | type=custom 时必填 | 图片链接 |

#### 11. poke - 戳一戳

发送戳一戳消息。

```json
{
    "type": "poke",
    "data": {
        "type": "654321"
    }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 是 | 被戳的 QQ 号 |

#### 12. dice - 骰子

发送骰子消息。

```json
{
    "type": "dice",
    "data": {}
}
```

#### 13. rps - 猜拳

发送猜拳消息。

```json
{
    "type": "rps",
    "data": {}
}
```

#### 14. contact - 联系人

发送联系人分享卡片。

```json
{
    "type": "contact",
    "data": {
        "type": "qq",
        "id": "654321"
    }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 是 | 联系人类型，目前仅支持 `qq` |
| id | string | 是 | QQ 号 |

#### 15. json - JSON 消息

发送 JSON 格式的富文本消息。

```json
{
    "type": "json",
    "data": {
        "data": "{\"app\":\"...\",\"...\":\"...\"}",
        "resid": "123"
    }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| data | string | 是 | JSON 字符串 |
| resid | string | 否 | 资源 ID |

#### 16. markdown - Markdown 消息

发送 Markdown 格式的富文本消息。

```json
{
    "type": "markdown",
    "data": {
        "content": "# 标题\n\n**粗体** *斜体*"
    }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| content | string | 是 | Markdown 内容 |

#### 17. node - 转发节点

转发消息的节点。

```json
{
    "type": "node",
    "data": {
        "id": "123456"
    }
}
```

或自定义内容：

```json
{
    "type": "node",
    "data": {
        "user_id": "654321",
        "nickname": "昵称",
        "content": "消息内容"
    }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 与内容二选一 | 转发消息 ID |
| user_id | string | 自定义内容时必填 | 发送者 QQ 号 |
| nickname | string | 自定义内容时必填 | 发送者昵称 |
| content | string/array | 自定义内容时必填 | 消息内容 |

#### 18. forward - 合并转发

发送合并转发消息。

```json
{
    "type": "forward",
    "data": {
        "id": "123456"
    }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 转发消息 ID |

#### 19. onlinefile - 在线文件

发送在线文件分享。

```json
{
    "type": "onlinefile",
    "data": {
        "file": "file_uuid_123"
    }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | string | 是 | 文件 ID |

#### 20. flashtransfer - 空闪照

发送空闪照消息。

```json
{
    "type": "flashtransfer",
    "data": {
        "id": "123456"
    }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 消息 ID |

---

## 1. 消息接口

### 1.1 发送消息

发送私聊或群聊消息。

**Action**: `send_msg`

**请求参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| message_type | string | 是 | 消息类型，`private` 或 `group` |
| user_id | string | 私聊时必填 | 用户 QQ |
| group_id | string | 群聊时必填 | 群号 |
| message | array/string | 是 | 消息内容，支持数组形式的消息段或纯文本 |
| auto_escape | boolean/string | 否 | 是否作为纯文本发送 |

**请求示例**：

```json
{
    "action": "send_msg",
    "params": {
        "message_type": "private",
        "user_id": "654321",
        "message": "hello"
    }
}
```

```json
{
    "action": "send_msg",
    "params": {
        "message_type": "group",
        "group_id": "123456",
        "message": [
            {
                "type": "text",
                "data": {
                    "text": "hello"
                }
            }
        ]
    }
}
```

**响应示例**：

```json
{
    "status": "ok",
    "retcode": 0,
    "data": {
        "message_id": 123456,
        "res_id": "",
        "forward_id": ""
    }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| message_id | number | 消息 ID |
| res_id | string | 资源 ID（某些消息类型返回） |
| forward_id | string | 转发 ID（转发消息时返回） |

### 1.2 获取群历史消息

获取指定群聊的历史聊天记录。

**Action**: `get_group_msg_history`

**请求参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| group_id | string | 是 | 群号 |
| message_seq | string | 否 | 起始消息序号 |
| count | number | 否 | 获取消息数量，默认 20 |
| reverse_order | boolean | 否 | 是否反向排序，默认 false |
| disable_get_url | boolean | 否 | 是否禁用获取 URL，默认 false |
| parse_mult_msg | boolean | 否 | 是否解析合并消息，默认 true |
| quick_reply | boolean | 否 | 是否获取快速回复数据，默认 false |

**请求示例**：

```json
{
    "action": "get_group_msg_history",
    "params": {
        "group_id": "123456",
        "message_seq": "0",
        "count": 20
    }
}
```

### 1.3 获取好友历史消息

获取指定好友的历史聊天记录。

**Action**: `get_friend_msg_history`

**请求参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| user_id | string | 是 | 用户 QQ |
| message_seq | string | 否 | 起始消息序号 |
| count | number | 否 | 获取消息数量，默认 20 |
| reverse_order | boolean | 否 | 是否反向排序，默认 false |

**请求示例**：

```json
{
    "action": "get_friend_msg_history",
    "params": {
        "user_id": "654321",
        "message_seq": "0",
        "count": 20
    }
}
```

### 1.4 获取消息

根据消息 ID 获取消息详细信息。

**Action**: `get_msg`

**请求参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| message_id | number/string | 是 | 消息 ID |

**请求示例**：

```json
{
    "action": "get_msg",
    "params": {
        "message_id": 123456
    }
}
```

**响应示例**：

```json
{
    "status": "ok",
    "retcode": 0,
    "data": {
        "time": 1710000000,
        "message_type": "group",
        "message_id": 123456,
        "real_id": 123456,
        "message_seq": 123456,
        "sender": {
            "user_id": 123456789,
            "nickname": "昵称"
        },
        "message": "hello",
        "raw_message": "hello",
        "font": 14,
        "group_id": 123456,
        "user_id": 123456789,
        "emoji_likes_list": []
    },
    "message": "",
    "wording": ""
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| time | number | 发送时间 |
| message_type | string | 消息类型 |
| message_id | number | 消息 ID |
| real_id | number | 真实 ID |
| message_seq | number | 消息序号 |
| sender | object | 发送者信息 |
| message | string/array | 消息内容 |
| raw_message | string | 原始消息内容 |
| font | number | 字体 |
| group_id | number/string | 群号（群消息时返回） |
| user_id | number/string | 发送者 QQ 号 |
| emoji_likes_list | array | 表情回应列表 |

### 1.5 获取合并转发消息

获取合并转发消息的具体内容。

**Action**: `get_forward_msg`

**请求参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| message_id | string | 是 | 消息 ID |

**请求示例**：

```json
{
    "action": "get_forward_msg",
    "params": {
        "message_id": "123456"
    }
}
```

---

## 2. 用户接口

### 2.1 获取好友列表

获取当前账号的好友列表。

**Action**: `get_friend_list`

**请求参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| no_cache | boolean/string | 否 | 是否不使用缓存 |

**请求示例**：

```json
{
    "action": "get_friend_list",
    "params": {}
}
```

**响应示例**：

```json
{
    "status": "ok",
    "retcode": 0,
    "data": [
        {
            "user_id": 654321,
            "nickname": "昵称",
            "remark": "备注",
            "sex": "male",
            "level": 10,
            "age": 20,
            "category_id": 1,
            "categoryName": "分组名称"
        }
    ]
}
```

---

## 3. 文件接口

### 3.1 获取文件

获取指定文件的详细信息及下载路径。

**Action**: `get_file`

**请求参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| file | string | 否 | 文件路径、URL 或 Base64 |
| file_id | string | 否 | 文件 ID |

**请求示例**：

```json
{
    "action": "get_file",
    "params": {
        "file": "file_id_123"
    }
}
```

**响应示例**：

```json
{
    "status": "ok",
    "retcode": 0,
    "data": {
        "file": "/path/to/file",
        "url": "http://...",
        "file_size": "1024",
        "file_name": "test.jpg"
    }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| file | string | 本地路径 |
| url | string | 下载 URL |
| file_size | string | 文件大小 |
| file_name | string | 文件名 |
| base64 | string | Base64 编码 |

### 3.2 获取图片

获取指定图片的信息及路径。

**Action**: `get_image`

**请求参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| file | string | 否 | 文件路径、URL 或 Base64 |
| file_id | string | 否 | 文件 ID |

**请求示例**：

```json
{
    "action": "get_image",
    "params": {
        "file": "image_id_123"
    }
}
```

**响应示例**：

```json
{
    "status": "ok",
    "retcode": 0,
    "data": {
        "file": "/path/to/image",
        "url": "http://..."
    }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| file | string | 本地路径 |
| url | string | 下载 URL |
| file_size | string | 文件大小 |
| file_name | string | 文件名 |
| base64 | string | Base64 编码 |

### 3.3 获取语音

获取指定语音文件的信息，并支持格式转换。

**Action**: `get_record`

**请求参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| file | string | 否 | 文件路径、URL 或 Base64 |
| file_id | string | 否 | 文件 ID |
| out_format | string | 是 | 输出格式（如 mp3） |

**请求示例**：

```json
{
    "action": "get_record",
    "params": {
        "file": "record_id_123",
        "out_format": "mp3"
    }
}
```

**响应示例**：

```json
{
    "status": "ok",
    "retcode": 0,
    "data": {
        "file": "/path/to/record",
        "url": "http://..."
    }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| file | string | 本地路径 |
| url | string | 下载 URL |
| file_size | string | 文件大小 |
| file_name | string | 文件名 |
| base64 | string | Base64 编码 |

---

## 4. 系统接口

### 4.1 获取运行状态

获取 NapCat 的运行状态。

**Action**: `get_status`

**请求参数**：无

**请求示例**：

```json
{
    "action": "get_status",
    "params": {}
}
```

**响应示例**：

```json
{
    "status": "ok",
    "retcode": 0,
    "data": {
        "online": true,
        "good": true,
        "stat": {}
    }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| online | boolean | 是否在线 |
| good | boolean | 状态是否良好 |
| stat | string | 状态信息 |

### 4.2 设置输入状态

向对方发送正在输入状态。

**Action**: `set_input_status`

**请求参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| user_id | string | 是 | QQ 号 |
| event_type | number | 是 | 事件类型 |

**event_type 取值**：

| 值 | 说明 |
|----|------|
| 1 | 正在输入 |
| 2 | 停止输入 |

**请求示例**：

```json
{
    "action": "set_input_status",
    "params": {
        "user_id": "123456789",
        "event_type": 1
    }
}
```

**响应示例**：

```json
{
    "status": "ok",
    "retcode": 0,
    "data": {},
    "message": "",
    "wording": ""
}
```

---

## 通用错误码

| 错误码 | 说明 |
|--------|------|
| 0 | 成功 |
| 1400 | 请求参数错误或业务逻辑执行失败 |
| 1401 | 权限不足 |
| 1404 | 资源不存在 |

## 5. 上报事件

NapCat 会通过 WebSocket 连接主动上报各类事件。所有上报事件都是 JSON 格式。

### 5.1 事件格式

所有上报事件遵循以下格式：

```json
{
    "time": 1770180357,
    "self_id": 123456,
    "post_type": "事件类型",
    // 其他事件特定字段
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| time | number | 事件发生时间戳（秒） |
| self_id | number | Bot QQ 号 |
| post_type | string | 上报类型：`message`、`notice`、`request`、`meta_event`、`message_sent` |

---

### 5.2 元事件 (meta_event)

#### 5.2.1 生命周期事件 (lifecycle)

WebSocket 连接成功时上报。

**post_type**: `meta_event`
**meta_event_type**: `lifecycle`

**上报示例**：

```json
{
    "time": 1770180221,
    "self_id": 123456,
    "post_type": "meta_event",
    "meta_event_type": "lifecycle",
    "sub_type": "connect"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| meta_event_type | string | 元事件类型，固定为 `lifecycle` |
| sub_type | string | 生命周期子类型，`connect` 表示连接成功 |

#### 5.2.2 心跳事件 (heartbeat)

NapCat 定时上报心跳，表明 Bot 在线状态。

**post_type**: `meta_event`
**meta_event_type**: `heartbeat`

**上报示例**：

```json
{
    "time": 1770180250,
    "self_id": 123456,
    "post_type": "meta_event",
    "meta_event_type": "heartbeat",
    "status": {
        "online": true,
        "good": true
    },
    "interval": 30000
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| meta_event_type | string | 元事件类型，固定为 `heartbeat` |
| status.online | boolean | 是否在线 |
| status.good | boolean | 状态是否良好 |
| interval | number | 心跳间隔（毫秒） |

---

### 5.3 消息事件 (message)

#### 5.3.1 私聊消息 (private)

收到私聊消息时上报。

**post_type**: `message`
**message_type**: `private`

**上报示例**：

```json
{
    "self_id": 123456,
    "user_id": 1334642674,
    "time": 1770180357,
    "message_id": 100925776,
    "message_seq": 100925776,
    "real_id": 100925776,
    "real_seq": "839",
    "message_type": "private",
    "sender": {
        "user_id": 1334642674,
        "nickname": "栀暮",
        "card": ""
    },
    "raw_message": "你好啊",
    "font": 14,
    "sub_type": "friend",
    "message": "你好啊",
    "message_format": "string",
    "post_type": "message",
    "target_id": 1334642674
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| message_id | number | 消息 ID |
| message_seq | number | 消息序号 |
| message_type | string | 消息类型，`private` 表示私聊 |
| sender | object | 发送者信息 |
| sender.user_id | number | 发送者 QQ 号 |
| sender.nickname | string | 发送者昵称 |
| sender.card | string | 发送者群名片（私聊为空） |
| raw_message | string | 原始消息文本 |
| message | string/array | 消息内容（文本或消息段数组） |
| message_format | string | 消息格式，`string`、`array` |
| sub_type | string | 子类型：`friend`（好友）、`group`（群临时） |
| target_id | number | 接收者 QQ 号 |

#### 5.3.2 群聊消息 (group)

收到群聊消息时上报。

**post_type**: `message`
**message_type**: `group`

**上报示例**：

```json
{
    "self_id": 123456,
    "user_id": 654321,
    "time": 1770180400,
    "message_id": 100925777,
    "message_seq": 100925777,
    "real_id": 100925777,
    "real_seq": "840",
    "message_type": "group",
    "sender": {
        "user_id": 654321,
        "nickname": "昵称",
        "card": "群名片",
        "sex": "male",
        "age": 20,
        "area": "",
        "level": "1",
        "role": "admin",
        "title": ""
    },
    "raw_message": "大家好",
    "font": 14,
    "sub_type": "normal",
    "message": "大家好",
    "message_format": "string",
    "post_type": "message",
    "group_id": 123456
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| group_id | number | 群号 |
| message_type | string | 消息类型，`group` 表示群聊 |
| sender | object | 发送者信息 |
| sender.card | string | 群名片 |
| sender.role | string | 群角色：`owner`、`admin`、`member` |
| sub_type | string | 子类型：`normal`（普通消息） |

---

### 5.4 发送消息事件 (message_sent)

Bot 发送消息后会上报此事件，格式与消息事件类似，但 `post_type` 为 `message_sent`。

**post_type**: `message_sent`

---

### 5.5 通知事件 (notice)

#### 5.5.1 群成员增加 (group_increase)

有新成员入群时上报。

**post_type**: `notice`
**notice_type**: `group_increase`

**上报示例**：

```json
{
    "time": 1770180500,
    "self_id": 123456,
    "post_type": "notice",
    "notice_type": "group_increase",
    "sub_type": "approve",
    "group_id": 123456,
    "user_id": 654321,
    "operator_id": 123456
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| notice_type | string | 通知类型 |
| sub_type | string | `approve`（管理员同意）、`invite`（管理员邀请） |
| group_id | number | 群号 |
| user_id | number | 入群用户 QQ 号 |
| operator_id | number | 操作者 QQ 号 |

#### 5.5.2 群成员减少 (group_decrease)

有成员退群或被踢时上报。

**post_type**: `notice`
**notice_type**: `group_decrease`

**上报示例**：

```json
{
    "time": 1770180600,
    "self_id": 123456,
    "post_type": "notice",
    "notice_type": "group_decrease",
    "sub_type": "kick",
    "group_id": 123456,
    "user_id": 654321,
    "operator_id": 123456
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| sub_type | string | `leave`（主动退群）、`kick`（被踢）、`kick_me`（登录号被踢） |

#### 5.5.3 群消息撤回 (group_recall)

群消息被撤回时上报。

**post_type**: `notice`
**notice_type**: `group_recall`

**上报示例**：

```json
{
    "time": 1770180700,
    "self_id": 123456,
    "post_type": "notice",
    "notice_type": "group_recall",
    "group_id": 123456,
    "user_id": 654321,
    "message_id": 100925777,
    "operator_id": 654321
}
```

#### 5.5.4 私聊消息撤回 (friend_recall)

私聊消息被撤回时上报。

**post_type**: `notice`
**notice_type**: `friend_recall`

**上报示例**：

```json
{
    "time": 1770180800,
    "self_id": 123456,
    "post_type": "notice",
    "notice_type": "friend_recall",
    "user_id": 654321,
    "message_id": 100925778
}
```

#### 5.5.5 戳一戳 (notify.poke)

收到戳一戳事件时上报。

**post_type**: `notice`
**notice_type**: `notify`

**上报示例**：

```json
{
    "time": 1770180900,
    "self_id": 123456,
    "post_type": "notice",
    "notice_type": "notify",
    "sub_type": "poke",
    "user_id": 654321,
    "target_id": 123456,
    "group_id": 0
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | number | 发送者 QQ 号 |
| target_id | number | 被戳者 QQ 号 |
| group_id | number | 群号，私聊戳为 0 |

#### 5.5.6 群管理员变动 (group_admin)

群管理员设置发生变化时上报。

**post_type**: `notice`
**notice_type**: `group_admin`

**上报示例**：

```json
{
    "time": 1770181000,
    "self_id": 123456,
    "post_type": "notice",
    "notice_type": "group_admin",
    "sub_type": "set",
    "group_id": 123456,
    "user_id": 654321
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| sub_type | string | `set`（设置管理员）、`unset`（取消管理员） |

#### 5.5.7 群禁言 (group_ban)

群成员被禁言/解禁时上报。

**post_type**: `notice`
**notice_type**: `group_ban`

**上报示例**：

```json
{
    "time": 1770181100,
    "self_id": 123456,
    "post_type": "notice",
    "notice_type": "group_ban",
    "sub_type": "ban",
    "group_id": 123456,
    "user_id": 654321,
    "operator_id": 123456,
    "duration": 600
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| sub_type | string | `ban`（禁言）、`lift_ban`（解禁） |
| duration | number | 禁言时长（秒），仅禁言时有值 |

#### 5.5.8 群成员名片更新 (group_card)

群成员修改群名片时上报。

**post_type**: `notice`
**notice_type**: `group_card`

**上报示例**：

```json
{
    "time": 1770181200,
    "self_id": 123456,
    "post_type": "notice",
    "notice_type": "group_card",
    "group_id": 123456,
    "user_id": 654321,
    "card_new": "新名片",
    "card_old": "旧名片"
}
```

#### 5.5.9 群文件上传 (group_upload)

群成员上传文件时上报。

**post_type**: `notice`
**notice_type**: `group_upload`

**上报示例**：

```json
{
    "time": 1770181300,
    "self_id": 123456,
    "post_type": "notice",
    "notice_type": "group_upload",
    "group_id": 123456,
    "user_id": 654321,
    "file": {
        "id": "file_id_123",
        "name": "test.txt",
        "size": 1024,
        "busid": 0
    }
}
```

#### 5.5.10 好友添加 (friend_add)

添加好友成功时上报。

**post_type**: `notice`
**notice_type**: `friend_add`

**上报示例**：

```json
{
    "time": 1770181400,
    "self_id": 123456,
    "post_type": "notice",
    "notice_type": "friend_add",
    "user_id": 654321
}
```

#### 5.5.11 点赞 (notify.profile_like)

收到点赞时上报。

**post_type**: `notice`
**notice_type**: `notify`

**上报示例**：

```json
{
    "time": 1770181500,
    "self_id": 123456,
    "post_type": "notice",
    "notice_type": "notify",
    "sub_type": "profile_like",
    "user_id": 654321,
    "times": 1
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| times | number | 点赞次数 |

#### 5.5.12 输入状态更新 (notify.input_status)

对方正在输入时上报。

**post_type**: `notice`
**notice_type**: `notify`

**上报示例**：

```json
{
    "time": 1770181600,
    "self_id": 123456,
    "post_type": "notice",
    "notice_type": "notify",
    "sub_type": "input_status",
    "user_id": 654321,
    "group_id": 0,
    "typing": [
        {
            "user_id": 654321,
            "status": true
        }
    ]
}
```

---

### 5.6 请求事件 (request)

#### 5.6.1 加好友请求 (friend)

收到加好友请求时上报。

**post_type**: `request`
**request_type**: `friend`

**上报示例**：

```json
{
    "time": 1770181700,
    "self_id": 123456,
    "post_type": "request",
    "request_type": "friend",
    "user_id": 654321,
    "comment": "我是张三",
    "flag": "request_flag_123"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| comment | string | 验证消息 |
| flag | string | 请求标识，用于处理请求 |

#### 5.6.2 加群请求 (group.add)

有人申请加群时上报。

**post_type**: `request`
**request_type**: `group`
**sub_type**: `add`

**上报示例**：

```json
{
    "time": 1770181800,
    "self_id": 123456,
    "post_type": "request",
    "request_type": "group",
    "sub_type": "add",
    "group_id": 123456,
    "user_id": 654321,
    "comment": "请通过",
    "flag": "request_flag_456"
}
```

#### 5.6.3 邀请入群 (group.invite)

有人邀请 Bot 入群时上报。

**post_type**: `request`
**request_type**: `group`
**sub_type**: `invite`

**上报示例**：

```json
{
    "time": 1770181900,
    "self_id": 123456,
    "post_type": "request",
    "request_type": "group",
    "sub_type": "invite",
    "group_id": 123456,
    "user_id": 654321,
    "comment": "",
    "flag": "request_flag_789"
}
```

---

## 事件兼容性参考

以下事件为 NapCat V4 支持的主要上报事件：

| 事件分类 | 事件名 | 说明 |
|---------|--------|------|
| 元事件 | `meta_event.lifecycle` | 生命周期事件 |
| 元事件 | `meta_event.heartbeat` | 心跳事件 |
| 消息 | `message.private.friend` | 好友私聊消息 |
| 消息 | `message.private.group` | 群临时会话消息 |
| 消息 | `message.group.normal` | 群聊消息 |
| 消息发送 | `message_sent.private.friend` | 发送的好友消息 |
| 消息发送 | `message_sent.private.group` | 发送的临时消息 |
| 消息发送 | `message_sent.group.normal` | 发送的群消息 |
| 请求 | `request.friend` | 加好友请求 |
| 请求 | `request.group.add` | 加群请求 |
| 请求 | `request.group.invite` | 邀请入群 |
| 通知 | `notice.friend_add` | 好友添加成功 |
| 通知 | `notice.friend_recall` | 私聊消息撤回 |
| 通知 | `notice.group_admin` | 群管理员变动 |
| 通知 | `notice.group_ban` | 群禁言 |
| 通知 | `notice.group_card` | 群成员名片更新 |
| 通知 | `notice.group_decrease` | 群成员减少 |
| 通知 | `notice.group_increase` | 群成员增加 |
| 通知 | `notice.group_recall` | 群消息撤回 |
| 通知 | `notice.group_upload` | 群文件上传 |
| 通知 | `notice.notify.poke` | 戳一戳 |
| 通知 | `notice.notify.input_status` | 输入状态更新 |
| 通知 | `notice.notify.title` | 群成员头衔变更 |
| 通知 | `notice.notify.profile_like` | 点赞 |

---

## 注意事项

1. WebSocket 连接需要在 URL 中携带 `access_token` 进行认证
2. 所有接口请求都使用 JSON 格式
3. `echo` 字段可以用于关联请求和响应，会在响应中原样返回
4. 消息内容支持纯文本字符串或消息段数组格式
5. 文件路径可以是本地路径、URL 或 file:// 协议路径
6. 上报事件通过 WebSocket 连接主动推送，无需客户端轮询
7. `post_type` 是所有上报事件的必填字段，用于区分事件类型
8. 时间戳字段 `time` 为 Unix 时间戳（秒）
