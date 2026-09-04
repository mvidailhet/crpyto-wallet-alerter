import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("Windows startup setup", () => {
  it("registers the live monitor with configurable local paths and logs", async () => {
    const script = await readFile("scripts/register-windows-monitor.ps1", "utf8");
    const envExample = await readFile(".env.example", "utf8");
    const readme = await readFile("README.md", "utf8");

    expect(script).toContain("Register-ScheduledTask");
    expect(script).toContain("New-ScheduledTaskTrigger -AtStartup");
    expect(script).toContain("New-ScheduledTaskTrigger -AtLogOn");
    expect(script).toContain("SIMULATION_DATABASE_PATH");
    expect(script).toContain("SIMULATION_DATA_DIR");
    expect(script).toContain("MONITOR_LOG_DIR");
    expect(script).toContain("$PSScriptRoot");
    expect(script).not.toMatch(/[A-Z]:\\\\Users\\\\/);

    expect(envExample).toContain("MONITOR_LOG_DIR=logs");
    expect(readme).toContain("scripts\\register-windows-monitor.ps1");
    expect(readme).toContain("Get-ScheduledTask -TaskName RobinhoodWalletAlerterMonitor");
  });
});
