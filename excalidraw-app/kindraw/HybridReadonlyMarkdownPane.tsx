import { useEffect, useMemo, useRef } from "react";

import { MarkdownPreview } from "./MarkdownPreview";
import { parseHybridMarkdownSections } from "./hybridSections";
import { useKindrawI18n } from "./i18n";

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
  const { t } = useKindrawI18n();
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

  let sectionNumber = 0;

  return (
    <div className="kindraw-hybrid-doc kindraw-hybrid-doc--readonly">
      {sections.map((section) => {
        if (!section.isIntro) {
          sectionNumber += 1;
        }

        return (
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
              <div className="kindraw-hybrid-doc__section-heading">
                <span className="kindraw-hybrid-doc__eyebrow">
                  {section.isIntro
                    ? t("kindraw.hybrid.introLabel")
                    : t("kindraw.hybrid.sectionLabel", {
                        number: String(sectionNumber).padStart(2, "0"),
                      })}
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
        );
      })}
    </div>
  );
};
