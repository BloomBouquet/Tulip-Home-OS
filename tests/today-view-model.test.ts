import test from "node:test";
import assert from "node:assert/strict";
import type { TodayResult } from "../apps/api/src/today/today-aggregator.ts";

async function loadViewModel() {
  try {
    return await import("../apps/web/src/lib/today-view-model.ts");
  } catch (error) {
    assert.fail(`today view model unavailable: ${String(error)}`);
  }
}

const result: TodayResult = {
  date: "2026-08-27",
  summary: { pending: 2, completed: 1 },
  warnings: ["쓰레기 일정 정보를 불러오지 못했어요."],
  items: [
    {
      id: "1",
      homeId: "home-1",
      sourceType: "ROUTINE",
      sourceId: "routine-1",
      title: "화장실 청소",
      dueAt: "2026-08-27T09:00:00.000Z",
      status: "PENDING"
    },
    {
      id: "2",
      homeId: "home-1",
      sourceType: "HOME_ITEM",
      sourceId: "item-1",
      title: "정수기 필터 확인",
      dueAt: "2026-08-27T12:00:00.000Z",
      status: "DONE",
      completedAt: "2026-08-27T11:00:00.000Z"
    }
  ]
};

test("builds the Today summary copy from pending count", async () => {
  const { createTodayViewModel } = await loadViewModel();
  const view = createTodayViewModel(result);
  assert.equal(view.headline, "오늘 집에서 해야 할 일 2개가 있어요.");
  assert.equal(view.completedLabel, "1개 완료");
});

test("maps source types to user-facing category labels", async () => {
  const { createTodayViewModel } = await loadViewModel();
  const view = createTodayViewModel(result);
  assert.deepEqual(view.cards.map((card: { category: string }) => card.category), ["루틴", "우리집"]);
});

test("preserves partial-data warnings for the UI", async () => {
  const { createTodayViewModel } = await loadViewModel();
  const view = createTodayViewModel(result);
  assert.deepEqual(view.warnings, result.warnings);
});

test("separates overdue and today cards for the Today screen", async () => {
  const { createTodayViewModel } = await loadViewModel();
  const view = createTodayViewModel({
    ...result,
    items: [
      {
        id: "overdue",
        homeId: "home-1",
        sourceType: "ROUTINE",
        sourceId: "old-routine",
        title: "밀린 청소",
        dueAt: "2026-08-26T10:00:00.000Z",
        status: "PENDING"
      },
      ...result.items
    ],
    summary: { pending: 3, completed: 1 }
  });

  assert.deepEqual(view.overdueCards.map((card: { title: string }) => card.title), ["밀린 청소"]);
  assert.deepEqual(view.todayCards.map((card: { title: string }) => card.title), ["화장실 청소"]);
});
