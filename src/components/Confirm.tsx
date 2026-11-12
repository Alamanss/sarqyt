"use client";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type Opts = { title: string; text?: string; ok: string; cancel: string };
const Ctx = createContext<(o: Opts) => Promise<boolean>>(async () => false);

/** Свой диалог подтверждения вместо системного confirm(): говорит, что произойдёт, и возвращает выбор */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [o, setO] = useState<Opts | null>(null);
  const res = useRef<(v: boolean) => void>(() => {});
  const ask = useCallback((opts: Opts) => new Promise<boolean>((r) => { res.current = r; setO(opts); }), []);
  const close = (v: boolean) => { setO(null); res.current(v); };
  return (
    <Ctx.Provider value={ask}>
      {children}
      {o && (
        <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="fixed inset-0 z-50 grid place-items-end bg-ink/40 p-4 sm:place-items-center"
          onClick={() => close(false)} onKeyDown={(e) => e.key === "Escape" && close(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-line bg-paper p-6" onClick={(e) => e.stopPropagation()}>
            <h2 id="confirm-title" className="h2">{o.title}</h2>
            {o.text && <p className="mt-2 text-[14px] leading-5 text-mute">{o.text}</p>}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button type="button" className="btn-ghost" onClick={() => close(false)}>{o.cancel}</button>
              <button type="button" autoFocus className="btn-primary" onClick={() => close(true)}>{o.ok}</button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
export const useConfirm = () => useContext(Ctx);
