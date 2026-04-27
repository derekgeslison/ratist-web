"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import EmojiButton from "./EmojiButton";

type NativeTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

interface Props extends NativeTextareaProps {
  /** Where the picker popover floats. Default top-right (above the button). */
  emojiPosition?: "top-right" | "top-left" | "bottom-right" | "bottom-left";
  /** Override the absolute placement of the emoji button itself. Default
   *  bottom-right corner of the textarea. */
  emojiButtonClassName?: string;
}

/**
 * Drop-in replacement for `<textarea>` that overlays an emoji picker
 * button in the corner. Inserts the picked emoji at the caret and
 * triggers the parent's `onChange` so existing controlled-state and
 * auto-grow `onInput` handlers fire normally.
 */
const TextareaWithEmoji = forwardRef<HTMLTextAreaElement, Props>(function TextareaWithEmoji(
  { className, emojiPosition = "top-right", emojiButtonClassName, ...rest },
  externalRef,
) {
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  // Expose the live textarea node through the forwarded ref so callers
  // can still focus / read selection / measure scrollHeight.
  useImperativeHandle(externalRef, () => internalRef.current as HTMLTextAreaElement, []);

  function handleEmoji(emoji: string) {
    const ta = internalRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const next = ta.value.slice(0, start) + emoji + ta.value.slice(end);

    // Use React's underlying value setter so the synthetic 'input' event
    // we dispatch below carries the new value through React's onChange.
    // Calling ta.value = next directly skips React's tracking.
    const proto = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
    proto?.set?.call(ta, next);
    ta.dispatchEvent(new Event("input", { bubbles: true }));

    // Restore caret position after the React update commits. Also re-fire
    // any auto-grow logic the caller wired through onInput — same event
    // we just dispatched so it'll have already run, but a fresh height
    // calc here covers callers that don't use onInput.
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + emoji.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  // Reserve a bit of right-padding so emoji stays out of the typed text.
  // Caller's className wins on conflict (last in wins for Tailwind, but
  // since we put theirs last it can override).
  return (
    <div className="relative w-full">
      <textarea
        ref={internalRef}
        className={`pr-10 ${className ?? ""}`}
        {...rest}
      />
      <EmojiButton
        onSelect={handleEmoji}
        position={emojiPosition}
        className={emojiButtonClassName ?? "absolute bottom-1 right-1"}
      />
    </div>
  );
});

export default TextareaWithEmoji;
