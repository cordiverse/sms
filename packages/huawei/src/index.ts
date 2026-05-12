import { Context } from 'cordis'
import { createHash, randomBytes } from 'node:crypto'
import { SmsService } from '@cordisjs/sms'
import z from 'schemastery'

export interface Template {
  id: string
  variables: string[]
}

export interface Config extends SmsService.Config {
  appKey: string
  appSecret: string
  /** Channel number (通道号) allocated to the SMS signature, e.g. csms100000001 */
  sender: string
  /** Required only when the template type is 通用模板 */
  signature?: string
  /** Logical template name → {Huawei templateId, positional variable order} */
  templates: Record<string, Template>
  /** Default: https://smsapi.cn-north-4.myhuaweicloud.com:443 */
  endpoint?: string
  statusCallback?: string
}

export class HuaweiSmsService extends SmsService {
  static name = 'sms:huawei'

  static Config: z<Config> = z.object({
    appKey: z.string().required().description('App Key。'),
    appSecret: z.string().required().role('secret').description('App Secret。'),
    sender: z.string().required().description('签名通道号 (如 csms100000001)。'),
    signature: z.string().description('签名名称 (仅通用模板需要)。'),
    templates: z.dict(z.object({
      id: z.string().required().description('华为云模板 ID。'),
      variables: z.array(String).default([]).description('按位置匹配的变量名列表。'),
    })).default({}).description('模板映射。'),
    endpoint: z.string().default('https://smsapi.cn-north-4.myhuaweicloud.com:443').description('API 端点。'),
    statusCallback: z.string().description('状态回调地址。'),
  })

  constructor(ctx: Context, public config: Config) {
    super(ctx, config)
  }

  async sendTemplate(phone: string, templateId: string, variables: Record<string, string> = {}) {
    this.ctx.logger.debug('send template %s: %o', templateId, variables)
    const template = this.config.templates[templateId]
    if (!template) throw new Error(`Unknown SMS template: ${templateId}`)

    const {
      appKey,
      appSecret,
      sender,
      signature,
      endpoint = 'https://smsapi.cn-north-4.myhuaweicloud.com:443',
      statusCallback,
    } = this.config

    const paras = template.variables.map((v) => variables[v] ?? '')

    const nonce = randomBytes(16).toString('hex')
    const created = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
    const digest = createHash('sha256').update(nonce + created + appSecret).digest('hex')
    const passwordDigest = Buffer.from(digest).toString('base64')
    const wsse = `UsernameToken Username="${appKey}",PasswordDigest="${passwordDigest}",Nonce="${nonce}",Created="${created}"`

    const body: Record<string, string> = {
      from: sender,
      to: phone,
      templateId: template.id,
      templateParas: JSON.stringify(paras),
    }
    if (signature) body.signature = signature
    if (statusCallback) body.statusCallback = statusCallback

    const res = await fetch(`${endpoint}/sms/batchSendSms/v1`, {
      method: 'POST',
      headers: {
        'Authorization': 'WSSE realm="SDP",profile="UsernameToken",type="Appkey"',
        'X-WSSE': wsse,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams(body),
    })

    const data = await res.json() as any
    if (data.code !== '000000') {
      throw new Error(`Huawei Cloud SMS error: ${data.description ?? data.code}`)
    }
  }
}

export default HuaweiSmsService
