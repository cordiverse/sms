import { Context } from 'cordis'
import { createHash } from 'node:crypto'
import { SmsService } from '@cordisjs/sms'
import z from 'schemastery'

export interface Config extends SmsService.Config {
  smsUser: string
  smsKey: string
  templateId: number
  /** Template variable name that holds the message content (default: "code") */
  varName?: string
  /** Signature hash algorithm (default: "md5") */
  hashAlgorithm?: 'md5' | 'sha256'
  /** Default: https://api.sendcloud.net/smsapi/send */
  endpoint?: string
  /** 0: SMS, 1: MMS; defaults to 0 (omitted) */
  msgType?: 0 | 1
  sendRequestId?: string
}

export class SendcloudSmsService extends SmsService {
  static Config: z<Config> = z.object({
    smsUser: z.string().required().description('SMS User。'),
    smsKey: z.string().required().role('secret').description('SMS Key。'),
    templateId: z.number().required().description('模板 ID。'),
    varName: z.string().default('code').description('模板中接收内容的变量名。'),
    hashAlgorithm: z.union([
      z.const('md5').required(),
      z.const('sha256').required(),
    ]).default('md5').description('签名哈希算法。'),
    endpoint: z.string().default('https://api.sendcloud.net/smsapi/send').description('API 端点。'),
    msgType: z.union([
      z.const(0).required(),
      z.const(1).required(),
    ]).description('消息类型: 0 普通短信, 1 彩信。'),
    sendRequestId: z.string().description('幂等键 (同 ID 在 1 小时内只处理一次)。'),
  })

  constructor(ctx: Context, public config: Config) {
    super(ctx, config)
  }

  async send(phone: string, content: string) {
    const {
      smsUser,
      smsKey,
      templateId,
      varName = 'code',
      hashAlgorithm = 'md5',
      endpoint = 'https://api.sendcloud.net/smsapi/send',
      msgType,
      sendRequestId,
    } = this.config

    const params: Record<string, string> = {
      smsUser,
      templateId: String(templateId),
      phone,
      vars: JSON.stringify({ [varName]: content }),
    }
    if (msgType !== undefined) params.msgType = String(msgType)
    if (sendRequestId) params.sendRequestId = sendRequestId

    // Sign: sorted "k=v" pairs joined by "&", wrapped as SMS_KEY + "&" + ... + "&" + SMS_KEY
    const paramStr = Object.keys(params).sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&')
    const signStr = `${smsKey}&${paramStr}&${smsKey}`
    params.signature = createHash(hashAlgorithm).update(signStr).digest('hex')

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    })

    const data = await res.json() as any
    if (!data.result) {
      throw new Error(`SendCloud SMS error: ${data.message ?? data.statusCode}`)
    }
  }
}

export default SendcloudSmsService
