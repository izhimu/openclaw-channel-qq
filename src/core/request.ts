import { Logger as log } from "../utils/index.js"
import { setContextStatus, getContext, getConnection } from "./runtime.js"
import { handleGroupMessage, handlePrivateMessage, handlePokeEvent } from "./dispatch.js";
import {
  GetFileReq,
  GetFileResp,
  GetMsgReq,
  GetMsgResp,
  NapCatResp,
  SendMsgReq,
  SendMsgResp,
  SetInputStatusReq
} from "../types/index.js";
import { failResp } from "./connection.js"

/**
 * 事件监听
 * @param event
 */
export async function eventListener(event: any): Promise<void> {
  log.debug("request", `Received event: ${event.post_type}`);

  const context = getContext();

  if (!context) {
    log.warn("request", `No gateway context`);
    return;
  }

  const connection = getConnection();
  if (!connection) {
    log.warn("request", `No connection available`);
    return;
  }

  switch (event.post_type) {
    case "message":
      setContextStatus({
        lastInboundAt: Date.now(),
      })
      if (event.message_type === "group" && event.group_id) {
        await handleGroupMessage({
          time: event.time,
          self_id: event.self_id,
          message_id: event.message_id ?? 0,
          group_id: event.group_id,
          user_id: event.user_id,
          message: event.message ?? [],
          raw_message: event.raw_message ?? '',
          sender: event.sender,
        });
      } else if (event.message_type === "private") {
        await handlePrivateMessage({
          time: event.time,
          self_id: event.self_id,
          message_id: event.message_id ?? 0,
          user_id: event.user_id,
          message: event.message ?? [],
          raw_message: event.raw_message ?? '',
          sender: event.sender,
        });
      }
      break;

    case "notice":
      if (event.target_id) {
        const isPokeEvent =
          event.notice_type === "poke" ||
          (event.notice_type === "notify" && event.sub_type === "poke");

        if (isPokeEvent) {
          await handlePokeEvent({
            user_id: event.user_id,
            target_id: event.target_id,
            group_id: event.group_id,
            raw_info: event.raw_info,
          });
        }
      }
      break;

    default:
      log.debug("request", `Unhandled event type: ${event.post_type}`);
  }
}

/**
 * 发送消息
 * @param params
 */
export async function sendMsg(params: SendMsgReq): Promise<NapCatResp<SendMsgResp>> {
  const connection = getConnection();
  if (!connection) {
    log.warn("request", `No connection available`);
    return failResp();
  }
  return connection.sendRequest("send_msg", params)
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