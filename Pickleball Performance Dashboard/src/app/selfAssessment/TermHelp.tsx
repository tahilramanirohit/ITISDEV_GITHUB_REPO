import { useId, useState } from "react";
import { ACCENT_INK, INK, LINE, SURFACE_2 } from "../theme";

/** A small "?" after a pickleball term; tapping it shows what the term means. */
export function TermHelp({ term, meaning }: { term: string; meaning: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <>
    <button type="button" aria-expanded={open} aria-controls={id} aria-label={`What is ${term.toLowerCase()}?`}
      onClick={() => setOpen(!open)}
      className="-my-2 ml-0.5 inline-flex h-11 w-11 items-center justify-center align-middle">
      <span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded-full text-[13px] font-extrabold leading-none"
        style={{ border: `1.5px solid ${open ? ACCENT_INK : LINE}`, color: ACCENT_INK, background: open ? SURFACE_2 : "transparent" }}>?</span></button>
    {open && <span id={id} role="note" className="mt-2 block rounded-[12px] px-3 py-2 text-sm font-normal leading-snug"
      style={{ background: SURFACE_2, color: INK }}>{meaning}</span>}
  </>;
}
