/** Pure presentation selectors. Publication belongs to a version and a channel. */
export type JourneyRun = { id: string; taskId: string; status: string; title: string; keyword: string; wordCount: number; qualityScore: number; reviewStatus: string; archivedAt?: number | null; versionError?: string; completedAt: number | null };
export type JourneyVersion = { id: string; runId: string; versionNumber: number; reviewStatus: string; qualityScore: number };
export type JourneyPublication = { id: string; contentTaskId: string; versionId?: string; connectionId?: string; title: string; status: string; publishedUrl: string | null; updatedAt?: number; provider?: string; verificationStatus?: string; error?: string | null };
export type JourneyStage = 'generating' | 'draft' | 'review' | 'publish' | 'publishing' | 'published' | 'failed';
export function contentJourney(runs: JourneyRun[], versions: JourneyVersion[], publications: JourneyPublication[]) {
  const latest = new Map<string, JourneyVersion>();
  for (const version of versions) {
    if (version.versionNumber > (latest.get(version.runId)?.versionNumber ?? -1)) latest.set(version.runId, version);
  }
  return runs.filter(run => !run.archivedAt).map(run => {
    const version = latest.get(run.id);
    const history = publications.filter(item => item.contentTaskId === run.taskId || item.contentTaskId === run.id).sort((a,b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    const current = history.filter(item => version && item.versionId === version.id);
    // A failed second channel must remain actionable even if the first succeeded.
    let stage: JourneyStage = 'draft';
    if (['queued','running','retrying'].includes(run.status)) stage = 'generating';
    else if (['failed','cancelled','canceled','dead_letter','quarantined'].includes(run.status) || run.versionError) stage = 'failed';
    else if (current.some(item => (['failed','rejected','cancelled'].includes(item.status) || item.verificationStatus === 'failed'))) stage = 'failed';
    else if (current.some(item => item.status !== 'published')) stage = 'publishing';
    else if (current.length && current.every(item => item.status === 'published')) stage = 'published';
    else if (version?.reviewStatus === 'approved') stage = 'publish';
    else if (version?.reviewStatus === 'pending') stage = 'review';
    return { run, version, history, current, stage, publishFailure: current.some(item => (['failed','rejected','cancelled'].includes(item.status) || item.verificationStatus === 'failed')) };
  });
}
export function resolveContentRun(runs: Pick<JourneyRun, 'id' | 'taskId'>[], selected: string, fallback = '') {
  return runs.find(run => run.id === selected || run.taskId === selected)?.id || runs.find(run => run.id === fallback || run.taskId === fallback)?.id || runs[0]?.id || '';
}
export function safePublishedUrl(value: string | null) {
  try { const url = new URL(value || ''); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined; } catch { return undefined; }
}
