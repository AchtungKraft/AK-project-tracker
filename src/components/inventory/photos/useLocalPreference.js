import { useState } from "react";

/** Small per-device preference stored in localStorage (same approach as other saved UI choices). */
export function useLocalPreference(key, fallback, allowed) {
  const [value, setValue] = useState(() => {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    return v && (!allowed || allowed.includes(v)) ? v : fallback;
  });
  const update = (v) => { setValue(v); localStorage.setItem(key, v); };
  return [value, update];
}