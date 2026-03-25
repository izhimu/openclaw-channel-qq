import type {
  GetFileReq,
  GetFileResp,
  GetMsgReq,
  GetMsgResp,
  GetStatusResp,
  GetLoginInfoResp,
  NapCatResp,
  SendMsgReq,
  SendMsgResp,
  SetInputStatusReq,
  GetFriendListResp,
  GetGroupListResp,
  NapCatEvent, QQAccount, InboundMessage, NapCatAction
} from "../types";
import pLimit from 'p-limit';
import { Logger as log } from "../utils/index.js"
import { getConnection } from "./runtime.js"
import { createQQEventHandler } from "./event-handler.js";
import { failResp } from "./connection.js"

/**
 * Rate limiter for sendMsg requests
 * Limits concurrent messages to prevent API throttling
 */
const sendMsgLimiter = pLimit(1);

/**
 * 通用请求执行器 - 统一处理连接检查
 */
function withConnection<T>(
  action: NapCatAction,
  params?: unknown,
  limiter?: (fn: () => Promise<NapCatResp<T>>) => Promise<NapCatResp<T>>
): Promise<NapCatResp<T>> {
  const connection = getConnection();
  if (!connection) {
    log.warn("request", "No connection available");
    return failResp();
  }

  const execute = (): Promise<NapCatResp<T>> => connection.sendRequest(action, params);
  return limiter ? limiter(execute) : execute();
}

/**
 * 事件监听
 * 使用统一的事件处理器处理所有事件
 */
export async function eventListener(account: QQAccount, event: NapCatEvent, handler: (msg: InboundMessage) => Promise<void>): Promise<void> {
  log.debug("request", `Received event: ${event.post_type}`);
  await createQQEventHandler(account, handler)(event);
}

/**
 * 发送消息（带限流）
 */
export async function sendMsg(params: SendMsgReq): Promise<NapCatResp<SendMsgResp>> {
  return withConnection("send_msg", params, (fn) => sendMsgLimiter(fn));
}

/**
 * 获取消息
 */
export async function getMsg(params: GetMsgReq): Promise<NapCatResp<GetMsgResp>> {
  return withConnection("get_msg", params);
}

/**
 * 获取文件
 */
export async function getFile(params: GetFileReq): Promise<NapCatResp<GetFileResp>> {
  return withConnection("get_file", params);
}

/**
 * 设置输入状态
 */
export async function setInputStatus(params: SetInputStatusReq): Promise<NapCatResp<void>> {
  return withConnection("set_input_status", params);
}

/**
 * 获取状态
 */
export async function getStatus(): Promise<NapCatResp<GetStatusResp>> {
  return withConnection("get_status");
}

/**
 * 获取登录信息
 */
export async function getLoginInfo(): Promise<NapCatResp<GetLoginInfoResp>> {
  return withConnection("get_login_info");
}

/**
 * 获取好友列表
 */
export async function getFriendList(): Promise<NapCatResp<GetFriendListResp[]>> {
  return withConnection("get_friend_list");
}

/**
 * 获取群列表
 */
export async function getGroupList(): Promise<NapCatResp<GetGroupListResp[]>> {
  return withConnection("get_group_list");
}