import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import "./native-select.css";
import { TemporalPicker } from "./temporal-picker.jsx";

export function NativeSelectPicker({ picker, onChoose, onCancel }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(
    picker.options.find((o) => o.selected && !o.disabled)?.index ??
      picker.options.find((o) => !o.disabled)?.index,
  );
  const sheet = useRef(null);
  const backdrop = useRef(null);
  const [bounds, setBounds] = useState({
    top: 36,
    bottom: 0,
    left: 0,
    right: 0,
  });
  const search = useRef(null);
  const list = useRef(null);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  const options = picker.options.filter((option) =>
    `${option.label} ${option.group}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const enabled = options.filter((option) => !option.disabled);
  const listId = `native-options-${picker.id}`;
  useEffect(() => {
    (search.current || list.current)?.focus({ preventScroll: true });
    const outside = (event) => {
      if (!sheet.current?.contains(event.target)) cancel.current(false);
    };
    document.addEventListener("pointerdown", outside, true);
    const shell = backdrop.current.parentElement;
    const canvas = shell.closest(".canvas");
    const measure = () => {
      const rect = shell.getBoundingClientRect();
      const clip = canvas?.getBoundingClientRect();
      const next = {
        top: Math.max(36, Math.max(0, clip?.top || 0) - rect.top),
        bottom: Math.max(
          0,
          rect.bottom - Math.min(innerHeight, clip?.bottom ?? innerHeight),
        ),
        left: Math.max(0, Math.max(0, clip?.left ?? 0) - rect.left),
        right: Math.max(
          0,
          rect.right - Math.min(innerWidth, clip?.right ?? innerWidth),
        ),
      };
      setBounds((previous) =>
        previous.top === next.top &&
        previous.bottom === next.bottom &&
        previous.left === next.left &&
        previous.right === next.right
          ? previous
          : next,
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, []);
  useEffect(() => {
    const option = document.getElementById(`${listId}-${active}`);
    if (!option || !list.current) return;
    const item = option.getBoundingClientRect();
    const box = list.current.getBoundingClientRect();
    if (item.top < box.top) list.current.scrollTop += item.top - box.top;
    else if (item.bottom > box.bottom)
      list.current.scrollTop += item.bottom - box.bottom;
  }, [active, listId, bounds]);
  function key(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    if (picker.kind === "temporal") return;
    if (event.key === "Enter") {
      event.preventDefault();
      if (enabled.some((o) => o.index === active)) onChoose(active);
      else if (enabled[0]) onChoose(enabled[0].index);
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (!enabled.length) return;
      const found = enabled.findIndex((option) => option.index === active);
      const index = found < 0 && event.key === "ArrowUp" ? 0 : found;
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? enabled.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) %
              enabled.length;
      setActive(enabled[next].index);
    } else if (
      event.target.tagName !== "INPUT" &&
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      const match = enabled.find((option) =>
        option.label.toLowerCase().startsWith(event.key.toLowerCase()),
      );
      if (match) {
        event.preventDefault();
        setActive(match.index);
      }
    }
  }
  return (
    <div ref={backdrop} className="native-select-backdrop" style={bounds}>
      <div
        ref={sheet}
        className="native-select-sheet"
        role="dialog"
        aria-label={`Choose ${picker.label}`}
        onKeyDown={key}
      >
        <header>
          <span>
            <ChevronDown size={15} />
            {picker.label}
          </span>
          <button
            aria-label={
              picker.kind === "temporal"
                ? "Cancel date/time picker"
                : "Cancel dropdown"
            }
            onClick={() => onCancel()}
          >
            <X size={16} />
          </button>
        </header>
        {picker.kind === "temporal" ? (
          <TemporalPicker
            picker={picker}
            onChoose={onChoose}
            focusRef={search}
          />
        ) : (
          <>
            {picker.options.length > 8 && (
              <div className="native-select-search">
                <Search size={13} />
                <input
                  ref={search}
                  aria-label={`Filter ${picker.label} options`}
                  placeholder="Search options…"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActive(undefined);
                  }}
                />
              </div>
            )}
            <div
              ref={list}
              className="native-select-options"
              role="listbox"
              aria-label={picker.label}
              aria-activedescendant={
                active === undefined ? undefined : `${listId}-${active}`
              }
              id={listId}
              tabIndex={0}
            >
              {options.map((option, index) => (
                <React.Fragment key={option.index}>
                  {option.group &&
                    option.group !== options[index - 1]?.group && (
                      <div className="native-select-group">{option.group}</div>
                    )}
                  <button
                    role="option"
                    aria-selected={option.selected}
                    disabled={option.disabled}
                    className={active === option.index ? "active" : ""}
                    id={`${listId}-${option.index}`}
                    onMouseEnter={() => {
                      if (!option.disabled) setActive(option.index);
                    }}
                    onClick={() => onChoose(option.index)}
                  >
                    <span>{option.label || "(Empty option)"}</span>
                    {option.selected && <Check size={14} />}
                  </button>
                </React.Fragment>
              ))}
              {!options.length && (
                <p className="native-select-empty">No matching options</p>
              )}
            </div>
            {picker.truncated && (
              <small className="native-select-truncated">
                Showing the first 2,000 options.
              </small>
            )}
          </>
        )}
      </div>
    </div>
  );
}
