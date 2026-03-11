import { useEffect, useMemo, useRef } from "react";

import { MarkdownPreview } from "./MarkdownPreview";
import { parseHybridMarkdownSections } from "./hybridSections";

type HybridReadonlyMarkdownPaneProps = {
  markdown: string;
  activeSectionId: string | null;
  onNavigate?: (pathname: string) => void;
  resolveInternalHref?: (
    href: string,
    resolvedHref: string | null,
  ) => string | null;
};

export const HybridReadonlyMarkdownPane = ({
  markdown,
  activeSectionId,
  onNavigate,
  resolveInternalHref,
}: HybridReadonlyMarkdownPaneProps) => {
  const sections = useMemo(
    () => parseHybridMarkdownSections(markdown),
    [markdown],
  );
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    if (!activeSectionId) {
      return;
    }

    sectionRefs.current[activeSectionId]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [activeSectionId]);

  return (
    <div className="kindraw-hybrid-doc kindraw-hybrid-doc--readonly">
      {sections.map((section) => (
        <article
          className={`kindraw-hybrid-doc__section${
            activeSectionId === section.id
              ? " kindraw-hybrid-doc__section--active"
              : ""
          }`}
          key={section.id}
          ref={(node) => {
            sectionRefs.current[section.id] = node;
          }}
        >
          <div className="kindraw-hybrid-doc__section-header kindraw-hybrid-doc__section-header--readonly">
            <div>
              <span className="kindraw-eyebrow">
                {section.isIntro ? "Intro" : `Secao ${section.id}`}
              </span>
              <h3>{section.title}</h3>
            </div>
          </div>
          <MarkdownPreview
            markdown={section.markdown}
            onNavigate={onNavigate}
            resolveInternalHref={resolveInternalHref}
          />
        </article>
      ))}
    </div>
  );
};
