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
import { sendRequest } from "./connection.js"

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
export async function sendMsg(params: SendMsgReq): Promise<NapCatResp<SendMsgResp>> {
  return sendRequest("send_msg", params);
}

/**
 * 获取消息
 */
export async function getMsg(params: GetMsgReq): Promise<NapCatResp<GetMsgResp>> {
  return sendRequest("get_msg", params);
}

/**
 * 获取文件
 */
export async function getFile(params: GetFileReq): Promise<NapCatResp<GetFileResp>> {
  return sendRequest("get_file", params);
}

/**
 * 设置输入状态
 */
export async function setInputStatus(params: SetInputStatusReq): Promise<NapCatResp<void>> {
  return sendRequest("set_input_status", params);
}

/**
 * 获取状态
 */
export async function getStatus(): Promise<NapCatResp<GetStatusResp>> {
  return sendRequest("get_status");
}

/**
 * 获取登录信息
 */
export async function getLoginInfo(): Promise<NapCatResp<GetLoginInfoResp>> {
  return sendRequest("get_login_info");
}

/**
 * 获取好友列表
 */
export async function getFriendList(): Promise<NapCatResp<GetFriendListResp[]>> {
  return sendRequest("get_friend_list");
}

/**
 * 获取群列表
 */
export async function getGroupList(): Promise<NapCatResp<GetGroupListResp[]>> {
  return sendRequest("get_group_list");
}
