import { Context } from 'cordis'
import { SmsService } from '@cordisjs/sms'
import z from 'schemastery'

export interface Config extends SmsService.Config {
  apiKey: string
  apiSecret: string
  from: string
  /** Logical template name → local template string (uses `{name}` placeholders). */
  templates?: Record<string, string>
}

export class VonageSmsService extends SmsService {
  static name = 'sms:vonage'

  static Config: z<Config> = z.object({
    apiKey: z.string().required().description('API Key。'),
    apiSecret: z.string().required().role('secret').description('API Secret。'),
    from: z.string().required().description('发送方名称或号码 (Sender ID)。'),
    templates: z.dict(String).default({}).description('模板映射（逻辑名 → 本地模板字符串, 使用 {变量名} 占位）。'),
  })

  constructor(ctx: Context, public config: Config) {
    super(ctx, config)
  }

  async sendText(phone: string, content: string) {
    this.ctx.logger.debug('send text: %s', content)
    const { apiKey, apiSecret, from } = this.config
    const res = await fetch('https://rest.nexmo.com/sms/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        api_secret: apiSecret,
        to: phone,
        from,
        text: content,
      }),
    })
    const data = await res.json() as any
    const message = data.messages?.[0]
    if (message?.status !== '0') {
      throw new Error(`Vonage error: ${message?.['error-text'] ?? 'unknown'}`)
    }
  }
}

export default VonageSmsService
