import { Context } from 'cordis'
import { createHash } from 'node:crypto'
import { SmsService } from '@cordisjs/sms'
import z from 'schemastery'

export interface Config extends SmsService.Config {
  smsUser: string
  smsKey: string
  /** Logical template name → SendCloud numeric templateId */
  templates: Record<string, number>
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
    templates: z.dict(z.number()).default({}).description('模板映射（逻辑名 → SendCloud templateId）。'),
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

  async sendTemplate(phone: string, name: string, variables: Record<string, string> = {}) {
    const templateId = this.config.templates[name]
    if (!templateId) throw new Error(`Unknown SMS template: ${name}`)

    const {
      smsUser,
      smsKey,
      hashAlgorithm = 'md5',
      endpoint = 'https://api.sendcloud.net/smsapi/send',
      msgType,
      sendRequestId,
    } = this.config

    const params: Record<string, string> = {
      smsUser,
      templateId: String(templateId),
      phone,
      vars: JSON.stringify(variables),
    }
    if (msgType !== undefined) params.msgType = String(msgType)
    if (sendRequestId) params.sendRequestId = sendRequestId

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
