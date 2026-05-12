import { Context } from 'cordis'
import { createHmac, randomUUID } from 'node:crypto'
import { SmsService } from '@cordisjs/sms'
import z from 'schemastery'

export interface Config extends SmsService.Config {
  accessKeyId: string
  accessKeySecret: string
  signName: string
  /** Logical template name → Aliyun TemplateCode */
  templates: Record<string, string>
  endpoint?: string
}

export class AliyunSmsService extends SmsService {
  static name = 'sms:aliyun'

  static Config: z<Config> = z.object({
    accessKeyId: z.string().required().description('AccessKey ID。'),
    accessKeySecret: z.string().required().role('secret').description('AccessKey Secret。'),
    signName: z.string().required().description('短信签名名称。'),
    templates: z.dict(String).default({}).description('模板映射（逻辑名 → 阿里云 TemplateCode）。'),
    endpoint: z.string().default('https://dysmsapi.aliyuncs.com').description('API 端点。'),
  })

  constructor(ctx: Context, public config: Config) {
    super(ctx, config)
  }

  async sendTemplate(phone: string, templateId: string, variables: Record<string, string> = {}) {
    this.ctx.logger.debug('send template %s: %o', templateId, variables)
    const templateCode = this.config.templates[templateId]
    if (!templateCode) throw new Error(`Unknown SMS template: ${templateId}`)

    const {
      accessKeyId,
      accessKeySecret,
      signName,
      endpoint = 'https://dysmsapi.aliyuncs.com',
    } = this.config

    const params: Record<string, string> = {
      Action: 'SendSms',
      Version: '2017-05-25',
      Format: 'JSON',
      SignatureMethod: 'HMAC-SHA1',
      SignatureVersion: '1.0',
      SignatureNonce: randomUUID(),
      Timestamp: new Date().toISOString().replace(/\.\d{3}Z/, 'Z'),
      AccessKeyId: accessKeyId,
      PhoneNumbers: phone,
      SignName: signName,
      TemplateCode: templateCode,
      TemplateParam: JSON.stringify(variables),
    }

    const sorted = Object.keys(params).sort()
    const canonicalized = sorted.map((k) =>
      `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`,
    ).join('&')
    const stringToSign = `GET&${encodeURIComponent('/')}&${encodeURIComponent(canonicalized)}`
    const signature = createHmac('sha1', accessKeySecret + '&')
      .update(stringToSign)
      .digest('base64')

    params.Signature = signature
    const query = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')

    const res = await fetch(`${endpoint}/?${query}`)
    const data = await res.json() as any
    if (data.Code !== 'OK') {
      throw new Error(`Aliyun SMS error: ${data.Message ?? data.Code}`)
    }
  }
}

export default AliyunSmsService
