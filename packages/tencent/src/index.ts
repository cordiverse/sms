import { Context } from 'cordis'
import { createHash, createHmac } from 'node:crypto'
import { SmsService } from '@cordisjs/sms'
import z from 'schemastery'

export interface Template {
  id: string
  variables: string[]
}

export interface Config extends SmsService.Config {
  secretId: string
  secretKey: string
  sdkAppId: string
  signName: string
  /** Logical template name → {Tencent TemplateId, positional variable order} */
  templates: Record<string, Template>
  region?: string
}

export class TencentSmsService extends SmsService {
  static Config: z<Config> = z.object({
    secretId: z.string().required().description('Secret ID。'),
    secretKey: z.string().required().role('secret').description('Secret Key。'),
    sdkAppId: z.string().required().description('短信应用 SDK AppId。'),
    signName: z.string().required().description('短信签名。'),
    templates: z.dict(z.object({
      id: z.string().required().description('腾讯云模板 ID。'),
      variables: z.array(String).default([]).description('按位置匹配的变量名列表 ({1} {2} ...)。'),
    })).default({}).description('模板映射。'),
    region: z.string().default('ap-guangzhou').description('地域。'),
  })

  constructor(ctx: Context, public config: Config) {
    super(ctx, config)
  }

  async sendTemplate(phone: string, name: string, variables: Record<string, string> = {}) {
    const template = this.config.templates[name]
    if (!template) throw new Error(`Unknown SMS template: ${name}`)

    const {
      secretId,
      secretKey,
      sdkAppId,
      signName,
      region = 'ap-guangzhou',
    } = this.config

    const paramSet = template.variables.map((v) => variables[v] ?? '')

    const service = 'sms'
    const host = 'sms.tencentcloudapi.com'
    const now = Math.floor(Date.now() / 1000)
    const date = new Date(now * 1000).toISOString().slice(0, 10)

    const phoneNumber = phone.startsWith('+') ? phone : `+86${phone}`

    const payload = JSON.stringify({
      SmsSdkAppId: sdkAppId,
      SignName: signName,
      TemplateId: template.id,
      TemplateParamSet: paramSet,
      PhoneNumberSet: [phoneNumber],
    })

    const payloadHash = createHash('sha256').update(payload).digest('hex')
    const canonicalRequest = [
      'POST',
      '/',
      '',
      `content-type:application/json; charset=utf-8\nhost:${host}\n`,
      'content-type;host',
      payloadHash,
    ].join('\n')

    const credentialScope = `${date}/${service}/tc3_request`
    const stringToSign = [
      'TC3-HMAC-SHA256',
      String(now),
      credentialScope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n')

    const secretDate = createHmac('sha256', `TC3${secretKey}`).update(date).digest()
    const secretService = createHmac('sha256', secretDate).update(service).digest()
    const secretSigning = createHmac('sha256', secretService).update('tc3_request').digest()
    const signature = createHmac('sha256', secretSigning).update(stringToSign).digest('hex')

    const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=content-type;host, Signature=${signature}`

    const res = await fetch(`https://${host}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Host': host,
        'X-TC-Action': 'SendSms',
        'X-TC-Version': '2021-01-11',
        'X-TC-Timestamp': String(now),
        'X-TC-Region': region,
        'Authorization': authorization,
      },
      body: payload,
    })

    const data = await res.json() as any
    const response = data.Response
    if (response?.Error) {
      throw new Error(`Tencent SMS error: ${response.Error.Message}`)
    }
    const status = response?.SendStatusSet?.[0]
    if (status && status.Code !== 'Ok') {
      throw new Error(`Tencent SMS error: ${status.Message}`)
    }
  }
}

export default TencentSmsService
