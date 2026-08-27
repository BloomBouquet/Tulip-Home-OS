"use client";

import { useEffect, useState } from "react";
import type { TodayResult } from "../../../../api/src/today/today-aggregator.ts";
import { TulipApiClient, TulipApiClientError } from "../../lib/tulip-api-client.ts";
import type { TodayCardViewModel } from "../../lib/today-view-model.ts";
import { createTodayViewModel } from "../../lib/today-view-model.ts";

function dueLabel(dueAt: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(dueAt));
}

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    weekday: "long"
  }).format(new Date(`${date}T12:00:00+09:00`));
}

function TaskCard({ card, overdue = false }: { card: TodayCardViewModel; overdue?: boolean }) {
  return (
    <article className="taskCard">
      <span className="checkButton" aria-hidden="true" />
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
  const [result, setResult] = useState<TodayResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = new TulipApiClient();
    client.today()
      .then(setResult)
      .catch((reason: unknown) => {
        if (reason instanceof TulipApiClientError && reason.status === 401) {
          window.location.assign("/login");
          return;
        }
        if (reason instanceof TulipApiClientError && reason.status === 404) {
          window.location.assign("/onboarding/home");
          return;
        }
        setError("오늘 할 일을 불러오지 못했어요.");
      });
  }, []);

  if (error) {
    return (
      <section className="todayPage">
        <aside className="warning">{error}</aside>
        <button className="addButton" type="button" onClick={() => window.location.reload()}>다시 불러오기</button>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="todayPage" aria-busy="true">
        <div className="taskSkeleton" />
        <div className="taskSkeleton" />
        <div className="taskSkeleton" />
      </section>
    );
  }

  const view = createTodayViewModel(result);
  return (
    <section className="todayPage">
      <header className="todayHeader">
        <div>
          <span className="eyebrow">{dateLabel(result.date)}</span>
          <h1>안녕하세요 👋</h1>
          <p>{view.headline}</p>
        </div>
        <span className="completionPill">{view.completedLabel}</span>
      </header>

      {view.warnings.map((warning) => <aside className="warning" key={warning}>{warning}</aside>)}

      {view.overdueCards.length > 0 && (
        <section className="taskSection">
          <div className="sectionHeading"><h2>먼저 확인해 주세요</h2><span>{view.overdueCards.length}개</span></div>
          <div className="taskList">{view.overdueCards.map((card) => <TaskCard card={card} overdue key={card.id} />)}</div>
        </section>
      )}

      <section className="taskSection">
        <div className="sectionHeading"><h2>오늘 할 일</h2><span>{view.todayCards.length}개</span></div>
        {view.todayCards.length > 0 ? (
          <div className="taskList">{view.todayCards.map((card) => <TaskCard card={card} key={card.id} />)}</div>
        ) : (
          <div className="emptyState">오늘 예정된 일이 없어요.</div>
        )}
      </section>
    </section>
  );
}
