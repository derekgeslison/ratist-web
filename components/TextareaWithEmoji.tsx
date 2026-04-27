"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import EmojiButton from "./EmojiButton";

type NativeTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

interface Props extends NativeTextareaProps {
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
  { className, emojiButtonClassName, ...rest },
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

  // Wrapper needs to grow inside flex parents — most callers pass
  // `flex-1` for the textarea, but with the wrapper in between, that
  // class lands on the textarea where it does nothing. `flex-1 min-w-0`
  // here lets the wrapper take the remaining space; `w-full` keeps it
  // sane in non-flex parents. Reserve right-padding on the textarea so
  // the overlaid emoji button doesn't cover typed text.
  return (
    <div className="relative w-full flex-1 min-w-0">
      <textarea
        ref={internalRef}
        className={`pr-10 ${className ?? ""}`}
        {...rest}
      />
      <EmojiButton
        onSelect={handleEmoji}
        className={emojiButtonClassName ?? "absolute bottom-1 right-1"}
      />
    </div>
  );
});

export default TextareaWithEmoji;
