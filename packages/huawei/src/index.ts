import { Context } from 'cordis'
import { createHash, randomBytes } from 'node:crypto'
import { SmsService } from '@cordisjs/sms'
import z from 'schemastery'

export interface Config extends SmsService.Config {
  appKey: string
  appSecret: string
  /** Channel number (通道号) allocated to the SMS signature, e.g. csms100000001 */
  sender: string
  templateId: string
  /** Required only when templateId refers to a 通用模板 */
  signature?: string
  /** Default: https://smsapi.cn-north-4.myhuaweicloud.com:443 */
  endpoint?: string
  statusCallback?: string
}

export class HuaweiSmsService extends SmsService {
  static Config: z<Config> = z.object({
    appKey: z.string().required().description('App Key。'),
    appSecret: z.string().required().role('secret').description('App Secret。'),
    sender: z.string().required().description('签名通道号 (如 csms100000001)。'),
    templateId: z.string().required().description('模板 ID。'),
    signature: z.string().description('签名名称 (仅通用模板需要)。'),
    endpoint: z.string().default('https://smsapi.cn-north-4.myhuaweicloud.com:443').description('API 端点。'),
    statusCallback: z.string().description('状态回调地址。'),
  })

  constructor(ctx: Context, public config: Config) {
    super(ctx, config)
  }

  async send(phone: string, content: string) {
    const {
      appKey,
      appSecret,
      sender,
      templateId,
      signature,
      endpoint = 'https://smsapi.cn-north-4.myhuaweicloud.com:443',
      statusCallback,
    } = this.config

    const nonce = randomBytes(16).toString('hex')
    const created = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
    // PasswordDigest = Base64(hex(SHA256(Nonce + Created + Password)))
    const digest = createHash('sha256').update(nonce + created + appSecret).digest('hex')
    const passwordDigest = Buffer.from(digest).toString('base64')
    const wsse = `UsernameToken Username="${appKey}",PasswordDigest="${passwordDigest}",Nonce="${nonce}",Created="${created}"`

    const body: Record<string, string> = {
      from: sender,
      to: phone,
      templateId,
      templateParas: JSON.stringify([content]),
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
