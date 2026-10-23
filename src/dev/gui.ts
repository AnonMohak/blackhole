import type GUI from 'lil-gui';

type Ranges = Record<string, [number, number, number?]>;

/** Add every number, boolean and '#rrggbb' color of obj to a lil-gui folder. */
export function addParams(folder: GUI, obj: object, onChange: () => void, ranges: Ranges = {}) {
  const rec = obj as Record<string, unknown>;
  for (const key of Object.keys(rec)) {
    const v = rec[key];
    if (typeof v === 'string' && v.startsWith('#')) folder.addColor(rec, key).onChange(onChange);
    else if (typeof v === 'boolean') folder.add(rec, key).onChange(onChange);
    else if (typeof v === 'number') {
      const r = ranges[key];
      if (r) folder.add(rec, key, r[0], r[1], r[2]).onChange(onChange);
      else {
        const m = Math.max(Math.abs(v) * 3, 1);
        folder.add(rec, key, v < 0 ? -m : 0, m).onChange(onChange);
      }
    }
  }
  return folder;
}
