const items = [
  ["/today", "Today"],
  ["/routines", "루틴"],
  ["/items", "우리집"],
  ["/history", "기록"],
  ["/settings", "설정"]
] as const;

export function BottomNav() {
  return (
    <nav className="bottomNav" aria-label="주요 메뉴">
      {items.map(([href, label]) => (
        <a key={href} href={href} className={href === "/today" ? "active" : undefined}>
          {label}
        </a>
      ))}
    </nav>
  );
}
