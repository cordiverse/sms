import { Context } from 'cordis'
import { SmsService } from '@cordisjs/sms'
import z from 'schemastery'

declare module 'cordis' {
  interface Events {
    'sms/mock/text'(phone: string, content: string): void
    'sms/mock/template'(phone: string, templateId: string, variables: Record<string, string>): void
  }
}

export interface Config extends SmsService.Config {}

export class MockSmsService extends SmsService {
  static name = 'sms:mock'

  static Config: z<Config> = z.object({})

  constructor(ctx: Context, public config: Config = {}) {
    super(ctx, config)
  }

  async sendText(phone: string, content: string) {
    this.ctx.logger.debug('send text: %s', content)
    this.ctx.emit('sms/mock/text', phone, content)
  }

  async sendTemplate(phone: string, templateId: string, variables: Record<string, string> = {}) {
    this.ctx.logger.debug('send template %s: %o', templateId, variables)
    this.ctx.emit('sms/mock/template', phone, templateId, variables)
  }
}

export default MockSmsService
