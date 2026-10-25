import { randomUUID } from "node:crypto";

// Native browser popups are missing from CDP screencasts. Bridge collapsed
// selects and date/time inputs; keep custom controls on their normal input path.
function interceptNativeSelect({ binding }) {
  const marker = `${binding}_installed`;
  if (window[marker]) return;
  Object.defineProperty(window, marker, { value: true });
  const temporal = (el) =>
    el instanceof HTMLInputElement &&
    ["date", "time", "datetime-local"].includes(el.type) &&
    !el.readOnly;
  const eligible = (el) =>
    ((el instanceof HTMLSelectElement && !el.multiple && el.size <= 1) ||
      temporal(el)) &&
    !el.disabled &&
    !el.matches(":disabled") &&
    typeof window[binding] === "function";
  const open = (el) => {
    el.focus({ preventScroll: true });
    window[binding](el).catch(() => {});
  };
  const target = (event) =>
    event
      .composedPath()
      .find((el) => el instanceof HTMLSelectElement || temporal(el));
  // Keep pointerdown's default action: cancelling it suppresses mousedown,
  // which modal outside-click handlers use to remember where a click began.
  // Show the streamed picker after mouseup so moving focus to its local UI
  // cannot interrupt the website's original pointer sequence.
  for (const type of ["mousedown", "click"]) {
    document.addEventListener(
      type,
      (event) => {
        const el = target(event);
        if (!eligible(el) || event.button !== 0) return;
        event.preventDefault();
        if (type === "click") open(el);
      },
      { capture: true, passive: false },
    );
  }
  document.addEventListener(
    "keydown",
    (event) => {
      const el = target(event);
      if (!eligible(el)) return;
      if (
        [" ", "Enter", "F4"].includes(event.key) ||
        (event.altKey && ["ArrowDown", "ArrowUp"].includes(event.key))
      ) {
        event.preventDefault();
        open(el);
      }
    },
    true,
  );
  for (const prototype of [
    HTMLSelectElement.prototype,
    HTMLInputElement.prototype,
  ]) {
    const original = prototype.showPicker;
    if (!original) continue;
    prototype.showPicker = function (...args) {
      if (eligible(this)) {
        open(this);
        return;
      }
      return original.apply(this, args);
    };
  }
}

