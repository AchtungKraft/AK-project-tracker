import { useEffect, useState } from "react";

/** Tracks load/error of every <img> inside rootRef so printing waits for images. */
export default function useImagesReady(rootRef, deps) {
  const [state, setState] = useState({ loaded: 0, total: 0 });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const imgs = Array.from(root.querySelectorAll("img"));
    const update = () => setState({ loaded: imgs.filter((i) => i.complete).length, total: imgs.length });
    imgs.forEach((i) => { i.addEventListener("load", update); i.addEventListener("error", update); });
    update();
    return () => imgs.forEach((i) => { i.removeEventListener("load", update); i.removeEventListener("error", update); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, ready: state.loaded >= state.total };
}