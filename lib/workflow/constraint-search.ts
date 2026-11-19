import { meaningfulTextLength } from '../../packages/ppt-dsl/src/text-length.ts';

export const MAX_SEARCH_LENGTH = 10_000;
const RETAINED_INITIAL_OBSERVATIONS = 256;
export type TextMeasureEvidence = {
  fits: boolean | null;
  reason: string;
  width?: number;
  height?: number;
  contentWidth?: number;
  contentHeight?: number;
  [key: string]: unknown;
};
export type TextCapacityCandidate = {
  snapshotId: string;
  key: string;
  length: number;
  sampleId: string;
  text: string;
};
type TextObservation = TextCapacityCandidate & { evidence: TextMeasureEvidence };
type TextSample = { id: string; seed: string };
export type WideTextSamples = { cjk: string; latin: string };
export type TextCapacityInput = {
  snapshotId: string;
  key: string;
  lower: number;
  upper: number;
  mode?: 'prefix' | 'exhaustive';
  samples?: TextSample[];
  wideSamples?: WideTextSamples;
};
type FamilyLimit = {
  sampleId: string;
  maxFit: number | null;
  firstFailure: number | null;
  firstUnknown: number | null;
  lastMeasured: number | null;
};
export type TextCapacityReport = {
  snapshotId: string;
  key: string;
  lower: number;
  upper: number;
  status: 'complete' | 'cancelled' | 'stale' | 'inconclusive';
  candidates: TextObservation[];
  observationCount: number;
  familyLimits: FamilyLimit[];
  feasibleRanges: { min: number; max: number }[];
  recommendedMax: number | null;
  visualGuarantee: false;
  limitations: string[];
  nativeOfficeValidation: 'not_run';
};

const defaultWideSamples: WideTextSamples = {
  cjk: '疆體鬱國寬',
  latin: 'WWWWWW MWWMW WMW QMWMW',
};

function stressPoints(seed: string): string[] {
  const clean = seed
    .replace(/[^\S\n]+/gu, ' ')
    .replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, character => character === '\n' ? character : '')
    .replace(/\s+/gu, separation => separation.includes('\n') ? '\n' : ' ')
    .trim();
  const points = Array.from(clean);
  return /[a-z]$/iu.test(clean) && /^[a-z]/iu.test(clean) ? [...points, ' '] : points;
}

function sampleAtLength(points: string[], length: number): string {
  const result = Array.from({ length }, (_, index) => points[index % points.length]);
  const last = result.at(-1);
  if (last === ' ' || last === '\n') result[length - 1] = points[length % points.length];
  return result.join('');
}

export function stressText(seed: string, length: number): string {
  const points = stressPoints(seed);
  if (!Number.isSafeInteger(length) || length < 0 || length > MAX_SEARCH_LENGTH || !points.length) throw new Error('SEARCH_INVALID_SAMPLE');
  return sampleAtLength(points, length);
}

function prepareSamples(input: TextCapacityInput): { id: string; points: string[] }[] {
  if (input.samples !== undefined && (!Array.isArray(input.samples) || input.samples.length > 6)) throw new Error('SEARCH_INVALID_SAMPLES');
  const sources = input.samples?.length ? input.samples : [{ id: 'semantic', seed: '示例 Sample' }];
  const wide = input.wideSamples ?? defaultWideSamples;
  const seen = new Set(['cjk-wide', 'latin-wide']);
  for (const sample of sources) {
    if (!sample || typeof sample.id !== 'string' || !sample.id.trim() || seen.has(sample.id)) throw new Error('SEARCH_INVALID_SAMPLES');
    seen.add(sample.id);
  }
  return [...sources, { id: 'cjk-wide', seed: wide.cjk }, { id: 'latin-wide', seed: wide.latin }].map(({ id, seed }) => {
    if (typeof seed !== 'string' || seed.length > MAX_SEARCH_LENGTH * 2) throw new Error('SEARCH_INVALID_SAMPLES');
    const points = stressPoints(seed);
    if (!points.length) throw new Error('SEARCH_INVALID_SAMPLE');
    return { id, points };
  });
}

