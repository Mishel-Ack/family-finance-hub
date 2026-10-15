export interface SpeechTranscriptEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

export function speechTranscriptFromEvent(event: SpeechTranscriptEvent) {
  return Array.from(event.results)
    .map((result) => result[0]?.transcript ?? "")
    .join(" ")
    .trim();
}
