import type { TodayResult } from "../../../../api/src/today/today-aggregator.ts";
import type { TodayCardViewModel } from "../../lib/today-view-model.ts";
import { createTodayViewModel } from "../../lib/today-view-model.ts";

const preview: TodayResult = {
  date: "2026-08-27",
  summary: { pending: 4, completed: 1 },
  warnings: [],
  items: [
    {
      id: "waste-1",
      homeId: "preview-home",
      sourceType: "WASTE",
      sourceId: "waste-recycling",
      title: "재활용품 배출",
      dueAt: "2026-08-27T20:00:00+09:00",
      status: "PENDING"
    },
    {
      id: "routine-1",
      homeId: "preview-home",
      sourceType: "ROUTINE",
      sourceId: "routine-bathroom",
      title: "화장실 청소",
      dueAt: "2026-08-27T19:00:00+09:00",
      status: "PENDING"
    },
    {
      id: "item-1",
      homeId: "preview-home",
      sourceType: "HOME_ITEM",
      sourceId: "item-filter",
      title: "정수기 필터 확인",
      dueAt: "2026-08-26T21:00:00+09:00",
      status: "PENDING"
    },
    {
      id: "routine-2",
      homeId: "preview-home",
      sourceType: "ROUTINE",
      sourceId: "routine-bedding",
      title: "침구 세탁",
      dueAt: "2026-08-27T18:00:00+09:00",
      status: "PENDING"
    },
    {
      id: "routine-done",
      homeId: "preview-home",
      sourceType: "ROUTINE",
      sourceId: "routine-ventilation",
      title: "환기하기",
      dueAt: "2026-08-27T08:00:00+09:00",
      status: "DONE",
      completedAt: "2026-08-27T08:10:00+09:00"
    }
  ]
};

function dueLabel(dueAt: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(dueAt));
}

function TaskCard({ card, overdue = false }: { card: TodayCardViewModel; overdue?: boolean }) {
  return (
    <article className="taskCard">
      <button className="checkButton" aria-label={`${card.title} 완료`} />
      <div className="taskBody">
        <span className="taskCategory">{card.category}</span>
        <strong>{card.title}</strong>
        <span className="taskMeta">{overdue ? "예정일이 지났어요" : `오늘 ${dueLabel(card.dueAt)}`}</span>
      </div>
      <span className="chevron" aria-hidden="true">›</span>
    </article>
  );
}

export default function TodayPage() {
  const view = createTodayViewModel(preview);

  return (
    <section className="todayPage">
      <header className="todayHeader">
        <div>
          <span className="eyebrow">THURSDAY · 08.27</span>
          <h1>안녕하세요 👋</h1>
          <p>{view.headline}</p>
        </div>
        <span className="completionPill">{view.completedLabel}</span>
      </header>

      {view.warnings.map((warning) => (
        <aside className="warning" key={warning}>{warning}</aside>
      ))}

      {view.overdueCards.length > 0 && (
        <section className="taskSection">
          <div className="sectionHeading">
            <h2>먼저 확인해 주세요</h2>
            <span>{view.overdueCards.length}개</span>
          </div>
          <div className="taskList">
            {view.overdueCards.map((card) => <TaskCard card={card} overdue key={card.id} />)}
          </div>
        </section>
      )}

      <section className="taskSection">
        <div className="sectionHeading">
          <h2>오늘 할 일</h2>
          <span>{view.todayCards.length}개</span>
        </div>
        {view.todayCards.length > 0 ? (
          <div className="taskList">
            {view.todayCards.map((card) => <TaskCard card={card} key={card.id} />)}
          </div>
        ) : (
          <div className="emptyState">오늘 예정된 일이 없어요.</div>
        )}
      </section>

      <button className="addButton">+ 할 일 추가</button>
      <p className="previewNote">현재 화면은 API 연결 전 개발 미리보기 데이터입니다.</p>
    </section>
  );
}
