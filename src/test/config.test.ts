import { describe, expect, it } from "vitest";

import { loadConfig } from "../config/env.js";

describe("application config", () => {
  it("loads optional simulation storage paths", () => {
    expect(
      loadConfig({
        SIMULATION_DATABASE_PATH: "C:\\Users\\trader\\wallet-alerter\\simulation.sqlite",
        SIMULATION_DATA_DIR: "D:\\wallet-alerter-data",
      }),
    ).toMatchObject({
      simulationDatabasePath: "C:\\Users\\trader\\wallet-alerter\\simulation.sqlite",
      simulationDataDirectory: "D:\\wallet-alerter-data",
    });
  });

  it("leaves Telegram alerts unconfigured when no credentials are present", () => {
    expect(loadConfig({}).telegram).toBeUndefined();
  });

  it("loads Telegram credentials when both the bot token and chat id are present", () => {
    expect(
      loadConfig({
        TELEGRAM_BOT_TOKEN: "123456:abc",
        TELEGRAM_CHAT_ID: "-1001234567890",
      }).telegram,
    ).toEqual({
      botToken: "123456:abc",
      chatId: "-1001234567890",
    });
  });

  it("rejects a partial Telegram configuration", () => {
    expect(() => loadConfig({ TELEGRAM_BOT_TOKEN: "123456:abc" })).toThrow(
      "TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set together",
    );
    expect(() => loadConfig({ TELEGRAM_CHAT_ID: "-1001234567890" })).toThrow(
      "TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set together",
    );
  });
});
