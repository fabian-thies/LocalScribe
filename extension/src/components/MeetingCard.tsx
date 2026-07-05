import { Check, Copy, Download, ExternalLink, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MeetingRecord } from "../types/meeting";
import { formatDuration } from "../utils/formatDuration";
import { t } from "../services/i18n";
import { Button } from "./Button";
import { Card } from "./Card";
import { StatusBadge } from "./StatusBadge";

interface MeetingCardProps {
  meeting: MeetingRecord;
  onOpen: (meeting: MeetingRecord) => void;
  onDelete?: (meeting: MeetingRecord) => void;
  onCopySummary?: (meeting: MeetingRecord) => void;
  onExport?: (meeting: MeetingRecord) => void;
  onRename?: (meeting: MeetingRecord, newTitle: string) => void;
}

const inputClass = "field-control";

export function MeetingCard({ meeting, onOpen, onDelete, onCopySummary, onExport, onRename }: MeetingCardProps) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(meeting.title);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>();
  const editInputRef = useRef<HTMLInputElement>(null);
  const preview = meeting.summary ? meeting.summary.slice(0, 190) : t("no.summary.saved.yet");

  useEffect(() => {
    return () => clearTimeout(copyTimer.current);
  }, []);

  useEffect(() => {
    if (editing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editing]);

  function handleCopy() {
    onCopySummary?.(meeting);
    setCopied(true);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1500);
  }

  function startEdit() {
    if (!onRename) return;
    setDraftTitle(meeting.title);
    setEditing(true);
  }

  function commitEdit() {
    const trimmed = draftTitle.trim();
    if (trimmed && trimmed !== meeting.title) {
      onRename?.(meeting, trimmed);
    }
    setEditing(false);
  }

  function cancelEdit() {
    setEditing(false);
    setDraftTitle(meeting.title);
  }

  function handleEditKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      commitEdit();
    } else if (event.key === "Escape") {
      cancelEdit();
    }
  }

  return (
    <Card className="grid content-start gap-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          {editing ? (
            <input
              ref={editInputRef}
              className={`${inputClass} mb-1`}
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onKeyDown={handleEditKeyDown}
              onBlur={commitEdit}
            />
          ) : (
            <h2
              className={`mb-1 truncate text-[17px] ${onRename ? "cursor-pointer hover:text-accent-strong" : ""}`}
              onClick={startEdit}
              title={onRename ? t("click.to.edit.title") : undefined}
            >
              {meeting.title}
            </h2>
          )}
          <div className="text-muted text-xs leading-[1.35]">{new Date(meeting.createdAt).toLocaleString()}</div>
        </div>
        <div className="max-w-[46%] shrink-0">
          <StatusBadge label={t(`status.${meeting.status}`)} tone={meeting.status === "error" ? "danger" : "success"} dot />
        </div>
      </div>
      <p className="line-clamp-4 text-[13px] leading-[1.6] text-muted-strong">{preview}</p>
      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <StatusBadge label={formatDuration(meeting.durationSeconds)} />
        <StatusBadge label={t("tab.audio")} tone={meeting.sources.tabAudio ? "success" : "neutral"} />
        <StatusBadge label={t("mic.audio")} tone={meeting.sources.micAudio ? "success" : "neutral"} />
      </div>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 pt-1">
        <Button variant="secondary" size="sm" fullWidth icon={<ExternalLink size={16} />} onClick={() => onOpen(meeting)}>
          {t("open")}
        </Button>
        {onCopySummary ? (
          <Button variant="secondary" size="sm" fullWidth icon={copied ? <Check size={16} /> : <Copy size={16} />} onClick={handleCopy}>
            {copied ? t("copied") : t("copy")}
          </Button>
        ) : null}
        {onExport ? (
          <Button variant="secondary" size="sm" fullWidth icon={<Download size={16} />} onClick={() => onExport(meeting)}>
            {t("export")}
          </Button>
        ) : null}
        {onDelete ? (
          <Button variant="danger" size="sm" fullWidth icon={<Trash2 size={16} />} onClick={() => { if (confirm(t("confirm.delete"))) onDelete(meeting); }}>
            {t("delete")}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
