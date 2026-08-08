"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearPrivateSyncLink,
  createPrivateSyncLink,
  deleteCloudPlans,
  getPrivateSyncKey,
  getPrivateSyncUrl,
  importPrivateSyncLink,
  isSyncConfigured,
  loadCloudPlans,
  recoverPrivateSyncKey,
  saveCloudPlans,
} from "./sync-client";
import { updateTaskText } from "./task-utils";

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const MONTHS = [
  {
    year: 2026,
    month: 7,
    label: "七月",
    startDay: 29,
    endDay: 31,
    note: "启程",
    season: "SUMMER",
  },
  {
    year: 2026,
    month: 8,
    label: "八月",
    startDay: 1,
    endDay: 31,
    note: "盛夏",
    season: "SUMMER",
  },
  {
    year: 2026,
    month: 9,
    label: "九月",
    startDay: 1,
    endDay: 30,
    note: "收获",
    season: "AUTUMN",
  },
  {
    year: 2026,
    month: 10,
    label: "十月",
    startDay: 1,
    endDay: 31,
    note: "沉淀",
    season: "AUTUMN",
  },
  {
    year: 2026,
    month: 11,
    label: "十一月",
    startDay: 1,
    endDay: 30,
    note: "笃行",
    season: "AUTUMN",
  },
  {
    year: 2026,
    month: 12,
    label: "十二月",
    startDay: 1,
    endDay: 31,
    note: "圆满",
    season: "WINTER",
  },
];

const dateKey = (year, month, day) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const weekdayIndex = (year, month, day) => {
  const sundayFirst = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return (sundayFirst + 6) % 7;
};

function makeDays() {
  return MONTHS.flatMap((section) =>
    Array.from(
      { length: section.endDay - section.startDay + 1 },
      (_, offset) => {
        const day = section.startDay + offset;
        return {
          ...section,
          day,
          key: dateKey(section.year, section.month, day),
          weekday: WEEKDAYS[weekdayIndex(section.year, section.month, day)],
        };
      },
    ),
  );
}

const ALL_DAYS = makeDays();
const STORAGE_KEY = "daily-clear-calendar-2026";
const UPDATED_KEY = "daily-clear-calendar-2026-updated-at";

function localTodayKey() {
  const today = new Date();
  return dateKey(today.getFullYear(), today.getMonth() + 1, today.getDate());
}

function syncedStatusText(timestamp = Date.now()) {
  const time = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
  return `刚刚已同步 · ${time}`;
}

function completed(tasks = []) {
  return tasks.length > 0 && tasks.every((task) => task.done);
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="m3 8.3 3 3L13 4.8" />
    </svg>
  );
}

function ArrowIcon({ direction = "right" }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      style={{ transform: direction === "left" ? "rotate(180deg)" : undefined }}
    >
      <path d="m7.5 4 6 6-6 6" />
    </svg>
  );
}

