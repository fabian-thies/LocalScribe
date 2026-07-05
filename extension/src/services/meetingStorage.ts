import type { MeetingRecord } from "../types/meeting";
import type { RecordedAudioPayload } from "./recordingService";
import { getLocalStorage, removeLocalStorage, setLocalStorage } from "./chromeStorage";

const MEETINGS_KEY = "meetingTranscriber.meetings";
const CURRENT_MEETING_KEY = "meetingTranscriber.currentMeetingId";
const RECORDING_DRAFT_KEY = "meetingTranscriber.recordingDraft";

export async function listMeetings(): Promise<MeetingRecord[]> {
  const result = await getLocalStorage(MEETINGS_KEY);
  const meetings = (result[MEETINGS_KEY] as MeetingRecord[] | undefined) ?? [];
  return meetings.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function getMeeting(id: string): Promise<MeetingRecord | undefined> {
  const meetings = await listMeetings();
  return meetings.find((meeting) => meeting.id === id);
}

export async function saveMeeting(meeting: MeetingRecord): Promise<void> {
  const meetings = await listMeetings();
  const next = [meeting, ...meetings.filter((item) => item.id !== meeting.id)];
  await setLocalStorage({ [MEETINGS_KEY]: next });
}

export async function getCurrentMeetingId(): Promise<string | undefined> {
  const result = await getLocalStorage(CURRENT_MEETING_KEY);
  return result[CURRENT_MEETING_KEY] as string | undefined;
}

export async function setCurrentMeetingId(id: string): Promise<void> {
  await setLocalStorage({ [CURRENT_MEETING_KEY]: id });
}

export async function clearCurrentMeetingId(): Promise<void> {
  await removeLocalStorage(CURRENT_MEETING_KEY);
}

export async function getRecordingDraft(): Promise<RecordedAudioPayload | undefined> {
  const result = await getLocalStorage(RECORDING_DRAFT_KEY);
  return result[RECORDING_DRAFT_KEY] as RecordedAudioPayload | undefined;
}

export async function saveRecordingDraft(recording: RecordedAudioPayload): Promise<void> {
  await setLocalStorage({ [RECORDING_DRAFT_KEY]: recording });
}

export async function clearRecordingDraft(): Promise<void> {
  await removeLocalStorage(RECORDING_DRAFT_KEY);
}

export async function deleteMeeting(id: string): Promise<void> {
  const meetings = await listMeetings();
  await setLocalStorage({ [MEETINGS_KEY]: meetings.filter((meeting) => meeting.id !== id) });

  if ((await getCurrentMeetingId()) === id) {
    await clearCurrentMeetingId();
  }
}
