import "../styles/global.css";
import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Archive, FileText, Search, Settings, Sparkles, TimerReset } from "lucide-react";
import { AppHeader } from "../components/AppHeader";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { MeetingCard } from "../components/MeetingCard";
import { Notice } from "../components/Notice";
import { deleteMeeting, listMeetings, saveMeeting } from "../services/meetingStorage";
import { getSettings } from "../services/settingsStorage";
import type { MeetingRecord } from "../types/meeting";
import { downloadMarkdown } from "../utils/downloadMarkdown";
import { getErrorMessage } from "../utils/errors";
import { formatDuration } from "../utils/formatDuration";
import { setLocale, t } from "../services/i18n";

const inputClass = "field-control";

function MeetingHistory() {
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      setMeetings(await listMeetings());
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    }
  }

  useEffect(() => {
    getSettings()
      .then((s) => {
        setLocale(s.locale);
      })
      .catch(() => undefined);
    void load();
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return meetings;
    }
    return meetings.filter((meeting) =>
      [meeting.title, meeting.summary, meeting.transcript.text, meeting.model].some((value) => value.toLowerCase().includes(normalized))
    );
  }, [meetings, query]);
  const summarizedCount = meetings.filter((meeting) => meeting.status === "summarized").length;
  const totalDuration = meetings.reduce((sum, meeting) => sum + meeting.durationSeconds, 0);

  async function handleDelete(meeting: MeetingRecord) {
    await deleteMeeting(meeting.id);
    await load();
  }

  async function handleRename(meeting: MeetingRecord, newTitle: string) {
    await saveMeeting({ ...meeting, title: newTitle });
    await load();
  }

  return (
    <main className="app-page">
      <div className="app-container">
        <AppHeader
          title={t("meeting.history.title")}
          description={t("meeting.history.description")}
          actions={
            <Button variant="secondary" icon={<Settings size={16} />} onClick={() => chrome.runtime.openOptionsPage()}>
              {t("settings")}
            </Button>
          }
        />

        <Card raised>
          <div className="grid gap-4">
            <div className="grid grid-cols-3 gap-3 max-[720px]:grid-cols-1">
              <LibraryMetric icon={<Archive size={17} />} label={t("history.metric.meetings")} value={String(meetings.length)} />
              <LibraryMetric icon={<Sparkles size={17} />} label={t("history.metric.summaries")} value={String(summarizedCount)} />
              <LibraryMetric icon={<FileText size={17} />} label={t("history.metric.duration")} value={formatDuration(totalDuration)} />
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <div className="grid gap-1.5">
                <label htmlFor="meeting-search" className="text-text text-[13px] font-bold">{t("search.meetings")}</label>
                <input
                  id="meeting-search"
                  className={inputClass}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("search.placeholder")}
                />
              </div>
              <div className="flex min-h-[42px] items-center gap-2 rounded-[12px] border border-border bg-surface-soft px-3 text-[13px] font-semibold text-muted-strong">
                <Search size={16} className="shrink-0 text-muted" />
                <span>{filtered.length} / {meetings.length}</span>
              </div>
            </div>
          </div>
          {error ? <Notice tone="danger" className="mt-3">{error}</Notice> : null}
        </Card>

        {filtered.length ? (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] items-start gap-[18px] max-[720px]:grid-cols-1">
            {filtered.map((meeting) => (
              <MeetingCard
                key={meeting.id}
                meeting={meeting}
                onOpen={(item) => chrome.tabs.update({ url: chrome.runtime.getURL(`src/pages/detail.html?id=${item.id}`) })}
                onDelete={handleDelete}
                onCopySummary={(item) => navigator.clipboard.writeText(item.summary)}
                onExport={downloadMarkdown}
                onRename={handleRename}
              />
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState
              icon={<TimerReset size={20} />}
              title={t("no.meetings.found")}
              description={query ? t("no.meetings.search.help") : t("no.meetings.empty.help")}
            />
          </Card>
        )}
      </div>
    </main>
  );
}

function LibraryMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="grid gap-2 rounded-[12px] border border-border bg-surface p-3">
      <div className="flex items-center gap-2 text-muted">
        {icon}
        <span className="text-[12px] font-semibold leading-none">{label}</span>
      </div>
      <strong className="truncate text-[20px] leading-none text-text">{value}</strong>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<MeetingHistory />);
