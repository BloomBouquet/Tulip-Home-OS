export default function TodayLoading() {
  return (
    <section className="todayPage" aria-busy="true" aria-label="Today 불러오는 중">
      <header className="todayHeader">
        <div>
          <span className="eyebrow">TODAY</span>
          <h1>우리 집의 오늘을 불러오고 있어요.</h1>
        </div>
      </header>
      <div className="taskList">
        {[0, 1, 2].map((item) => <div className="taskSkeleton" key={item} />)}
      </div>
    </section>
  );
}