export async function searchTextCapacity(input: TextCapacityInput, options: {
  measure: (candidate: TextCapacityCandidate) => Promise<TextMeasureEvidence>;
  signal?: AbortSignal;
  isCurrent?: () => boolean;
}): Promise<TextCapacityReport> {
  const { snapshotId, key, lower, upper, mode = 'prefix' } = input;
  if (typeof snapshotId !== 'string' || !snapshotId.trim() || typeof key !== 'string' || !key.trim() ||
    !Number.isSafeInteger(lower) || !Number.isSafeInteger(upper) || lower < 0 || upper < lower || upper > MAX_SEARCH_LENGTH) {
    throw new Error('SEARCH_INVALID_BOUNDS');
  }
  if (mode !== 'prefix' && mode !== 'exhaustive') throw new Error('SEARCH_INVALID_MODE');
  const samples = prepareSamples(input);
  const familyLimits: FamilyLimit[] = samples.map(sample => ({
    sampleId: sample.id, maxFit: null, firstFailure: null, firstUnknown: null, lastMeasured: null,
  }));
  const boundaries = samples.map((): Partial<Record<'maxFit' | 'firstFailure' | 'firstUnknown' | 'last', TextObservation>> => ({}));
  const report: TextCapacityReport = {
    snapshotId, key, lower, upper, status: 'complete', candidates: [], observationCount: 0, familyLimits, feasibleRanges: [], recommendedMax: null,
    visualGuarantee: false, nativeOfficeValidation: 'not_run', limitations: [
      'Set the semantic minimum separately from layout measurements.',
      'Only the listed finite samples were measured. Review font substitutions, actual words and native output separately.',
      'A passing upper endpoint does not establish the capacity ceiling.',
      'For long searches, the report retains initial samples and each family’s measured boundary instead of every intermediate string.',
    ],
  };
  const stopped = () => options.signal?.aborted ? 'cancelled' : options.isCurrent && !options.isCurrent() ? 'stale' : null;
  outer: for (let length = lower; length <= upper; length++) {
    let attempted = false;
    let fits = true;
    for (const [index, sample] of samples.entries()) {
      const family = familyLimits[index];
      if (mode === 'prefix' && (family.firstFailure !== null || family.firstUnknown !== null)) {
        fits = false;
        continue;
      }
      if (report.observationCount && report.observationCount % 32 === 0) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
      const before = stopped();
      if (before) {
        report.status = before;
        break outer;
      }
      attempted = true;
      const text = sampleAtLength(sample.points, length);
      const metric = meaningfulTextLength(text);
      if (metric.hasInvalidCharacters || metric.length !== length) throw new Error('SEARCH_INVALID_SAMPLE_LENGTH');
      const candidate = { snapshotId, key, length, sampleId: sample.id, text };
      let evidence: TextMeasureEvidence;
      try {
        evidence = await options.measure(candidate);
      } catch (error) {
        evidence = { fits: null, reason: error instanceof Error ? error.message : String(error) };
      }
      if (!evidence || ![true, false, null].includes(evidence.fits) || typeof evidence.reason !== 'string' || !evidence.reason.trim()) {
        evidence = { fits: null, reason: 'Renderer returned invalid evidence.' };
      }
      const after = stopped();
      if (after) evidence = { ...evidence, fits: null, reason: 'Measurement invalidated by a workspace change or cancellation.' };
      const observation = { ...candidate, evidence };
      report.observationCount++;
      if (report.observationCount <= RETAINED_INITIAL_OBSERVATIONS) {
        report.candidates.push(observation);
      } else {
        const retained = boundaries[index];
        retained.last = observation;
        if (!after) {
          if (evidence.fits === false && family.firstFailure === null) retained.firstFailure = observation;
          if (evidence.fits === null && family.firstUnknown === null) retained.firstUnknown = observation;
          if (evidence.fits && family.firstFailure === null && family.firstUnknown === null) retained.maxFit = observation;
        }
      }
      if (after) {
        report.status = after;
        break outer;
      }
      family.lastMeasured = length;
      if (evidence.fits === false) family.firstFailure ??= length;
      if (evidence.fits === null) family.firstUnknown ??= length;
      if (evidence.fits && family.firstFailure === null && family.firstUnknown === null) family.maxFit = length;
      if (evidence.fits !== true) fits = false;
    }
    if (!attempted) break;
    if (fits) {
      const last = report.feasibleRanges.at(-1);
      if (last && last.max === length - 1) last.max = length;
      else report.feasibleRanges.push({ min: length, max: length });
    }
  }
  const retainedBoundaries = [...new Set(boundaries.flatMap(boundary => Object.values(boundary)))];
  report.candidates.push(...retainedBoundaries.sort((left, right) => left.length - right.length));
  if (report.status === 'complete' && familyLimits.some(family => family.firstUnknown !== null)) report.status = 'inconclusive';
  if (report.status === 'complete' && report.feasibleRanges[0]?.min === lower) report.recommendedMax = report.feasibleRanges[0].max;
  return report;
}
