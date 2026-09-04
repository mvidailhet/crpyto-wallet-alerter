import { describe, expect, it, vi } from "vitest";

import { createTelegramAdapter, resolveAlertAdapters } from "../alerts/telegram-adapter.js";

describe("Telegram alert adapter", () => {
  it("posts alert text to the Telegram bot API for the configured chat", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const adapter = createTelegramAdapter({
      botToken: "123456:abc",
      chatId: "-1001234567890",
      fetchImpl,
    });

    await adapter.send({ subject: "trade-setup:x", text: "New trade setup x" });

    expect(adapter.channel).toBe("telegram");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/bot123456:abc/sendMessage");
    expect(init).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(init?.body))).toEqual({
      chat_id: "-1001234567890",
      text: "New trade setup x",
      disable_web_page_preview: true,
    });
  });

  it("throws when the Telegram API rejects the request", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("Too Many Requests", { status: 429 }));
    const adapter = createTelegramAdapter({
      botToken: "123456:abc",
      chatId: "-1001234567890",
      fetchImpl,
    });

    await expect(adapter.send({ subject: "s", text: "t" })).rejects.toThrow(
      "Telegram sendMessage failed with HTTP 429",
    );
  });

  it("resolves no adapters when Telegram is unconfigured", () => {
    expect(resolveAlertAdapters({ telegram: undefined })).toEqual([]);
  });

  it("resolves a Telegram adapter when credentials are configured", () => {
    const adapters = resolveAlertAdapters({
      telegram: { botToken: "123456:abc", chatId: "-1001234567890" },
    });
    expect(adapters.map((adapter) => adapter.channel)).toEqual(["telegram"]);
  });

  it("fails when alerts are required but no adapter is configured", () => {
    expect(() => resolveAlertAdapters({ telegram: undefined }, { requireAlerts: true })).toThrow(
      "No alert adapter is configured",
    );
  });
});
