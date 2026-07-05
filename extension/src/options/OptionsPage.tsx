import "../styles/global.css";
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { BookMarked, FileText, History, Link2, Save, Server, SlidersHorizontal, Wifi } from "lucide-react";
import { AppHeader } from "../components/AppHeader";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Notice } from "../components/Notice";
import { TextArea } from "../components/TextArea";
import { Toggle } from "../components/Toggle";
import { OpenWebuiClient } from "../services/openWebuiClient";
import { getSettings, saveSettings } from "../services/settingsStorage";
import {
  DEFAULT_SETTINGS,
  getDefaultSummaryPrompt,
  isDefaultSummaryPrompt,
  type ExtensionSettings,
  type Locale,
  type SummaryLanguage,
  type SummaryLength,
  type SummaryNoteType,
  type SummaryStrictness
} from "../types/settings";
import { getErrorMessage } from "../utils/errors";
import { setLocale, t } from "../services/i18n";

const inputClass = "field-control";
const selectClass = `${inputClass} cursor-pointer appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2343524f' d='M6 8L1 3h10z'/%3E%3C/svg%3E")] bg-no-repeat bg-[right_12px_center] pr-8`;

function OptionsPage() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSettings()
      .then((s) => {
        setLocale(s.locale);
        setSettings(s);
      })
      .catch((loadError) => setError(getErrorMessage(loadError)));
  }, []);

  function update<K extends keyof ExtensionSettings>(key: K, value: ExtensionSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function updateLocale(locale: Locale) {
    setSettings((current) => ({
      ...current,
      locale,
      summaryPrompt: isDefaultSummaryPrompt(current.summaryPrompt) ? getDefaultSummaryPrompt(locale) : current.summaryPrompt
    }));
  }

  async function handleSave() {
    setBusy(true);
    setError("");
    try {
      await saveSettings(settings);
      setLocale(settings.locale);
      setMessage(t("settings.saved"));
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    setBusy(true);
    setError("");
    try {
      const result = await new OpenWebuiClient(settings).testConnection();
      if (!result.ok) {
        setMessage("");
        setError(result.message);
      } else {
        setMessage(result.message);
      }
    } catch (testError) {
      setMessage("");
      setError(getErrorMessage(testError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-page">
      <div className="app-container">
        <AppHeader
          title={t("settings.title")}
          description={t("settings.description")}
          actions={
            <Button variant="secondary" icon={<History size={16} />} onClick={() => chrome.tabs.update({ url: chrome.runtime.getURL("src/pages/history.html") })}>
              {t("meeting.history")}
            </Button>
          }
        />

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)] items-start gap-[18px] max-[860px]:grid-cols-1">
          <Card raised className="grid gap-4">
            <SectionHeader icon={<Server size={18} />} title={t("backend")} description={t("backend.description")} />
            <Field label={t("openwebui.base.url")} id="openwebui-base-url">
              <input id="openwebui-base-url" className={inputClass} value={settings.openWebuiBaseUrl} onChange={(event) => update("openWebuiBaseUrl", event.target.value)} />
            </Field>
            <Field label={t("api.key")} id="api-token">
              <input
                id="api-token"
                className={inputClass}
                type="password"
                value={settings.apiToken}
                placeholder={t("api.key.placeholder")}
                onChange={(event) => update("apiToken", event.target.value)}
              />
            </Field>
            <Field label={t("summarization.model")} id="summary-model">
              <input id="summary-model" className={inputClass} value={settings.model} onChange={(event) => update("model", event.target.value)} />
            </Field>
          </Card>

          <Card raised className="grid gap-4">
            <SectionHeader icon={<SlidersHorizontal size={18} />} title={t("recording.settings")} description={t("recording.settings.description")} />
            <Field label={t("language")} id="locale">
              <select id="locale" className={selectClass} value={settings.locale} onChange={(event) => updateLocale(event.target.value as Locale)}>
                <option value="en">{t("language.en")}</option>
                <option value="de">{t("language.de")}</option>
              </select>
            </Field>
            <Toggle
              label={t("live.transcript.setting")}
              description={t("live.transcript.setting.description")}
              checked={settings.liveTranscriptionEnabled}
              onChange={(checked) => update("liveTranscriptionEnabled", checked)}
            />
          </Card>
        </div>

        <Card className="grid gap-4">
          <SectionHeader icon={<BookMarked size={18} />} title={t("knowledge.sync")} description={t("knowledge.sync.description")} />
          <Toggle
            label={t("knowledge.sync.enabled")}
            description={t("knowledge.sync.enabled.description")}
            checked={settings.openWebuiKnowledgeSyncEnabled}
            onChange={(checked) => update("openWebuiKnowledgeSyncEnabled", checked)}
          />
          {settings.openWebuiKnowledgeSyncEnabled ? (
            <Field label={t("knowledge.sync.name")} id="knowledge-sync-name" help={t("knowledge.sync.name.help")}>
              <input
                id="knowledge-sync-name"
                className={inputClass}
                value={settings.openWebuiKnowledgeBaseName}
                onChange={(event) => update("openWebuiKnowledgeBaseName", event.target.value)}
              />
            </Field>
          ) : null}
        </Card>

        <Card className="grid gap-4">
          <SectionHeader icon={<Link2 size={18} />} title={t("endpoint.paths")} description={t("endpoint.paths.description")} />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4 max-[720px]:grid-cols-1">
            <Field label={t("stt.endpoint")} id="stt-endpoint" help={t("stt.endpoint.help")}>
              <input id="stt-endpoint" className={inputClass} value={settings.sttEndpointPath} onChange={(event) => update("sttEndpointPath", event.target.value)} />
            </Field>
            <Field label={t("chat.endpoint")} id="chat-endpoint">
              <input id="chat-endpoint" className={inputClass} value={settings.chatEndpointPath} onChange={(event) => update("chatEndpointPath", event.target.value)} />
            </Field>
          </div>
        </Card>

        <Card className="grid gap-4">
          <SectionHeader icon={<FileText size={18} />} title={t("summary.behavior")} description={t("summary.behavior.description")} />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] items-start gap-4 max-[720px]:grid-cols-1">
            <Field label={t("summary.note.type")} id="summary-note-type">
              <select id="summary-note-type" className={selectClass} value={settings.summaryNoteType} onChange={(event) => update("summaryNoteType", event.target.value as SummaryNoteType)}>
                <option value="auto">{t("summary.note.type.auto")}</option>
                <option value="meeting">{t("summary.note.type.meeting")}</option>
                <option value="discussion">{t("summary.note.type.discussion")}</option>
              </select>
            </Field>
            <Field label={t("summary.length")} id="summary-length">
              <select id="summary-length" className={selectClass} value={settings.summaryLength} onChange={(event) => update("summaryLength", event.target.value as SummaryLength)}>
                <option value="short">{t("summary.length.short")}</option>
                <option value="balanced">{t("summary.length.balanced")}</option>
                <option value="detailed">{t("summary.length.detailed")}</option>
              </select>
            </Field>
            <Field label={t("summary.language")} id="summary-language">
              <select id="summary-language" className={selectClass} value={settings.summaryLanguage} onChange={(event) => update("summaryLanguage", event.target.value as SummaryLanguage)}>
                <option value="auto">{t("summary.language.auto")}</option>
                <option value="de">{t("summary.language.de")}</option>
                <option value="en">{t("summary.language.en")}</option>
              </select>
            </Field>
            <Field label={t("summary.strictness")} id="summary-strictness">
              <select id="summary-strictness" className={selectClass} value={settings.summaryStrictness} onChange={(event) => update("summaryStrictness", event.target.value as SummaryStrictness)}>
                <option value="strict">{t("summary.strictness.strict")}</option>
                <option value="cautious">{t("summary.strictness.cautious")}</option>
              </select>
            </Field>
          </div>
          <TextArea
            label={t("summary.prompt")}
            value={settings.summaryPrompt}
            onChange={(event) => update("summaryPrompt", event.target.value)}
            help={t("summary.prompt.help")}
          />
        </Card>

        <Card raised className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-[54ch] text-[13px] leading-[1.45] text-muted">{t("settings.actions.description")}</p>
            <div className="flex flex-wrap gap-2">
              <Button icon={<Save size={16} />} onClick={handleSave} disabled={busy} loading={busy}>
                {t("save.settings")}
              </Button>
              <Button variant="secondary" icon={<Wifi size={16} />} onClick={handleTest} disabled={busy}>
                {t("test.connection")}
              </Button>
            </div>
          </div>
          {message || error ? (
            <div className="grid gap-2" aria-live="polite">
              {message ? <Notice tone="success">{message}</Notice> : null}
              {error ? <Notice tone="danger">{error}</Notice> : null}
            </div>
          ) : null}
        </Card>
      </div>
    </main>
  );
}

function SectionHeader({ title, description, icon }: { title: string; description?: string; icon?: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      {icon ? <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-surface-soft text-accent-strong">{icon}</div> : null}
      <div className="grid gap-1">
        <h2 className="mb-0">{title}</h2>
        {description ? <p className="text-[13px] leading-[1.45] text-muted">{description}</p> : null}
      </div>
    </div>
  );
}

function Field({ label, id, help, children }: { label: string; id: string; help?: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={id} className="text-text text-[13px] font-bold">{label}</label>
      {children}
      {help ? <span className="text-muted text-xs leading-[1.35]">{help}</span> : null}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<OptionsPage />);
