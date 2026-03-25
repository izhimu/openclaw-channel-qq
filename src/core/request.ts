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
import { Logger as log } from "../utils/index.js"
import { createQQEventHandler } from "./event-handler.js";
import { sendRequest as connectionSendRequest } from "./connection.js"

/**
 * 事件监听
 */
export async function eventListener(account: QQAccount, event: NapCatEvent, handler: (msg: InboundMessage) => Promise<void>): Promise<void> {
  log.debug("request", `Received event: ${event.post_type}`);
  await createQQEventHandler(account, handler)(event);
}

/**
 * 发送消息
 */
export async function sendMsg(accountId: string, params: SendMsgReq): Promise<NapCatResp<SendMsgResp>> {
  return connectionSendRequest(accountId, "send_msg", params);
}

/**
 * 获取消息
 */
export async function getMsg(accountId: string, params: GetMsgReq): Promise<NapCatResp<GetMsgResp>> {
  return connectionSendRequest(accountId, "get_msg", params);
}

/**
 * 获取文件
 */
export async function getFile(accountId: string, params: GetFileReq): Promise<NapCatResp<GetFileResp>> {
  return connectionSendRequest(accountId, "get_file", params);
}

/**
 * 设置输入状态
 */
export async function setInputStatus(accountId: string, params: SetInputStatusReq): Promise<NapCatResp<void>> {
  return connectionSendRequest(accountId, "set_input_status", params);
}

/**
 * 获取状态
 */
export async function getStatus(accountId: string): Promise<NapCatResp<GetStatusResp>> {
  return connectionSendRequest(accountId, "get_status");
}

/**
 * 获取登录信息
 */
export async function getLoginInfo(accountId: string): Promise<NapCatResp<GetLoginInfoResp>> {
  return connectionSendRequest(accountId, "get_login_info");
}

/**
 * 获取好友列表
 */
export async function getFriendList(accountId: string): Promise<NapCatResp<GetFriendListResp[]>> {
  return connectionSendRequest(accountId, "get_friend_list");
}

/**
 * 获取群列表
 */
export async function getGroupList(accountId: string): Promise<NapCatResp<GetGroupListResp[]>> {
  return connectionSendRequest(accountId, "get_group_list");
}
