"use client";

/**
 * Floating "back to top" button. Self-hides on short pages — only
 * surfaces when the user has scrolled past 1.5× the viewport height,
 * so adding it globally to the layout doesn't pollute pages where it
 * isn't useful.
 *
 * Click smooth-scrolls to top. Position bottom-right, above the
 * mobile safe-area inset so it sits cleanly above the home-bar on
 * iPhones.
 */

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

const SHOW_RATIO = 1.5; // show after scrolling past 1.5× viewport height

export default function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function handleScroll() {
      const threshold = window.innerHeight * SHOW_RATIO;
      setVisible(window.scrollY > threshold);
    }
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Back to top"
      className={`fixed z-40 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white rounded-full shadow-lg shadow-black/40 transition-all duration-200 ${
        visible ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-4 pointer-events-none"
      }`}
      style={{
        right: "max(1rem, env(safe-area-inset-right, 0px))",
        bottom: "max(1rem, env(safe-area-inset-bottom, 0px))",
        width: "2.75rem",
        height: "2.75rem",
      }}
    >
      <ArrowUp className="w-5 h-5 mx-auto" />
    </button>
  );
}
