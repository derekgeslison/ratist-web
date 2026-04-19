import { Extension } from "@tiptap/core";

// Custom FontSize extension (uses TextStyle mark).
// Shared between RichTextEditor and RichTextRenderer so saved font sizes
// render identically in the editor and on the public page.
export const FontSize = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [{
      types: ["textStyle"],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el) => (el as HTMLElement).style.fontSize || null,
          renderHTML: (attrs) => {
            if (!attrs.fontSize) return {};
            return { style: `font-size: ${attrs.fontSize}` };
          },
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontSize: (size: string) => ({ chain }: { chain: () => { setMark: (...args: unknown[]) => { run: () => boolean } } }) =>
        chain().setMark("textStyle", { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }: { chain: () => { setMark: (...args: unknown[]) => { removeEmptyTextStyle: () => { run: () => boolean } } } }) =>
        chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
    } as Record<string, (...args: unknown[]) => unknown>;
  },
});
