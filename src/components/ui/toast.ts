export type ToastTone = "info" | "success" | "error";

export type ToastEvent = {
  id: string;
  tone: ToastTone;
  message: string;
  createdAt: number;
};

type ToastListener = (evt: ToastEvent) => void;

const listeners = new Set<ToastListener>();

function makeId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

export function subscribeToasts(listener: ToastListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function toast(message: string, tone: ToastTone = "info") {
  const evt: ToastEvent = {
    id: makeId(),
    tone,
    message: String(message ?? ""),
    createdAt: Date.now(),
  };
  for (const l of Array.from(listeners)) {
    try {
      l(evt);
    } catch {
    }
  }
}
