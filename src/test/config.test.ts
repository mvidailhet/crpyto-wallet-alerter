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
});
