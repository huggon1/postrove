import { test, expect } from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChineseApplication } from "../support/application";

test("alarm schedules save rich rules, validate previews, pause, and survive restart", async ({}, info) => {
  test.setTimeout(120_000);
  const profile = await mkdtemp(join(tmpdir(), "postrove-schedules-"));
  await writeFile(
    join(profile, "advisors.json"),
    JSON.stringify({ version: 1, enabled: ["x-grok-zh"] }),
  );
  const launch = () =>
    launchChineseApplication({
      args: ["."],
      env: {
        ...process.env,
        POSTROVE_RUN_MODE: "review",
        POSTROVE_TEST_DATA: profile,
      },
    });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const snapshot = async () =>
      JSON.parse(await readFile(join(profile, "focus-search.json"), "utf8"));
    await page.getByRole("button", { name: "定时发送", exact: true }).click();
    await page
      .getByRole("button", { name: "新建定时消息", exact: true })
      .click();
    let editor = page.locator(".schedule-editor");
    await editor.getByLabel("名称", { exact: true }).fill("阅读简报");
    await editor
      .getByLabel("消息内容", { exact: true })
      .fill("这周有哪些值得阅读的长文章？");
    await editor.getByLabel("发送时间", { exact: true }).fill("08:30");
    await editor.getByRole("button", { name: "添加时间", exact: true }).click();
    await editor.getByLabel("发送时间 2", { exact: true }).fill("18:00");
    await editor.getByRole("button", { name: "周末", exact: true }).click();
    await editor.getByLabel("重复周数", { exact: true }).fill("2");
    await editor.locator("summary").click();
    await editor
      .getByLabel("时区", { exact: true })
      .selectOption("Asia/Shanghai");
    await editor.getByLabel("开始日期", { exact: true }).fill("2096-01-01");
    await editor
      .getByLabel("结束日期（可选）", { exact: true })
      .fill("2096-03-31");
    await expect(editor.locator(".schedule-preview time")).toHaveCount(3);
    const expected = await editor
      .locator(".schedule-preview time")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("datetime")),
      );
    await page.screenshot({
      path: info.outputPath("zh-weekly.png"),
      animations: "disabled",
    });
    await editor.getByLabel("发送时间 2", { exact: true }).fill("08:30");
    await expect(editor.getByRole("alert")).toHaveText("发送时间重复，请调整");
    await expect(
      editor.getByRole("button", { name: "保存定时消息" }),
    ).toBeDisabled();
    await editor.getByLabel("发送时间 2", { exact: true }).fill("18:00");
    for (const day of ["星期六", "星期日"])
      await editor.getByRole("button", { name: day, exact: true }).click();
    await expect(editor.getByRole("alert")).toHaveText("请选择发送星期");
    await editor.getByRole("button", { name: "周末", exact: true }).click();
    await editor
      .getByLabel("结束日期（可选）", { exact: true })
      .fill("2095-12-31");
    await expect(editor.getByRole("alert")).toHaveText(
      "结束日期应在开始日期当日或之后",
    );
    await editor
      .getByLabel("结束日期（可选）", { exact: true })
      .fill("2096-03-31");
    await editor.getByRole("button", { name: "保存定时消息" }).click();
    await expect(editor).toHaveCount(0);
    let saved = (await snapshot()).follows[0];
    expect(saved.schedule).toEqual({
      version: 2,
      cadence: "weekly",
      timeZone: "Asia/Shanghai",
      startDate: "2096-01-01",
      endDate: "2096-03-31",
      times: ["08:30", "18:00"],
      interval: 2,
      weekdays: [0, 6],
    });
    expect(saved.nextRunAt).toBe(expected[0]);
    await page.getByRole("switch", { name: "暂停定时发送" }).click();
    await expect(
      page.getByRole("switch", { name: "恢复定时发送" }),
    ).not.toBeChecked();
    expect((await snapshot()).follows[0].paused).toBe(true);
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.getByRole("button", { name: "定时发送", exact: true }).click();
    await expect(
      page.getByRole("switch", { name: "恢复定时发送" }),
    ).not.toBeChecked();
    await page.getByRole("switch", { name: "恢复定时发送" }).click();
    await expect(
      page.getByRole("switch", { name: "暂停定时发送" }),
    ).toBeChecked();
    await page.getByRole("button", { name: "编辑定时消息" }).click();
    editor = page.locator(".schedule-editor");
    await expect(editor.getByLabel("发送时间 2", { exact: true })).toHaveValue(
      "18:00",
    );
    await editor.getByLabel("重复", { exact: true }).selectOption("monthly");
    await editor.getByLabel("每月日期", { exact: true }).selectOption("31");
    await expect(editor.getByText("缺少该日期的月份跳过")).toBeVisible();
    await editor.getByLabel("按", { exact: true }).selectOption("weekday");
    await editor.getByLabel("第几个星期", { exact: true }).selectOption("-1");
    await editor.getByLabel("星期", { exact: true }).selectOption("5");
    await page.screenshot({
      path: info.outputPath("zh-monthly.png"),
      animations: "disabled",
    });
    await editor.getByRole("button", { name: "保存定时消息" }).click();
    await expect(editor).toHaveCount(0);
    saved = (await snapshot()).follows[0];
    expect(saved.schedule.monthly).toEqual({
      kind: "weekday",
      ordinal: -1,
      weekday: 5,
    });
    expect(saved.schedule.interval).toBe(2);
    await page.evaluate(() => window.postrove.saveLanguage("en"));
    await page.reload();
    await page
      .getByRole("button", { name: "Scheduled sends", exact: true })
      .click();
    await page.getByRole("button", { name: "Edit scheduled message" }).click();
    editor = page.locator(".schedule-editor");
    await editor.getByLabel("Repeat", { exact: true }).selectOption("interval");
    await editor.getByLabel("Repeat interval", { exact: true }).fill("90");
    await editor
      .getByLabel("Interval unit", { exact: true })
      .selectOption("minutes");
    await expect(editor.getByLabel("Send time 2", { exact: true })).toHaveCount(
      0,
    );
    await expect(editor.locator(".schedule-preview strong")).toHaveText(
      "Every 90 minutes",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(editor).toHaveCSS("opacity", "1");
    expect(
      await editor.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("en-interval-compact.png"),
      animations: "disabled",
    });
    await editor.getByRole("button", { name: "Save schedule" }).click();
    await expect(editor).toHaveCount(0);
    expect((await snapshot()).follows[0].schedule).toMatchObject({
      cadence: "interval",
      interval: 90,
      unit: "minutes",
      times: ["08:30"],
    });
    await page.getByRole("button", { name: "Edit scheduled message" }).click();
    await editor.getByLabel("Repeat", { exact: true }).selectOption("once");
    await editor.getByLabel("Date", { exact: true }).fill("2000-01-01");
    await expect(editor.getByRole("alert")).toHaveText(
      "No future sends. Adjust the dates or repeat rule.",
    );
    await editor.getByLabel("Date", { exact: true }).fill("2096-12-25");
    await expect(editor.locator(".schedule-preview time")).toHaveCount(1);
    await page.screenshot({
      path: info.outputPath("en-once-compact.png"),
      animations: "disabled",
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({
      path: info.outputPath("en-once-desktop.png"),
      animations: "disabled",
    });
    await editor.getByRole("button", { name: "Save schedule" }).click();
    await expect(editor).toHaveCount(0);
    expect((await snapshot()).follows[0].schedule).toEqual({
      version: 2,
      cadence: "once",
      timeZone: "Asia/Shanghai",
      startDate: "2096-12-25",
      times: ["08:30"],
    });
    expect(errors).toEqual([]);
    await info.attach("copy-admission", {
      contentType: "application/json",
      body: JSON.stringify(
        {
          existing: [
            "Name, message, recipients, save/cancel, weekdays, next send, pause/resume, ended",
          ],
          requiredControls: [
            "Repeat modes, time add/remove, day presets, interval, monthly position, zone, date bounds",
          ],
          requiredFeedback: {
            duplicate: "Repeated times",
            weekdays: "Empty weekly selection",
            dates: "End before start",
            expired: "No future occurrences",
            shortMonth: "Monthly day 29–31",
            preview: "Changed schedule inputs update the next occurrence dates",
          },
        },
        null,
        2,
      ),
    });
  } finally {
    await app.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test("all repeat editors fit both languages and widths, with a retained ended record", async ({}, info) => {
  test.setTimeout(120_000);
  const profile = await mkdtemp(join(tmpdir(), "postrove-schedule-layout-"));
  await writeFile(
    join(profile, "advisors.json"),
    JSON.stringify({ version: 1, enabled: ["x-grok-zh"] }),
  );
  await writeFile(
    join(profile, "focus-search.json"),
    JSON.stringify({
      version: 1,
      reports: [],
      follows: [
        {
          followId: crypto.randomUUID(),
          name: "Archived briefing",
          question: "A finished demo message",
          platforms: ["x"],
          advisorIds: ["x-grok-zh"],
          period: "all",
          paused: false,
          revision: 1,
          createdAt: "2000-01-01T00:00:00.000Z",
          updatedAt: "2000-01-01T00:00:00.000Z",
          nextRunAt: null,
          schedule: {
            version: 2,
            cadence: "once",
            timeZone: "Asia/Shanghai",
            startDate: "2000-01-01",
            times: ["09:00"],
          },
        },
      ],
    }),
  );
  const app = await launchChineseApplication({
    args: ["."],
    env: {
      ...process.env,
      POSTROVE_RUN_MODE: "review",
      POSTROVE_TEST_DATA: profile,
    },
  });
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const measurements: unknown[] = [];
    for (const language of ["zh-CN", "en"] as const) {
      await page.evaluate(
        (language) => window.postrove.saveLanguage(language),
        language,
      );
      await page.reload();
      const en = language === "en";
      await page
        .getByRole("button", {
          name: en ? "Scheduled sends" : "定时发送",
          exact: true,
        })
        .click();
      await expect(
        page.locator(".schedule-card").getByRole("switch"),
      ).toBeDisabled();
      await expect(page.locator(".schedule-card")).toContainText(
        en ? "Ended" : "已结束",
      );
      await page
        .getByRole("button", {
          name: en ? "New scheduled message" : "新建定时消息",
          exact: true,
        })
        .click();
      const editor = page.locator(".schedule-editor");
      for (const cadence of [
        "once",
        "daily",
        "weekly",
        "monthly",
        "interval",
      ]) {
        await editor
          .getByLabel(en ? "Repeat" : "重复", { exact: true })
          .selectOption(cadence);
        if (cadence === "once")
          await editor
            .getByLabel(en ? "Date" : "日期", { exact: true })
            .fill("2096-01-01");
        if (cadence === "monthly") {
          await editor
            .getByLabel(en ? "By" : "按", { exact: true })
            .selectOption("weekday");
          await editor
            .getByLabel(en ? "Weekday position" : "第几个星期", { exact: true })
            .selectOption("-1");
        }
        for (const width of [1280, 390]) {
          await page.setViewportSize({ width, height: 900 });
          await editor.locator(".schedule-rules").scrollIntoViewIfNeeded();
          const bounds = await editor.evaluate((node) => ({
            dialogOverflow: node.scrollWidth - node.clientWidth,
            columnsOverflow:
              node.querySelector(".schedule-editor-columns")!.scrollWidth -
              node.querySelector(".schedule-editor-columns")!.clientWidth,
            controls: [
              ...node.querySelectorAll("input,select,button,textarea"),
            ].map((control) => {
              const r = control.getBoundingClientRect();
              return { left: r.left, right: r.right };
            }),
            viewportWidth: innerWidth,
          }));
          expect(bounds.dialogOverflow).toBeLessThanOrEqual(1);
          expect(bounds.columnsOverflow).toBeLessThanOrEqual(1);
          for (const control of bounds.controls) {
            expect(control.left).toBeGreaterThanOrEqual(0);
            expect(control.right).toBeLessThanOrEqual(bounds.viewportWidth);
          }
          await expect(
            editor.getByRole("button", {
              name: en ? "Save schedule" : "保存定时消息",
              exact: true,
            }),
          ).toBeInViewport();
          await expect(editor).toHaveCSS("opacity", "1");
          await page.screenshot({
            path: info.outputPath(`${language}-${cadence}-${width}.png`),
            animations: "disabled",
          });
          measurements.push({ language, cadence, width, ...bounds });
        }
      }
      await editor
        .getByRole("button", { name: en ? "Cancel" : "取消", exact: true })
        .click();
    }
    expect(errors).toEqual([]);
    await info.attach("schedule-layout", {
      body: JSON.stringify(measurements),
      contentType: "application/json",
    });
  } finally {
    await app.close();
    await rm(profile, { recursive: true, force: true });
  }
});