function MonthSection({ month, plans, onSelect, todayKey }) {
  const firstWeekday = weekdayIndex(month.year, month.month, 1);
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstWeekday + 1;
    if (day < 1 || day > month.endDay) return null;
    if (day < month.startDay) return { muted: true, day };
    return {
      day,
      key: dateKey(month.year, month.month, day),
      weekday: WEEKDAYS[index % 7],
    };
  });

  return (
    <section className="month-section" aria-labelledby={`month-${month.month}`}>
      <header className="month-heading">
        <div>
          <span className="month-kicker">{month.note}</span>
          <h2 id={`month-${month.month}`}>
            <span>{String(month.month).padStart(2, "0")}</span>
            {month.label}
          </h2>
        </div>
        <p>2026 · {month.season}</p>
      </header>

      <div className="calendar-grid month-grid">
        {cells.map((cell, index) => {
          if (!cell) return <div className="calendar-cell blank" key={`blank-${index}`} />;
          if (cell.muted) {
            return (
              <div className="calendar-cell muted" key={`muted-${cell.day}`}>
                <span className="day-number">{cell.day}</span>
                <span className="out-of-range">区间外</span>
              </div>
            );
          }

          const tasks = plans[cell.key] || [];
          const isDone = completed(tasks);
          const finishedCount = tasks.filter((task) => task.done).length;
          const isToday = cell.key === todayKey;
          const relativeClass = isToday
            ? "is-today"
            : todayKey
              ? cell.key < todayKey
                ? "is-past"
                : "is-future"
              : "";

          return (
            <button
              className={`calendar-cell day-cell ${relativeClass} ${isDone ? "is-complete" : ""}`}
              type="button"
              key={cell.key}
              data-date={cell.key}
              onClick={() => onSelect(cell.key)}
              aria-current={isToday ? "date" : undefined}
              aria-label={`${month.month}月${cell.day}日 ${cell.weekday}${isToday ? "，今天" : ""}，${tasks.length}条计划`}
            >
              <span className="day-top">
                <span className="day-number">{String(cell.day).padStart(2, "0")}</span>
                {tasks.length > 0 && (
                  <span className="mini-progress">
                    {finishedCount}/{tasks.length}
                  </span>
                )}
              </span>
              <span className="day-body">
                {tasks.length === 0 ? (
                  <span className="add-hint">＋ 写计划</span>
                ) : (
                  <span className="task-preview">
                    {tasks.slice(0, 2).map((task) => (
                      <span className={task.done ? "done" : ""} key={task.id}>
                        <i>{task.done ? "✓" : ""}</i>
                        {task.text}
                      </span>
                    ))}
                    {tasks.length > 2 && <em>另 {tasks.length - 2} 项</em>}
                  </span>
                )}
              </span>
              {isDone && (
                <span className="stamp" aria-label="今日全清">
                  <strong>全清</strong>
                  <small>好样的</small>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function AgendaView({ plans, onSelect, todayKey }) {
  const anchorIndex = useMemo(() => {
    if (!todayKey) return 0;
    const firstUpcoming = ALL_DAYS.findIndex((day) => day.key >= todayKey);
    return firstUpcoming >= 0 ? firstUpcoming : Math.max(0, ALL_DAYS.length - 21);
  }, [todayKey]);

  const visibleDays = useMemo(
    () =>
      ALL_DAYS.filter((day, index) => {
        const isRecent = index >= anchorIndex && index < anchorIndex + 21;
        return isRecent || (plans[day.key] || []).length > 0;
      }),
    [anchorIndex, plans],
  );

  return (
    <section className="agenda-view" aria-label="近期计划清单">
      <header className="agenda-heading">
        <div>
          <span>近期 21 天</span>
          <h2>每日清单</h2>
        </div>
        <p>含其他已安排日期</p>
      </header>
      <div className="agenda-list">
        {visibleDays.map((day) => {
          const tasks = plans[day.key] || [];
          const finishedCount = tasks.filter((task) => task.done).length;
          const isDone = completed(tasks);
          const isToday = day.key === todayKey;
          return (
            <button
              className={`agenda-day ${isToday ? "is-today" : ""} ${isDone ? "is-complete" : ""}`}
              type="button"
              key={day.key}
              data-date={day.key}
              onClick={() => onSelect(day.key)}
              aria-current={isToday ? "date" : undefined}
              aria-label={`${day.month}月${day.day}日 ${day.weekday}${isToday ? "，今天" : ""}，${tasks.length}条计划`}
            >
              <span className="agenda-date">
                <strong>{String(day.day).padStart(2, "0")}</strong>
                <span>{day.month} 月 · {day.weekday}</span>
                {isToday && <em>今天</em>}
              </span>
              <span className="agenda-tasks">
                {tasks.length === 0 ? (
                  <span className="agenda-empty">暂无计划，点开添加</span>
                ) : (
                  <>
                    {tasks.slice(0, 3).map((task) => (
                      <span className={task.done ? "done" : ""} key={task.id}>
                        <i>{task.done ? "✓" : ""}</i>
                        {task.text}
                      </span>
                    ))}
                    {tasks.length > 3 && <small>另 {tasks.length - 3} 项</small>}
                  </>
                )}
              </span>
              <span className="agenda-progress">
                {tasks.length > 0 ? `${finishedCount}/${tasks.length}` : "＋"}
              </span>
              {isDone && <span className="agenda-stamp">全清</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function DayPanel({ day, plans, onClose, onSave, onNavigate }) {
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const inputRef = useRef(null);
  const editInputRef = useRef(null);
  const panelRef = useRef(null);
  const tasks = plans[day.key] || [];
  const allDone = completed(tasks);
  const dayIndex = ALL_DAYS.findIndex((item) => item.key === day.key);

  useEffect(() => {
    setEditingId(null);
    setEditingText("");
  }, [day.key]);

  useEffect(() => {
    if (editingId) editInputRef.current?.focus();
  }, [editingId]);

  useEffect(() => {
    const updateViewport = () => {
      const viewport = window.visualViewport;
      const panel = panelRef.current;
      if (!panel) return;
      panel.style.setProperty(
        "--panel-viewport-height",
        `${Math.round(viewport?.height || window.innerHeight)}px`,
      );
      panel.style.setProperty(
        "--panel-viewport-top",
        `${Math.round(viewport?.offsetTop || 0)}px`,
      );
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("scroll", updateViewport);
    return () => {
      window.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("scroll", updateViewport);
    };
  }, []);

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    document.body.classList.add("panel-open");
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.classList.remove("panel-open");
    };
  }, [onClose]);

  const addTask = (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSave(day.key, [
      ...tasks,
      { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, text, done: false },
    ]);
    setDraft("");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const toggleTask = (id) => {
    onSave(
      day.key,
      tasks.map((task) => (task.id === id ? { ...task, done: !task.done } : task)),
    );
  };

  const startEditing = (task) => {
    setEditingId(task.id);
    setEditingText(task.text);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingText("");
  };

  const saveEditing = (event, id) => {
    event.preventDefault();
    const text = editingText.trim();
    if (!text) return;
    onSave(day.key, updateTaskText(tasks, id, text));
    cancelEditing();
  };

  const removeTask = (id) => {
    if (editingId === id) cancelEditing();
    onSave(
      day.key,
      tasks.filter((task) => task.id !== id),
    );
  };

  return (
    <div className="panel-layer" role="presentation">
      <button className="panel-backdrop" onClick={onClose} aria-label="关闭计划面板" />
      <aside
        className="day-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="panel-title"
      >
        <div className="panel-rule" />
        <header className="panel-header">
          <div className="panel-date">
            <span>{day.year}</span>
            <strong>{String(day.day).padStart(2, "0")}</strong>
            <div>
              <h2 id="panel-title">{day.month} 月计划</h2>
              <p>{day.weekday} · 日期固定</p>
            </div>
          </div>
          <button className="close-button" type="button" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <div className="progress-block">
          <div>
            <span>今日完成度</span>
            <strong>
              {tasks.filter((task) => task.done).length} / {tasks.length}
            </strong>
          </div>
          <div className="progress-track">
            <span
              style={{
                width: tasks.length
                  ? `${(tasks.filter((task) => task.done).length / tasks.length) * 100}%`
                  : "0%",
              }}
            />
          </div>
        </div>

        <div className="task-list" aria-live="polite">
          {tasks.length === 0 && (
            <div className="empty-state">
              <span>✦</span>
              <h3>这一天还是一张白纸</h3>
              <p>写下第一件想完成的小事吧。</p>
            </div>
          )}
          {tasks.map((task, index) => (
            <div className={`task-row ${task.done ? "done" : ""}`} key={task.id}>
              <button
                className="check-button"
                type="button"
                onClick={() => toggleTask(task.id)}
                aria-label={`${task.done ? "取消完成" : "完成"}：${task.text}`}
              >
                {task.done && <CheckIcon />}
              </button>
              <span className="task-index">{String(index + 1).padStart(2, "0")}</span>
              {editingId === task.id ? (
                <form className="task-edit-form" onSubmit={(event) => saveEditing(event, task.id)}>
                  <input
                    ref={editInputRef}
                    value={editingText}
                    onChange={(event) => setEditingText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.stopPropagation();
                        cancelEditing();
                      }
                    }}
                    aria-label={`修改计划：${task.text}`}
                    maxLength={80}
                  />
                  <button type="submit" disabled={!editingText.trim()}>保存</button>
                  <button className="cancel" type="button" onClick={cancelEditing}>取消</button>
                </form>
              ) : (
                <>
                  <p>{task.text}</p>
                  <button
                    className="edit-button"
                    type="button"
                    onClick={() => startEditing(task)}
                    aria-label={`修改：${task.text}`}
                  >
                    修改
                  </button>
                  <button
                    className="delete-button"
                    type="button"
                    onClick={() => removeTask(task.id)}
                    aria-label={`删除：${task.text}`}
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <form className="add-task-form" onSubmit={addTask}>
          <span>＋</span>
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="添加一条计划…"
            aria-label="新计划"
            maxLength={80}
          />
          <button type="submit" disabled={!draft.trim()}>
            加入
          </button>
        </form>

        {allDone && (
          <div className="success-note">
            <span>✓</span>
            <p>
              <strong>今日全清，做得漂亮！</strong>
              日历上已经为你盖好章了。
            </p>
          </div>
        )}

        <footer className="panel-footer">
          <button
            type="button"
            disabled={dayIndex === 0}
            onClick={() => onNavigate(ALL_DAYS[dayIndex - 1]?.key)}
          >
            <ArrowIcon direction="left" /> 前一天
          </button>
          <span>
            {dayIndex + 1} / {ALL_DAYS.length}
          </span>
          <button
            type="button"
            disabled={dayIndex === ALL_DAYS.length - 1}
            onClick={() => onNavigate(ALL_DAYS[dayIndex + 1]?.key)}
          >
            后一天 <ArrowIcon />
          </button>
        </footer>
      </aside>
    </div>
  );
}

function PrivateLinkPanel({
  open,
  required,
  configured,
  onClose,
  hasLink,
  status,
  onCreate,
  onRestore,
  onCopy,
  onRotate,
  onDisconnect,
  onRetry,
}) {
  const [submitting, setSubmitting] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [restoreError, setRestoreError] = useState("");

  if (!open) return null;

  const rotate = async () => {
    setSubmitting(true);
    await onRotate();
    setSubmitting(false);
  };

  const restore = (event) => {
    event.preventDefault();
    try {
      onRestore(linkValue);
      setLinkValue("");
      setRestoreError("");
    } catch (error) {
      setRestoreError(error instanceof Error ? error.message : "私人链接无效");
    }
  };

  return (
    <div className="sync-layer" role="presentation">
      <button
        className="sync-backdrop"
        type="button"
        onClick={required ? undefined : onClose}
        aria-label={required ? "需要私人同步链接" : "关闭同步设置"}
      />
      <section className="sync-panel" role="dialog" aria-modal="true" aria-labelledby="sync-title">
        {!required && (
          <button className="sync-close" type="button" onClick={onClose} aria-label="关闭">
            ×
          </button>
        )}
        <span className="sync-kicker">PRIVATE LINK SYNC</span>
        <h2 id="sync-title">不用登录，一条私人链接同步所有设备</h2>
        {configured ? (
          hasLink ? (
            <>
              <p>
                当前设备已连接。请把完整私人链接复制到自己的手机或电脑，并在每台设备收藏。
              </p>
              <div className={`sync-message ${status.tone}`}>{status.text}</div>
              {(status.tone === "error" || status.tone === "offline") && (
                <button className="sync-retry-button" type="button" onClick={onRetry}>
                  {status.tone === "offline" ? "检查网络并重试" : "立即重试同步"}
                </button>
              )}
              <div className="sync-actions">
                <button type="button" onClick={onCopy}>复制我的私人链接</button>
                <small>不要把私人链接发给其他人；获得链接的人可以查看和修改计划。</small>
                <button className="secondary" type="button" onClick={rotate} disabled={submitting}>
                  {submitting ? "正在更换…" : "更换私人链接，让旧链接失效"}
                </button>
                <button className="disconnect-button" type="button" onClick={onDisconnect}>
                  此设备停止同步
                </button>
              </div>
            </>
          ) : (
            <>
              <p>
                如果这是已安装到桌面的日历，请粘贴原来的完整私人链接恢复同一份计划，不要重新创建。
              </p>
              <form onSubmit={restore}>
                <label htmlFor="private-link-input">恢复原来的私人链接</label>
                <input
                  id="private-link-input"
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  value={linkValue}
                  onChange={(event) => setLinkValue(event.target.value)}
                  placeholder="https://…/#sync=…"
                  aria-describedby={restoreError ? "private-link-error" : undefined}
                />
                <button type="submit" disabled={!linkValue.trim()}>恢复并同步原计划</button>
              </form>
              {restoreError && (
                <div className="sync-message error" id="private-link-error">{restoreError}</div>
              )}
              <div className="sync-divider"><span>确实没有旧链接</span></div>
              <div className="sync-actions">
                <button className="secondary" type="button" onClick={onCreate}>
                  创建一份新的私人日历
                </button>
                <small>新建会产生另一份独立云端日历，不会自动找回原计划。</small>
              </div>
              <div className={`sync-message ${status.tone}`}>{status.text}</div>
            </>
          )
        ) : (
          <div className="sync-not-configured">
            <strong>私有同步服务尚未连接</strong>
            <p>完成一次云数据库配置后即可使用；不需要创建网站账户或记密码。</p>
          </div>
        )}
      </section>
    </div>
  );
}

export default function CalendarPage() {
  const [plans, setPlans] = useState({});
  const [selectedKey, setSelectedKey] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [plansUpdatedAt, setPlansUpdatedAt] = useState(0);
  const [syncKey, setSyncKey] = useState("");
  const [syncConfigured, setSyncConfigured] = useState(null);
  const [configChecked, setConfigChecked] = useState(false);
  const [syncReady, setSyncReady] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncPromptDismissed, setSyncPromptDismissed] = useState(false);
  const [todayKey, setTodayKey] = useState("");
  const [mobileView, setMobileView] = useState("calendar");
  const syncInFlightRef = useRef(null);
  const lastAutomaticSyncRef = useRef(0);
  const [syncStatus, setSyncStatus] = useState({
    tone: "local",
    text: "正在检查同步服务…",
  });

  useEffect(() => {
    const refreshToday = () => setTodayKey(localTodayKey());
    refreshToday();
    const timer = window.setInterval(refreshToday, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const initializeLocalCalendar = async () => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) setPlans(JSON.parse(saved));
        setPlansUpdatedAt(Number(window.localStorage.getItem(UPDATED_KEY)) || 0);
        const recoveredKey = await recoverPrivateSyncKey();
        if (active) setSyncKey(recoveredKey);
      } catch {
        if (active) setPlans({});
      } finally {
        if (active) setLoaded(true);
      }
    };
    initializeLocalCalendar();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
    window.localStorage.setItem(UPDATED_KEY, String(plansUpdatedAt));
  }, [plans, plansUpdatedAt, loaded]);

  useEffect(() => {
    if (!loaded) return;
    let active = true;
    const initializeSync = async () => {
      const configured = await isSyncConfigured();
      if (!active) return;
      setSyncConfigured(configured);
      setConfigChecked(true);
      setSyncStatus({
        tone: "local",
        text: configured
          ? getPrivateSyncKey()
            ? "正在连接私人计划…"
            : "创建私人链接以同步"
          : "云同步待配置",
      });
    };

    initializeSync();
    return () => { active = false; };
  }, [loaded]);

  const recordSyncSuccess = useCallback(() => {
    const timestamp = Date.now();
    setSyncStatus({ tone: "synced", text: syncedStatusText(timestamp) });
  }, []);

  const reconcileCloud = useCallback(async (key, statusText = "正在核对云端…") => {
    if (!syncConfigured) return false;
    if (!navigator.onLine) {
      setSyncStatus({ tone: "offline", text: "离线，修改将等待上传" });
      return false;
    }
    if (syncInFlightRef.current) return syncInFlightRef.current;

    setSyncReady(false);
    setSyncStatus({ tone: "syncing", text: statusText });
    const operation = (async () => {
      try {
        const cloud = await loadCloudPlans(key);
        if (cloud && cloud.updatedAt > plansUpdatedAt) {
          setPlans(cloud.plans);
          setPlansUpdatedAt(cloud.updatedAt);
        } else if (!cloud || plansUpdatedAt > cloud.updatedAt) {
          const updatedAt = plansUpdatedAt || Date.now();
          await saveCloudPlans(key, plans, updatedAt);
          if (!plansUpdatedAt) setPlansUpdatedAt(updatedAt);
        }
        setSyncReady(true);
        recordSyncSuccess();
        return true;
      } catch (error) {
        setSyncStatus({
          tone: navigator.onLine ? "error" : "offline",
          text: navigator.onLine
            ? "同步失败，点此重试"
            : "离线，修改将等待上传",
        });
        return false;
      }
    })();

    syncInFlightRef.current = operation;
    try {
      return await operation;
    } finally {
      syncInFlightRef.current = null;
    }
  }, [plans, plansUpdatedAt, recordSyncSuccess, syncConfigured]);

  useEffect(() => {
    if (!loaded || !syncKey || !syncConfigured) {
      setSyncReady(false);
      if (configChecked && syncConfigured && !syncKey) {
        setSyncStatus({ tone: "local", text: "创建私人链接以同步" });
      }
      return;
    }
    reconcileCloud(syncKey);
    // Reconcile once after the local calendar and private link are ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, syncKey, syncConfigured]);

  useEffect(() => {
    if (!loaded || !syncReady || !syncKey || !plansUpdatedAt) return;
    if (!navigator.onLine) {
      setSyncStatus({ tone: "offline", text: "离线，修改将等待上传" });
      return;
    }
    setSyncStatus({ tone: "syncing", text: "正在同步…" });
    const timer = window.setTimeout(async () => {
      try {
        await saveCloudPlans(syncKey, plans, plansUpdatedAt);
        recordSyncSuccess();
      } catch (error) {
        setSyncStatus({
          tone: navigator.onLine ? "error" : "offline",
          text: navigator.onLine
            ? "同步失败，点此重试"
            : "离线，修改将等待上传",
        });
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [plans, plansUpdatedAt, syncKey, syncReady, loaded, recordSyncSuccess]);

  useEffect(() => {
    if (!loaded || !syncKey || !syncConfigured) return;

    const runAutomaticSync = (message, force = false) => {
      if (document.visibilityState === "hidden") return;
      const now = Date.now();
      if (!force && now - lastAutomaticSyncRef.current < 1_500) return;
      lastAutomaticSyncRef.current = now;
      void reconcileCloud(syncKey, message);
    };

    const handleOnline = () => {
      setSyncStatus({ tone: "syncing", text: "网络已恢复，正在同步…" });
      runAutomaticSync("网络已恢复，正在核对云端…", true);
    };
    const handleOffline = () => {
      setSyncStatus({ tone: "offline", text: "离线，修改将等待上传" });
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        runAutomaticSync("正在检查其他设备的更新…");
      }
    };
    const handleFocus = () => runAutomaticSync("正在检查其他设备的更新…");

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    if (!navigator.onLine) handleOffline();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loaded, reconcileCloud, syncConfigured, syncKey]);

  const selectedDay = useMemo(
    () => ALL_DAYS.find((day) => day.key === selectedKey),
    [selectedKey],
  );

  const summary = useMemo(() => {
    const plannedDays = ALL_DAYS.filter((day) => (plans[day.key] || []).length > 0);
    const completedDays = plannedDays.filter((day) => completed(plans[day.key]));
    const taskCount = Object.values(plans).reduce((sum, list) => sum + list.length, 0);
    return { planned: plannedDays.length, completed: completedDays.length, taskCount };
  }, [plans]);

  const saveDay = (key, tasks) => {
    setPlansUpdatedAt(Date.now());
    setPlans((current) => {
      const next = { ...current };
      if (tasks.length === 0) delete next[key];
      else next[key] = tasks;
      return next;
    });
  };

  const createSyncLink = () => {
    const key = createPrivateSyncLink();
    setSyncKey(key);
    setSyncOpen(false);
    setSyncStatus({ tone: "syncing", text: "正在创建私人计划…" });
  };

  const restoreSyncLink = (value) => {
    const key = importPrivateSyncLink(value);
    setSyncKey(key);
    setSyncPromptDismissed(false);
    setSyncOpen(false);
    setSyncStatus({ tone: "syncing", text: "正在恢复原来的私人计划…" });
  };

  const copySyncLink = async () => {
    try {
      await navigator.clipboard.writeText(getPrivateSyncUrl());
      setSyncStatus({ tone: "synced", text: "私人链接已复制" });
    } catch {
      setSyncStatus({ tone: "error", text: "复制失败，请复制浏览器完整地址" });
    }
  };

  const rotateSyncLink = async () => {
    if (!syncKey) return;
    setSyncStatus({ tone: "syncing", text: "正在停用旧链接…" });
    try {
      await deleteCloudPlans(syncKey);
      const nextKey = createPrivateSyncLink();
      setSyncKey(nextKey);
      setSyncOpen(false);
      setSyncStatus({ tone: "syncing", text: "正在启用新链接…" });
    } catch (error) {
      setSyncStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "更换链接失败",
      });
    }
  };

  const disconnectSync = () => {
    clearPrivateSyncLink();
    setSyncKey("");
    setSyncReady(false);
    setSyncOpen(false);
    setSyncStatus({ tone: "local", text: "此设备仅本机保存" });
  };

  const retrySync = () => {
    if (!syncKey) return;
    void reconcileCloud(syncKey, "正在重新同步…");
  };

  const scrollToToday = () => {
    if (!todayKey || !ALL_DAYS.some((day) => day.key === todayKey)) return;
    const selector = mobileView === "list"
      ? `.agenda-day[data-date="${todayKey}"]`
      : `.day-cell[data-date="${todayKey}"]`;
    document.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <main>
      <header className="hero">
        <div className="eyebrow">
          <span />
          2026 · SEASON PLANNER
        </div>
        <div className="hero-main">
          <div>
            <h1>
              把日子，
              <br />
              <em>一格一格</em>过好。
            </h1>
            <p>从盛夏到岁末，写下每一天的小目标。逐条完成，等一枚认真生活的印章。</p>
          </div>
          <div className="date-window">
            <span>固定计划周期</span>
            <strong>07.29 — 12.31</strong>
            <small>共 {ALL_DAYS.length} 天 · 日期与星期已锁定</small>
            <button className="sync-button" type="button" onClick={() => setSyncOpen(true)}>
              <i className={syncStatus.tone} />
              {syncStatus.text}
            </button>
          </div>
        </div>

        <div className="summary-strip">
          <div>
            <span className="summary-number">{String(summary.planned).padStart(2, "0")}</span>
            <span>已安排天数</span>
          </div>
          <div>
            <span className="summary-number">{String(summary.taskCount).padStart(2, "0")}</span>
            <span>计划总数</span>
          </div>
          <div className="accent">
            <span className="summary-number">{String(summary.completed).padStart(2, "0")}</span>
            <span>全清印章</span>
          </div>
          <p>
            <i /> 点击任意日期
            <br />
            查看或添加当日计划
          </p>
        </div>
      </header>

      <div className={`calendar-shell view-${mobileView}`}>
        <div className="mobile-view-toolbar" aria-label="手机视图切换">
          <div>
            <button
              type="button"
              className={mobileView === "calendar" ? "active" : ""}
              aria-pressed={mobileView === "calendar"}
              onClick={() => setMobileView("calendar")}
            >
              日历
            </button>
            <button
              type="button"
              className={mobileView === "list" ? "active" : ""}
              aria-pressed={mobileView === "list"}
              onClick={() => setMobileView("list")}
            >
              清单
            </button>
          </div>
          <button
            type="button"
            className="today-jump"
            onClick={scrollToToday}
            disabled={!ALL_DAYS.some((day) => day.key === todayKey)}
          >
            回到今天
          </button>
        </div>

        <div className="calendar-view">
          <div className="weekday-wrap">
            <div className="calendar-grid weekday-row">
              {WEEKDAYS.map((day, index) => (
                <div className={index > 4 ? "weekend" : ""} key={day}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{day}</strong>
                </div>
              ))}
            </div>
          </div>

          {MONTHS.map((month) => (
            <MonthSection
              key={month.month}
              month={month}
              plans={plans}
              onSelect={setSelectedKey}
              todayKey={todayKey}
            />
          ))}
        </div>

        <AgendaView
          plans={plans}
          onSelect={setSelectedKey}
          todayKey={todayKey}
        />
      </div>

      <footer className="page-footer">
        <span>DAILY CLEAR © 2026</span>
        <p>愿每一个认真完成的日子，都留下清晰的回声。</p>
        <span>07.29 — 12.31</span>
      </footer>

      {selectedDay && (
        <DayPanel
          day={selectedDay}
          plans={plans}
          onClose={() => setSelectedKey(null)}
          onSave={saveDay}
          onNavigate={setSelectedKey}
        />
      )}

      <PrivateLinkPanel
        open={
          syncOpen ||
          Boolean(syncConfigured && configChecked && !syncKey && !syncPromptDismissed)
        }
        required={false}
        configured={Boolean(syncConfigured)}
        onClose={() => {
          setSyncOpen(false);
          setSyncPromptDismissed(true);
        }}
        hasLink={Boolean(syncKey)}
        status={syncStatus}
        onCreate={createSyncLink}
        onRestore={restoreSyncLink}
        onCopy={copySyncLink}
        onRotate={rotateSyncLink}
        onDisconnect={disconnectSync}
        onRetry={retrySync}
      />
    </main>
  );
}
