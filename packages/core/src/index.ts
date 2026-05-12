import { Context, Service } from 'cordis'
declare module 'cordis' {
  interface Context {
    sms: SmsService
  }
}

/** Substitute `{name}` occurrences in `template` with `variables[name]`. */
export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => variables[key] ?? '')
}

export abstract class SmsService extends Service {
  static name = 'sms'

  constructor(ctx: Context, public config: SmsService.Config = {}) {
    super(ctx, 'sms')
  }

  /**
   * Send a registered template to the given phone number.
   *
   * The default implementation assumes a `templates: Record<string, string>` config
   * (single-string template per logical name) and a `sendText` method — it renders
   * the template locally and forwards to `sendText`. Drivers backed by a native
   * cloud template system (aliyun / tencent / huawei / sendcloud) override this.
   */
  async sendTemplate(phone: string, templateId: string, variables: Record<string, string> = {}): Promise<void> {
    this.ctx.logger.debug('send template %s: %o', templateId, variables)
    if (!this.sendText) {
      throw new Error(
        `${this.constructor.name} does not implement sendTemplate or sendText — override one of them.`,
      )
    }
    const template = (this.config as { templates?: Record<string, string> }).templates?.[templateId]
    if (typeof template !== 'string') {
      throw new Error(`Unknown SMS template: ${templateId}`)
    }
    await this.sendText(phone, renderTemplate(template, variables))
  }

  /** Send a raw text message. Only implemented by drivers whose backend allows free-form SMS content (Twilio, Vonage). */
  sendText?(phone: string, content: string): Promise<void>
}

export namespace SmsService {
  export interface Config {}
}

export default SmsService
