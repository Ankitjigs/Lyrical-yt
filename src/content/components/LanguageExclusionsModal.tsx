import { useState, useMemo, useEffect } from "react";
import { X, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { AVAILABLE_LANGUAGES } from "../utils/languages";
import { t } from "../../i18n";

const LanguageExclusionsModal = ({
  isOpen,
  onClose,
  romanizationExclusions = [],
  translationExclusions = [],
  onUpdateExclusions,
}) => {
  const [activeTab, setActiveTab] = useState("romanization"); // "romanization" | "translation"
  const [searchQuery, setSearchQuery] = useState("");
  const [localRomanization, setLocalRomanization] = useState(
    romanizationExclusions,
  );
  const [localTranslation, setLocalTranslation] = useState(
    translationExclusions,
  );

  // Sync local state when props change
  useEffect(() => {
    setLocalRomanization(romanizationExclusions);
    setLocalTranslation(translationExclusions);
  }, [romanizationExclusions, translationExclusions, isOpen]);

  const filteredLanguages = useMemo(() => {
    return AVAILABLE_LANGUAGES.filter((lang) =>
      lang.label.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [searchQuery]);

  const handleToggle = (langCode) => {
    if (activeTab === "romanization") {
      setLocalRomanization((prev) =>
        prev.includes(langCode)
          ? prev.filter((code) => code !== langCode)
          : [...prev, langCode],
      );
    } else {
      setLocalTranslation((prev) =>
        prev.includes(langCode)
          ? prev.filter((code) => code !== langCode)
          : [...prev, langCode],
      );
    }
  };

  const handleReset = () => {
    if (activeTab === "romanization") {
      setLocalRomanization([]);
    } else {
      setLocalTranslation([]);
    }
  };

  const currentExcludedList =
    activeTab === "romanization" ? localRomanization : localTranslation;

  const handleClose = () => {
    // Save on close
    onUpdateExclusions({
      romanization: localRomanization,
      translation: localTranslation,
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          onClick={handleClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0, 0, 0, 0.76)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            zIndex: 100,
            overflow: "hidden",
            willChange: "opacity",
          }}
        >
          <motion.div
            onClick={(event) => event.stopPropagation()}
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            style={{
              width: "100%",
              maxWidth: "520px",
              height: "600px",
              maxHeight: "90%",
              background: "var(--lyrical-card-bg, #18181b)",
              border: "1px solid var(--lyrical-border, rgba(255,255,255,0.1))",
              borderRadius: "22px",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.45)",
              color: "var(--lyrical-text-primary, #fff)",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              overflow: "hidden",
              transformOrigin: "center center",
              willChange: "transform, opacity",
              contain: "layout paint",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "20px 24px 16px",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "700" }}>
                {t("languageExclusions_title")}
              </h3>
              <button
                type="button"
                onClick={handleClose}
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "999px",
                  border: "none",
                  background:
                    "var(--lyrical-panel-surface-soft, rgba(255,255,255,0.05))",
                  color: "var(--lyrical-text-secondary, #a1a1aa)",
                  display: "grid",
                  placeItems: "center",
                  cursor: "pointer",
                  transition: "background 0.2s, color 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background =
                    "var(--lyrical-panel-surface, rgba(255,255,255,0.1))";
                  e.currentTarget.style.color =
                    "var(--lyrical-text-primary, #fff)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background =
                    "var(--lyrical-panel-surface-soft, rgba(255,255,255,0.05))";
                  e.currentTarget.style.color =
                    "var(--lyrical-text-secondary, #a1a1aa)";
                }}
                aria-label={t("languageExclusions_close")}
              >
                <X size={18} />
              </button>
            </div>

            {/* Tabs */}
            <div
              style={{
                display: "flex",
                padding: "0 24px 16px",
                gap: "8px",
                borderBottom:
                  "1px solid var(--lyrical-border-soft, rgba(255,255,255,0.05))",
              }}
            >
              {["romanization", "translation"].map((tab) => {
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      background: isActive
                        ? "var(--lyrical-card-bg-elevated, #27272a)"
                        : "transparent",
                      border: "none",
                      padding: "8px 16px",
                      color: isActive
                        ? "var(--lyrical-text-primary, #fff)"
                        : "var(--lyrical-text-muted, #71717a)",
                      fontWeight: isActive ? "600" : "500",
                      fontSize: "14px",
                      borderRadius: "20px",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                  >
                    {tab === "romanization"
                      ? t("languageExclusions_romanizationTab")
                      : t("languageExclusions_translationTab")}
                  </button>
                );
              })}
            </div>

            {/* Content Area */}
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.15 }}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    padding: "20px 24px",
                    overflow: "hidden",
                  }}
                >
                  {/* Search Input */}
                  <div
                    style={{
                      position: "relative",
                      marginBottom: "16px",
                      flexShrink: 0,
                    }}
                  >
                    <Search
                      size={16}
                      style={{
                        position: "absolute",
                        left: "12px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "var(--lyrical-text-muted, #71717a)",
                        pointerEvents: "none",
                      }}
                    />
                    <input
                      type="text"
                      placeholder={t("languageExclusions_search")}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px 12px 10px 36px",
                        background:
                          "var(--lyrical-panel-surface-soft, rgba(255,255,255,0.03))",
                        border:
                          "1px solid var(--lyrical-border, rgba(255,255,255,0.1))",
                        borderRadius: "10px",
                        color: "var(--lyrical-text-primary, #fff)",
                        fontSize: "14px",
                        outline: "none",
                        transition: "border-color 0.2s",
                        boxSizing: "border-box",
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor =
                          "var(--lyrical-accent, #3ea6ff)";
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor =
                          "var(--lyrical-border, rgba(255,255,255,0.1))";
                      }}
                    />
                  </div>

                  <p
                    style={{
                      margin: "0 0 16px 0",
                      fontSize: "13px",
                      color: "var(--lyrical-text-muted, #71717a)",
                    }}
                  >
                    {activeTab === "romanization"
                      ? t("languageExclusions_hintRomanization")
                      : t("languageExclusions_hintTranslation")}
                  </p>

                  {/* Language Grid */}
                  <div
                    style={{
                      flex: 1,
                      overflowY: "scroll",
                      display: "flex",
                      flexWrap: "wrap",
                      alignContent: "flex-start",
                      gap: "8px",
                      paddingBottom: "16px",
                    }}
                  >
                    {filteredLanguages.length > 0 ? (
                      filteredLanguages.map((lang) => {
                        const isExcluded = currentExcludedList.includes(
                          lang.code,
                        );
                        return (
                          <button
                            key={lang.code}
                            onClick={() => handleToggle(lang.code)}
                            style={{
                              padding: "8px 14px",
                              background: isExcluded
                                ? "var(--lyrical-accent-soft, rgba(62,166,255,0.1))"
                                : "var(--lyrical-panel-surface-soft, rgba(255,255,255,0.05))",
                              border: isExcluded
                                ? "1px solid var(--lyrical-accent, #3ea6ff)"
                                : "1px solid var(--lyrical-border, rgba(255,255,255,0.1))",
                              color: isExcluded
                                ? "var(--lyrical-accent, #3ea6ff)"
                                : "var(--lyrical-text-secondary, #a1a1aa)",
                              borderRadius: "12px",
                              fontSize: "13px",
                              fontWeight: isExcluded ? "600" : "500",
                              cursor: "pointer",
                              transition: "all 0.2s ease",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                            onMouseEnter={(e) => {
                              if (!isExcluded) {
                                e.currentTarget.style.background =
                                  "var(--lyrical-panel-surface, rgba(255,255,255,0.1))";
                                e.currentTarget.style.color =
                                  "var(--lyrical-text-primary, #fff)";
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isExcluded) {
                                e.currentTarget.style.background =
                                  "var(--lyrical-panel-surface-soft, rgba(255,255,255,0.05))";
                                e.currentTarget.style.color =
                                  "var(--lyrical-text-secondary, #a1a1aa)";
                              }
                            }}
                          >
                            {lang.label}
                          </button>
                        );
                      })
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          textAlign: "center",
                          padding: "32px 0",
                          color: "var(--lyrical-text-muted, #71717a)",
                          fontSize: "13px",
                        }}
                      >
                        {t("languageExclusions_noResults", [searchQuery])}
                      </div>
                    )}
                  </div>

                  {/* Footer Actions */}
                  <div
                    style={{
                      paddingTop: "16px",
                      borderTop:
                        "1px solid var(--lyrical-border-soft, rgba(255,255,255,0.05))",
                      display: "flex",
                      justifyContent: "flex-end",
                      flexShrink: 0,
                    }}
                  >
                    <button
                      type="button"
                      onClick={handleReset}
                      style={{
                        padding: "10px 16px",
                        background: "var(--lyrical-card-bg-elevated, #27272a)",
                        border:
                          "1px solid var(--lyrical-border, rgba(255,255,255,0.1))",
                        color: "var(--lyrical-text-primary, #fff)",
                        borderRadius: "12px",
                        fontSize: "13px",
                        fontWeight: "600",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background =
                          "var(--lyrical-panel-surface, rgba(255,255,255,0.1))";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background =
                          "var(--lyrical-card-bg-elevated, #27272a)";
                      }}
                    >
                      {t("languageExclusions_reset", [
                        activeTab === "romanization"
                          ? t("languageExclusions_romanizationTab")
                          : t("languageExclusions_translationTab"),
                      ])}
                    </button>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default LanguageExclusionsModal;
