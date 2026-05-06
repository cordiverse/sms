import { Context } from 'cordis'
import { SmsService } from '@cordisjs/sms'
import z from 'schemastery'

export interface Config extends SmsService.Config {
  apiKey: string
  apiSecret: string
  from: string
}

export class VonageSmsService extends SmsService {
  static Config: z<Config> = z.object({
    apiKey: z.string().required().description('API Key。'),
    apiSecret: z.string().required().role('secret').description('API Secret。'),
    from: z.string().required().description('发送方名称或号码 (Sender ID)。'),
  })

  constructor(ctx: Context, public config: Config) {
    super(ctx, config)
  }

  async send(phone: string, content: string) {
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
