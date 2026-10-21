import type { ExerciseId } from '../data/types';
import type { Bone } from './body';
import type { ClipSpec } from './pose';
import type { PropSpec } from './scene';

export type ViewName = 'side' | 'front' | 'threeQuarter';

export interface Reference {
  title: string;
  url: string;
  /** What was taken from it (positions, angles). */
  note: string;
}

export interface FaultSpec {
  id: string;
  title: string;
  highlight: Bone[];
  clip: ClipSpec;
}

export interface ExerciseAnimSpec {
  id: ExerciseId;
  /** Default camera. */
  view: ViewName;
  props: PropSpec[];
  clip: ClipSpec;
  faults: FaultSpec[];
  references: Reference[];
}

/** Metadata stored in the glb (scene extras) and read by the viewer. */
export interface AnimMeta {
  id: ExerciseId;
  view: ViewName;
  duration: Record<string, number>;
  captions: Record<string, { at: number; label: string }[]>;
  faults: { id: string; title: string; highlight: Bone[] }[];
  /** Camera framing: centre and radius of the body over the whole clip. */
  frame: { center: [number, number, number]; radius: number };
}

/** free-exercise-db (public domain, Unlicense) photo URL. */
export const fedb = (id: string, i: 0 | 1) => `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${id}/${i}.jpg`;
