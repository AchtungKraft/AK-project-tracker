import { useState, useEffect } from "react";

const TOAST_LIMIT = 5;
const TOAST_AUTO_DISMISS_MS = 2000;

let count = 0;
function genId() {
  count = (count + 1) % Number.MAX_VALUE;
  return count.toString();
}

// Track auto-dismiss timers so we can cancel on manual dismiss
const autoDismissTimers = new Map();

const listeners = [];
let memoryState = { toasts: [] };

function dispatch(action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => listener(memoryState));
}

function reducer(state, action) {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };
    case "REMOVE_TOAST":
      return {
        ...state,
        toasts: action.toastId === undefined
          ? []
          : state.toasts.filter((t) => t.id !== action.toastId),
      };
    default:
      return state;
  }
}

function removeToast(toastId) {
  // Cancel any pending auto-dismiss timer
  const timer = autoDismissTimers.get(toastId);
  if (timer) {
    clearTimeout(timer);
    autoDismissTimers.delete(toastId);
  }
  dispatch({ type: "REMOVE_TOAST", toastId });
}

function toast({ duration, ...props }) {
  const id = genId();

  const dismiss = () => removeToast(id);

  dispatch({
    type: "ADD_TOAST",
    toast: { ...props, id },
  });

  // Auto-dismiss after duration (default 2 seconds)
  const ms = duration ?? TOAST_AUTO_DISMISS_MS;
  if (ms > 0) {
    const timer = setTimeout(dismiss, ms);
    autoDismissTimers.set(id, timer);
  }

  return { id, dismiss };
}

function useToast() {
  const [state, setState] = useState(memoryState);

  useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, []);

  return {
    ...state,
    toast,
    dismiss: removeToast,
  };
}

export { useToast, toast };