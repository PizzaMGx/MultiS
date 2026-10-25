import React, { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const pad = (value) => String(value).padStart(2, "0");
const isoDate = (date) =>
  `${String(date.getFullYear()).padStart(4, "0")}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function TemporalPicker({ picker, onChoose, focusRef }) {
  const [value, setValue] = useState(picker.value);
  const [month, setMonth] = useState(() => {
    const date = new Date(
      `${(picker.value || picker.min).slice(0, 10)}T12:00:00`,
    );
    const initial = Number.isNaN(date.getTime()) ? new Date() : date;
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });
  const field = useRef(null);
  const hasDate = picker.inputType !== "time";
  const hasTime = picker.inputType !== "date";
  const datePart = value.split("T")[0];
  const timePart =
    picker.inputType === "time" ? value : value.split("T")[1] || "";
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  function changeDate(date) {
    setValue(
      picker.inputType === "date" ? date : `${date}T${timePart || "00:00"}`,
    );
  }
  function changeTime(time) {
    setValue(
      picker.inputType === "time"
        ? time
        : time
          ? `${datePart || isoDate(new Date())}T${time}`
          : "",
    );
  }
  return (
    <form
      className="temporal-picker"
      onSubmit={(event) => {
        event.preventDefault();
        if (field.current.reportValidity()) onChoose(value);
      }}
    >
      <label className="temporal-value">
        {picker.inputType === "date"
          ? "Date"
          : picker.inputType === "time"
            ? "Time (24 hour)"
            : "Date and time"}
        <input
          ref={(node) => {
            field.current = node;
            focusRef.current = node;
            if (node) node.defaultValue = picker.defaultValue;
          }}
          aria-label={picker.label}
          type={picker.inputType}
          value={value}
          min={picker.min || undefined}
          max={picker.max || undefined}
          step={picker.step || undefined}
          required={picker.required}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      {hasDate && (
        <div className="temporal-calendar">
          <div className="temporal-month">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
            >
              <ChevronLeft size={16} />
            </button>
            <span aria-live="polite">
              {month.toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="temporal-days" role="group" aria-label="Calendar">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
              <span key={day}>{day}</span>
            ))}
            {Array.from({ length: month.getDay() }, (_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const date = isoDate(
                new Date(month.getFullYear(), month.getMonth(), i + 1),
              );
              const disabled = Boolean(
                (picker.min && date < picker.min.slice(0, 10)) ||
                  (picker.max && date > picker.max.slice(0, 10)),
              );
              return (
                <button
                  type="button"
                  key={date}
                  aria-label={date}
                  aria-pressed={date === datePart}
                  disabled={disabled}
                  onClick={() => changeDate(date)}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {hasTime && (
        <label className="temporal-value">
          Choose time (24 hour)
          <input
            aria-label="Choose time"
            type="time"
            value={timePart}
            step={picker.step || undefined}
            onChange={(event) => changeTime(event.target.value)}
          />
        </label>
      )}
      {(picker.min || picker.max || picker.step) && (
        <small className="temporal-hint">
          {picker.min && `From ${picker.min}. `}
          {picker.max && `Until ${picker.max}. `}
          {picker.step &&
            picker.step !== "any" &&
            `Step: ${picker.step}${hasTime ? " seconds" : " days"}.`}
        </small>
      )}
      <footer>
        <button
          type="button"
          disabled={picker.required}
          onClick={() => onChoose("")}
        >
          Clear
        </button>
        <button type="submit">Apply</button>
      </footer>
    </form>
  );
}