export async function installNativeSelectBridge(context, { isActive, send }) {
  const binding = `__multis_select_${randomUUID().replaceAll("-", "")}`;
  let picker = null;
  let generation = 0;
  function cancel() {
    generation++;
    const previous = picker;
    picker = null;
    if (previous) {
      send({ type: "select-close", id: previous.message.id });
      previous.element.dispose().catch(() => {});
    }
  }
  await context.exposeBinding(
    binding,
    async ({ page, frame }, element) => {
      if (!isActive(page)) {
        await element.dispose();
        return;
      }
      cancel();
      const opened = generation;
      try {
        const data = await element.evaluate((el) => {
          if (el instanceof HTMLInputElement) {
            if (
              !el.isConnected ||
              el.matches(":disabled") ||
              el.readOnly ||
              !["date", "time", "datetime-local"].includes(el.type)
            )
              return null;
            return {
              kind: "temporal",
              inputType: el.type,
              value: el.value,
              min: el.min,
              max: el.max,
              step: el.step,
              required: el.required,
              // Preserve the default value because it is the step base when min is absent.
              defaultValue: el.defaultValue,
              label: (
                el.getAttribute("aria-label") ||
                el.labels?.[0]?.textContent ||
                el.name ||
                "Date and time"
              )
                .trim()
                .slice(0, 200),
              options: [],
            };
          }
          if (
            !(el instanceof HTMLSelectElement) ||
            !el.isConnected ||
            el.disabled ||
            el.multiple ||
            el.size > 1
          )
            return null;
          const options = [];
          for (
            let index = 0;
            index < Math.min(el.options.length, 2000);
            index++
          ) {
            const option = el.options[index];
            const group =
              option.parentElement instanceof HTMLOptGroupElement
                ? option.parentElement
                : null;
            if (
              option.hidden ||
              group?.hidden ||
              getComputedStyle(option).display === "none" ||
              (group && getComputedStyle(group).display === "none")
            )
              continue;
            options.push({
              index,
              label: option.label.slice(0, 512),
              value: option.value,
              selected: option.selected,
              disabled: option.disabled || Boolean(group?.disabled),
              group: group?.label.slice(0, 128) || "",
            });
          }
          return {
            label: (
              el.getAttribute("aria-label") ||
              el.labels?.[0]?.textContent ||
              el.name ||
              "Choose an option"
            )
              .trim()
              .slice(0, 200),
            options,
            truncated: el.options.length > 2000,
          };
        });
        if (!data || generation !== opened || !isActive(page)) {
          await element.dispose();
          return;
        }
        const message = {
          ...(data.kind === "temporal" ? data : {}),
          type: "select",
          id: randomUUID(),
          label: data.label,
          options: data.options.map(({ value, ...option }) => option),
          truncated: data.truncated,
        };
        picker = { page, frame, element, data, message };
        send(message);
      } catch {
        await element.dispose().catch(() => {});
      }
    },
    { handle: true },
  );
  await context.addInitScript(interceptNativeSelect, { binding });
  for (const page of context.pages()) {
    for (const frame of page.frames())
      await frame.evaluate(interceptNativeSelect, { binding }).catch(() => {});
  }
  return {
    get message() {
      return picker?.message;
    },
    cancel,
    cancelForFrame(frame) {
      if (picker?.frame === frame) cancel();
    },
    async choose(id, index) {
      const current = picker;
      if (!current || current.message.id !== id) return;
      if (index === null) {
        cancel();
        return;
      }
      if (current.data.kind === "temporal") {
        try {
          if (
            typeof index !== "string" ||
            index.length > 64 ||
            !isActive(current.page)
          )
            throw new Error();
          const result = await current.element.evaluate(
            (el, { expected, value }) => {
              if (
                !el.isConnected ||
                el.matches(":disabled") ||
                el.readOnly ||
                el.type !== expected.inputType ||
                el.value !== expected.value ||
                el.min !== expected.min ||
                el.max !== expected.max ||
                el.step !== expected.step ||
                el.required !== expected.required ||
                el.defaultValue !== expected.defaultValue
              )
                return "stale";
              const probe = el.cloneNode(false);
              probe.value = value;
              if (probe.value !== value || !probe.checkValidity())
                return "invalid";
              if (el.value !== value) {
                // Use the native setter so React's value tracker sees the change.
                Object.getOwnPropertyDescriptor(
                  HTMLInputElement.prototype,
                  "value",
                ).set.call(el, value);
                el.dispatchEvent(
                  new Event("input", { bubbles: true, composed: true }),
                );
                el.dispatchEvent(new Event("change", { bubbles: true }));
              }
              return "ok";
            },
            { expected: current.data, value: index },
          );
          if (result === "invalid")
            throw new Error("Choose a date or time allowed by this field.");
          if (result !== "ok") throw new Error();
        } catch (error) {
          throw new Error(
            error.message === "Choose a date or time allowed by this field."
              ? error.message
              : "The date/time field changed. Reopen it and try again.",
          );
        } finally {
          if (picker === current) cancel();
        }
        return;
      }
      const option = current.data.options.find(
        (option) => option.index === index,
      );
      if (!Number.isInteger(index) || !option || option.disabled)
        throw new Error("Choose an available dropdown option.");
      try {
        if (!isActive(current.page)) throw new Error();
        const applied = await current.element.evaluate((el, expected) => {
          const option = el.options?.[expected.index];
          const group =
            option?.parentElement instanceof HTMLOptGroupElement
              ? option.parentElement
              : null;
          if (
            !el.isConnected ||
            el.disabled ||
            !option ||
            option.disabled ||
            group?.disabled ||
            option.hidden ||
            group?.hidden ||
            option.value !== expected.value ||
            option.label.slice(0, 512) !== expected.label
          )
            return false;
          if (el.selectedIndex === expected.index) return true;
          el.selectedIndex = expected.index;
          el.dispatchEvent(
            new Event("input", { bubbles: true, composed: true }),
          );
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }, option);
        if (!applied) throw new Error();
      } catch {
        throw new Error(
          "The dropdown options changed. Reopen it and choose again.",
        );
      } finally {
        if (picker === current) cancel();
      }
    },
  };
}
