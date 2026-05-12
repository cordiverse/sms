import { Context } from 'cordis'
import { SmsService } from '@cordisjs/sms'
import z from 'schemastery'

export interface Config extends SmsService.Config {
  accountSid: string
  authToken: string
  from: string
  /** Logical template name → local template string (uses `{name}` placeholders). */
  templates?: Record<string, string>
}

export class TwilioSmsService extends SmsService {
  static name = 'sms:twilio'

  static Config: z<Config> = z.object({
    accountSid: z.string().required().description('Account SID。'),
    authToken: z.string().required().role('secret').description('Auth Token。'),
    from: z.string().required().description('发送方号码 (E.164 格式)。'),
    templates: z.dict(String).default({}).description('模板映射（逻辑名 → 本地模板字符串, 使用 {变量名} 占位）。'),
  })

  constructor(ctx: Context, public config: Config) {
    super(ctx, config)
  }

  async sendText(phone: string, content: string) {
    this.ctx.logger.debug('send text: %s', content)
    const { accountSid, authToken, from } = this.config
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: phone, From: from, Body: content }),
      },
    )
    if (!res.ok) {
      const err = await res.json() as any
      throw new Error(`Twilio error: ${err.message ?? res.statusText}`)
    }
  }
}

export default TwilioSmsService
