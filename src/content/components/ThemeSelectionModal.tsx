import React from "react";
import { Download, Pencil, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { PRESET_THEMES } from "../../themes";
import { t } from "../../i18n";

const ThemeSelectionModal = ({
  isOpen,
  onClose,
  selectedThemeId,
  onSelectTheme,
  customThemes = [],
  onEditCustomTheme,
  onDeleteCustomTheme,
  onExportCustomTheme,
}) => {
  const sections = [
    {
      id: "preset",
      label: t("themeChooser_sectionBuiltIn"),
      themes: PRESET_THEMES,
    },
    {
      id: "custom",
      label: t("themeChooser_sectionCustom"),
      themes: customThemes,
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          onClick={onClose}
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
              maxWidth: "460px",
              maxHeight: "100%",
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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "20px 24px",
                borderBottom:
                  "1px solid var(--lyrical-border, rgba(255,255,255,0.1))",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "14px",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--lyrical-text-muted, #71717a)",
                    marginBottom: "6px",
                    fontWeight: 700,
                  }}
                >
                  {t("themeChooser_sectionBuiltIn")}
                </div>
                <h3 style={{ margin: 0, fontSize: "32px", lineHeight: 1.05 }}>
                  {t("themeChooser_title")}
                </h3>
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "999px",
                    border: "none",
                    background:
                      "var(--lyrical-panel-surface-soft, rgba(255,255,255,0.05))",
                    color: "var(--lyrical-text-secondary, #a1a1aa)",
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                  }}
                  aria-label={t("themeChooser_close")}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                padding: "22px 24px 32px",
                overflowY: "auto",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "20px",
                }}
              >
                {sections.map((section) => (
                  <div key={section.id}>
                    <div
                      style={{
                        fontSize: "12px",
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: "var(--lyrical-text-muted, #71717a)",
                        marginBottom: "12px",
                        fontWeight: 700,
                      }}
                    >
                      {section.label}
                    </div>

                    {section.themes.length === 0 ? (
                      <div
                        style={{
                          borderRadius: "16px",
                          padding: "16px",
                          border:
                            "1px dashed var(--lyrical-border, rgba(255,255,255,0.1))",
                          color: "var(--lyrical-text-muted, #71717a)",
                          fontSize: "13px",
                        }}
                      >
                        {t("themeChooser_emptyCustom")}
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(180px, 1fr))",
                          gap: "14px",
                        }}
                      >
                        {section.themes.map((theme) => {
                          const isSelected = theme.id === selectedThemeId;
                          const themeName = theme.isCustom
                            ? theme.name
                            : t(`theme_${theme.id}_name`, undefined, theme.name);
                          const themeDescription = theme.isCustom
                            ? theme.description
                            : t(
                                `theme_${theme.id}_description`,
                                undefined,
                                theme.description,
                              );

                          return (
                            <div
                              key={theme.id}
                              onClick={() => {
                                onSelectTheme(theme.id);
                                onClose();
                              }}
                              onKeyDown={(event) => {
                                if (
                                  event.key === "Enter" ||
                                  event.key === " "
                                ) {
                                  event.preventDefault();
                                  onSelectTheme(theme.id);
                                  onClose();
                                }
                              }}
                              role="button"
                              tabIndex={0}
                              style={{
                                borderRadius: "18px",
                                border: isSelected
                                  ? "1px solid var(--lyrical-accent, #3ea6ff)"
                                  : "1px solid var(--lyrical-border, rgba(255,255,255,0.1))",
                                overflow: "hidden",
                                background:
                                  "var(--lyrical-panel-surface-soft, rgba(255,255,255,0.04))",
                                color: "inherit",
                                cursor: "pointer",
                                padding: 0,
                                textAlign: "left",
                                transition:
                                  "transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease",
                                boxShadow: isSelected
                                  ? "0 0 0 1px var(--lyrical-accent, #3ea6ff), 0 12px 30px rgba(0, 0, 0, 0.25)"
                                  : "none",
                                position: "relative",
                              }}
                            >
                              {theme.isCustom && (
                                <div
                                  style={{
                                    position: "absolute",
                                    top: "10px",
                                    right: "10px",
                                    display: "flex",
                                    gap: "6px",
                                    zIndex: 1,
                                  }}
                                >
                                  {typeof onEditCustomTheme === "function" && (
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        onEditCustomTheme(theme.id);
                                      }}
                                      style={{
                                        width: "30px",
                                        height: "30px",
                                        borderRadius: "999px",
                                        border: "none",
                                        display: "grid",
                                        placeItems: "center",
                                        background: "rgba(0, 0, 0, 0.25)",
                                        color:
                                          "var(--lyrical-text-primary, #fff)",
                                        cursor: "pointer",
                                      }}
                                      aria-label={t("themeChooser_edit", [
                                        themeName,
                                      ])}
                                      title={t("themeChooser_editTitle")}
                                    >
                                      <Pencil size={14} />
                                    </button>
                                  )}

                                  {typeof onExportCustomTheme ===
                                    "function" && (
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        onExportCustomTheme(theme.id);
                                      }}
                                      style={{
                                        width: "30px",
                                        height: "30px",
                                        borderRadius: "999px",
                                        border: "none",
                                        display: "grid",
                                        placeItems: "center",
                                        background: "rgba(0, 0, 0, 0.25)",
                                        color:
                                          "var(--lyrical-text-primary, #fff)",
                                        cursor: "pointer",
                                      }}
                                      aria-label={t("themeChooser_export", [
                                        themeName,
                                      ])}
                                      title={t("themeChooser_exportTitle")}
                                    >
                                      <Download size={14} />
                                    </button>
                                  )}

                                  {typeof onDeleteCustomTheme ===
                                    "function" && (
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        onDeleteCustomTheme(theme.id);
                                      }}
                                      style={{
                                        width: "30px",
                                        height: "30px",
                                        borderRadius: "999px",
                                        border: "none",
                                        display: "grid",
                                        placeItems: "center",
                                        background: "rgba(0, 0, 0, 0.25)",
                                        color:
                                          "var(--lyrical-text-primary, #fff)",
                                        cursor: "pointer",
                                      }}
                                      aria-label={t("themeChooser_delete", [
                                        themeName,
                                      ])}
                                      title={t("themeChooser_deleteTitle")}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  )}
                                </div>
                              )}

                              <div
                                style={{
                                  height: "78px",
                                  background:
                                    theme.tokens["--lyrical-panel-bg"],
                                  position: "relative",
                                }}
                              >
                                <div
                                  style={{
                                    position: "absolute",
                                    inset: "12px auto auto 12px",
                                    width: "34px",
                                    height: "34px",
                                    borderRadius: "12px",
                                    background:
                                      theme.tokens[
                                        "--lyrical-panel-surface-soft"
                                      ],
                                    border: `1px solid ${theme.tokens["--lyrical-border"]}`,
                                    boxShadow:
                                      "0 10px 18px rgba(0, 0, 0, 0.16)",
                                  }}
                                />
                                <div
                                  style={{
                                    position: "absolute",
                                    right: "12px",
                                    bottom: "12px",
                                    width: "54px",
                                    height: "8px",
                                    borderRadius: "999px",
                                    background:
                                      theme.tokens["--lyrical-slider-gradient"],
                                  }}
                                />
                              </div>

                              <div style={{ padding: "14px 14px 16px" }}>
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    gap: "10px",
                                    marginBottom: "6px",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: "17px",
                                      fontWeight: 700,
                                      color:
                                        "var(--lyrical-text-primary, #fff)",
                                    }}
                                  >
                                    {themeName}
                                  </span>
                                  {isSelected && (
                                    <span
                                      style={{
                                        padding: "4px 8px",
                                        borderRadius: "999px",
                                        background:
                                          "var(--lyrical-accent-soft, rgba(62,166,255,0.1))",
                                        color: "var(--lyrical-accent, #3ea6ff)",
                                        fontSize: "10px",
                                        fontWeight: 700,
                                        letterSpacing: "0.08em",
                                        textTransform: "uppercase",
                                      }}
                                    >
                                      {t("common_active")}
                                    </span>
                                  )}
                                </div>
                                <div
                                  style={{
                                    fontSize: "12px",
                                    color:
                                      "var(--lyrical-text-secondary, #a1a1aa)",
                                    marginBottom: "8px",
                                  }}
                                >
                                  {t("themeChooser_byAuthor", [theme.author])}
                                </div>
                                <p
                                  style={{
                                    margin: 0,
                                    fontSize: "12px",
                                    lineHeight: 1.5,
                                    color: "var(--lyrical-text-muted, #71717a)",
                                  }}
                                >
                                  {themeDescription}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ThemeSelectionModal;
