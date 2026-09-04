import type { TelegramConfig } from "../config/env.js";

export type AlertMessage = {
  subject: string;
  text: string;
};

export type AlertAdapter = {
  readonly channel: string;
  send(message: AlertMessage): Promise<void>;
};

export type CreateTelegramAdapterOptions = TelegramConfig & {
  fetchImpl?: typeof fetch;
};

export function createTelegramAdapter(options: CreateTelegramAdapterOptions): AlertAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = `https://api.telegram.org/bot${options.botToken}/sendMessage`;

  return {
    channel: "telegram",
    async send(message: AlertMessage) {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: options.chatId,
          text: message.text,
          disable_web_page_preview: true,
        }),
      });
      if (!response.ok) {
        throw new Error(`Telegram sendMessage failed with HTTP ${response.status}`);
      }
    },
  };
}

export type ResolveAlertAdaptersConfig = {
  telegram?: TelegramConfig;
};

export type ResolveAlertAdaptersOptions = {
  requireAlerts?: boolean;
  fetchImpl?: typeof fetch;
};

export function resolveAlertAdapters(
  config: ResolveAlertAdaptersConfig,
  options: ResolveAlertAdaptersOptions = {},
): AlertAdapter[] {
  const adapters: AlertAdapter[] = [];
  if (config.telegram) {
    adapters.push(createTelegramAdapter({ ...config.telegram, fetchImpl: options.fetchImpl }));
  }

  if (options.requireAlerts && adapters.length === 0) {
    throw new Error("No alert adapter is configured; set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID");
  }

  return adapters;
}
