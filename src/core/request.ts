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
  NapCatEvent, QQAccount, InboundMessage
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
 * 事件监听
 * 使用统一的事件处理器处理所有事件
 */
export async function eventListener(account: QQAccount, event: NapCatEvent, handler: (msg: InboundMessage) => Promise<void>): Promise<void> {
  log.debug("request", `Received event: ${event.post_type}`);
  await createQQEventHandler(account, handler)(event);
}

/**
 * 发送消息（带限流）
 * @param params
 */
export async function sendMsg(params: SendMsgReq): Promise<NapCatResp<SendMsgResp>> {
  const connection = getConnection();
  if (!connection) {
    log.warn("request", `No connection available`);
    return failResp();
  }

  // 使用限流器控制并发，避免触发 NapCat API 限流
  return sendMsgLimiter(() => connection.sendRequest("send_msg", params));
}

/**
 * 获取消息
 * @param params
 */
export async function getMsg(params: GetMsgReq): Promise<NapCatResp<GetMsgResp>> {
  const connection = getConnection();
  if (!connection) {
    log.warn("request", `No connection available`);
    return failResp();
  }
  return connection.sendRequest("get_msg", params)
}

/**
 * 获取文件
 * @param params
 */
export async function getFile(params: GetFileReq): Promise<NapCatResp<GetFileResp>> {
  const connection = getConnection();
  if (!connection) {
    log.warn("request", `No connection available`);
    return failResp();
  }
  return connection.sendRequest("get_file", params)
}

/**
 * 设置输入状态
 * @param params
 */
export async function setInputStatus(params: SetInputStatusReq): Promise<NapCatResp<void>> {
  const connection = getConnection();
  if (!connection) {
    log.warn("request", `No connection available`);
    return failResp();
  }
  return connection.sendRequest("set_input_status", params)
}

/**
 * 获取状态
 */
export async function getStatus(): Promise<NapCatResp<GetStatusResp>> {
  const connection = getConnection();
  if (!connection) {
    log.warn("request", `No connection available`);
    return failResp();
  }
  return connection.sendRequest("get_status")
}

/**
 * 获取登录信息
 */
export async function getLoginInfo(): Promise<NapCatResp<GetLoginInfoResp>> {
  const connection = getConnection();
  if (!connection) {
    log.warn("request", `No connection available`);
    return failResp();
  }
  return connection.sendRequest("get_login_info")
}

/**
 * 获取好友列表
 */
export async function getFriendList(): Promise<NapCatResp<GetFriendListResp[]>> {
  const connection = getConnection();
  if (!connection) {
    log.warn("request", `No connection available`);
    return failResp();
  }
  return connection.sendRequest("get_friend_list")
}

/**
 * 获取群列表
 */
export async function getGroupList(): Promise<NapCatResp<GetGroupListResp[]>> {
  const connection = getConnection();
  if (!connection) {
    log.warn("request", `No connection available`);
    return failResp();
  }
  return connection.sendRequest("get_group_list")
}