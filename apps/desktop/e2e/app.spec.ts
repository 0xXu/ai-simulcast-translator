import { _electron as electron, expect, test } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("loads the built control and overlay windows", async () => {
  const app = await electron.launch({
    args: [desktopRoot],
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: "",
      MIMO_API_KEY: "",
      MIMO_BASE_URL: "",
      ASR_WORKER_DIR: join(desktopRoot, "../../workers/asr"),
    },
  });

  try {
    const control = await waitForWindowHash(app, "#control");
    const overlay = await waitForWindowHash(app, "#overlay");

    await expect(control.getByRole("button", { name: "开始采集" })).toBeVisible();
    await expect(control.getByText("等待采集系统音频")).toBeVisible();
    await expect(overlay.getByRole("status")).toBeVisible();
    await expect(overlay.getByText("上下文会让实时翻译逐步变得更准确。")).toBeVisible();
  } finally {
    await app.close();
  }
});

async function waitForWindowHash(
  app: ElectronApplication,
  hash: "#control" | "#overlay",
): Promise<Page> {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    for (const page of app.windows()) {
      const url = page.url();
      if (url.endsWith(hash)) {
        await page.waitForLoadState("domcontentloaded");
        return page;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timed out waiting for Electron window ${hash}`);
}
