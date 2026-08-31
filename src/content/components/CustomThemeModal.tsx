import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Palette, Sparkles, X } from "lucide-react";
import {
  createCustomThemeFromDraft,
  getCustomThemeInitialDraft,
  isValidThemeColor,
} from "../../themes/customThemeUtils";
import ColorPaletteModal from "./ColorPaletteModal";
import { t } from "../../i18n";

const THEME_FIELDS = [
  { key: "panelStart", labelKey: "customTheme_panelStart", placeholder: "#1a1a2e" },
  { key: "panelEnd", labelKey: "customTheme_panelEnd", placeholder: "#16213e" },
  { key: "accent", labelKey: "customTheme_accent", placeholder: "#3ea6ff" },
  { key: "cardBg", labelKey: "customTheme_cardBg", placeholder: "#18181b" },
  { key: "textPrimary", labelKey: "customTheme_textPrimary", placeholder: "#ffffff" },
  { key: "textSecondary", labelKey: "customTheme_textSecondary", placeholder: "#a1a1aa" },
  {
    key: "romanized",
    labelKey: "customTheme_romanized",
    placeholder: "rgba(187, 134, 252, 0.8)",
  },
  {
    key: "translated",
    labelKey: "customTheme_translated",
    placeholder: "rgba(62, 166, 255, 0.8)",
  },
];

const fieldLabelStyle = {
  display: "block",
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--lyrical-text-secondary, #a1a1aa)",
  marginBottom: "8px",
};

const inputStyle = {
  width: "100%",
  padding: "11px 12px",
  borderRadius: "12px",
  border: "1px solid var(--lyrical-border, rgba(255,255,255,0.1))",
  background: "var(--lyrical-card-bg-elevated, #27272a)",
  color: "var(--lyrical-text-primary, #fff)",
  fontSize: "13px",
  outline: "none",
};

const buttonStyle = {
  padding: "10px 16px",
  borderRadius: "12px",
  border: "1px solid var(--lyrical-border, rgba(255,255,255,0.1))",
  background: "var(--lyrical-card-bg-elevated, #27272a)",
  color: "var(--lyrical-text-primary, #fff)",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
  transition: "all 0.2s ease",
};

const CustomThemeModal = ({
  isOpen,
  onClose,
  onSaveTheme,
  seedTheme,
  mode = "create",
}) => {
  const [draft, setDraft] = useState(() =>
    getCustomThemeInitialDraft(seedTheme),
  );
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [activeColorField, setActiveColorField] = useState(null);
  const [hoverCancel, setHoverCancel] = useState(false);
  const [hoverSave, setHoverSave] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDraft(getCustomThemeInitialDraft(seedTheme));
      setError("");
      setIsSaving(false);
      setActiveColorField(null);
      setHoverCancel(false);
      setHoverSave(false);
    }
  }, [isOpen, seedTheme]);

  const isEditMode = mode === "edit";

  const invalidFields = useMemo(
    () =>
      THEME_FIELDS.filter((field) => !isValidThemeColor(draft[field.key])).map(
        (field) => field.key,
      ),
    [draft],
  );

  const previewTheme = useMemo(() => {
    if (!draft.name.trim() || invalidFields.length > 0) return null;
    try {
      return createCustomThemeFromDraft(draft);
    } catch {
      return null;
    }
  }, [draft, invalidFields]);

  const handleSave = async () => {
    if (!draft.name.trim()) {
      setError(t("customTheme_errorName"));
      return;
    }

    if (invalidFields.length > 0) {
      setError(t("customTheme_errorColors"));
      return;
    }

    setError("");
    setIsSaving(true);

    try {
      await onSaveTheme(draft);
      onClose();
    } catch (saveError) {
      setError(saveError.message || t("customTheme_errorSave"));
    } finally {
      setIsSaving(false);
    }
  };

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
            zIndex: 110,
            overflow: "hidden",
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
              maxWidth: "620px",
              maxHeight: "100%",
              background: "var(--lyrical-card-bg, #18181b)",
              border: "1px solid var(--lyrical-border, rgba(255,255,255,0.1))",
              borderRadius: "24px",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.45)",
              color: "var(--lyrical-text-primary, #fff)",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              overflow: "hidden",
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
                  {isEditMode
                    ? t("customTheme_headerEdit")
                    : t("customTheme_headerCreate")}
                </div>
                <h3 style={{ margin: 0, fontSize: "30px", lineHeight: 1.05 }}>
                  {isEditMode
                    ? t("customTheme_titleEdit")
                    : t("customTheme_titleCreate")}
                </h3>
              </div>

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
                aria-label={t("customTheme_close")}
              >
                <X size={18} />
              </button>
            </div>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                padding: "22px 24px 28px",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1.2fr) minmax(240px, 0.8fr)",
                  gap: "18px",
                  alignItems: "start",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                  }}
                >
                  <div>
                    <label style={fieldLabelStyle} htmlFor="custom-theme-name">
                      {t("customTheme_nameLabel")}
                    </label>
                    <input
                      id="custom-theme-name"
                      value={draft.name}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          name: event.target.value,
                        }))
                      }
                      placeholder={t("customTheme_namePlaceholder")}
                      style={inputStyle}
                    />
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: "14px",
                    }}
                  >
                    {THEME_FIELDS.map((field) => {
                      const isInvalid = invalidFields.includes(field.key);

                      return (
                        <div key={field.key}>
                          <label style={fieldLabelStyle} htmlFor={field.key}>
                            {t(field.labelKey)}
                          </label>
                          <div style={{ position: "relative" }}>
                            <input
                              id={field.key}
                              value={draft[field.key]}
                              onChange={(event) =>
                                setDraft((prev) => ({
                                  ...prev,
                                  [field.key]: event.target.value,
                                }))
                              }
                              placeholder={field.placeholder}
                              style={{
                                ...inputStyle,
                                paddingRight: "40px",
                                border: isInvalid
                                  ? "1px solid var(--lyrical-danger, #ef4444)"
                                  : inputStyle.border,
                              }}
                            />
                            <span
                              onClick={() => setActiveColorField(field.key)}
                              style={{
                                position: "absolute",
                                right: "12px",
                                top: "50%",
                                transform: "translateY(-50%)",
                                width: "16px",
                                height: "16px",
                                borderRadius: "999px",
                                background: isInvalid
                                  ? "transparent"
                                  : draft[field.key],
                                border: isInvalid
                                  ? "1px dashed var(--lyrical-danger, #ef4444)"
                                  : "1px solid rgba(255,255,255,0.18)",
                                cursor: "pointer",
                              }}
                              title={t("customTheme_pickColor", [
                                t(field.labelKey),
                              ])}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: "14px",
                      background:
                        "var(--lyrical-panel-surface-soft, rgba(255,255,255,0.05))",
                      border:
                        "1px solid var(--lyrical-border-soft, rgba(255,255,255,0.07))",
                      fontSize: "12px",
                      lineHeight: 1.6,
                      color: "var(--lyrical-text-secondary, #a1a1aa)",
                    }}
                  >
                    {t("customTheme_help")}
                  </div>

                  {error && (
                    <div
                      style={{
                        padding: "12px 14px",
                        borderRadius: "14px",
                        background: "rgba(239, 68, 68, 0.12)",
                        border: "1px solid rgba(239, 68, 68, 0.24)",
                        color: "var(--lyrical-text-primary, #fff)",
                        fontSize: "12px",
                      }}
                    >
                      {error}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "14px",
                    position: "sticky",
                    top: 0,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      color: "var(--lyrical-text-secondary, #a1a1aa)",
                      fontSize: "13px",
                      fontWeight: 600,
                    }}
                  >
                    <Sparkles size={14} />
                    {t("customTheme_livePreview")}
                  </div>

                  <div
                    style={{
                      borderRadius: "20px",
                      overflow: "hidden",
                      border:
                        "1px solid var(--lyrical-border, rgba(255,255,255,0.1))",
                      background: "var(--lyrical-card-bg-elevated, #27272a)",
                    }}
                  >
                    <div
                      style={{
                        height: "118px",
                        background:
                          previewTheme?.tokens["--lyrical-panel-bg"] ||
                          "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
                        position: "relative",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          left: "14px",
                          top: "14px",
                          width: "34px",
                          height: "34px",
                          borderRadius: "12px",
                          background:
                            previewTheme?.tokens[
                              "--lyrical-panel-surface-soft"
                            ] || "rgba(255,255,255,0.06)",
                          border: `1px solid ${
                            previewTheme?.tokens["--lyrical-border"] ||
                            "rgba(255,255,255,0.1)"
                          }`,
                        }}
                      />
                      <div
                        style={{
                          position: "absolute",
                          right: "14px",
                          bottom: "14px",
                          width: "56px",
                          height: "8px",
                          borderRadius: "999px",
                          background:
                            previewTheme?.tokens["--lyrical-slider-gradient"] ||
                            "linear-gradient(to right, #ff4444, #3ea6ff, #44ff44)",
                        }}
                      />
                    </div>

                    <div
                      style={{
                        padding: "16px",
                        background:
                          previewTheme?.tokens["--lyrical-card-bg"] ||
                          "var(--lyrical-card-bg, #18181b)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "18px",
                          fontWeight: 700,
                          color:
                            previewTheme?.tokens["--lyrical-text-primary"] ||
                            "var(--lyrical-text-primary, #fff)",
                          marginBottom: "6px",
                        }}
                      >
                        {draft.name.trim() || t("customTheme_previewTheme")}
                      </div>
                      <div
                        style={{
                          fontSize: "13px",
                          color:
                            previewTheme?.tokens["--lyrical-text-secondary"] ||
                            "var(--lyrical-text-secondary, #a1a1aa)",
                          marginBottom: "10px",
                        }}
                      >
                        {t("customTheme_previewDescription")}
                      </div>
                      <div
                        style={{
                          fontSize: "15px",
                          fontWeight: 700,
                          color:
                            previewTheme?.tokens["--lyrical-text-primary"] ||
                            "var(--lyrical-text-primary, #fff)",
                          marginBottom: "8px",
                        }}
                      >
                        Kanashimi wa mada
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color:
                            previewTheme?.tokens["--lyrical-romanized"] ||
                            "rgba(187, 134, 252, 0.8)",
                          marginBottom: "4px",
                        }}
                      >
                        kanashimi wa mada
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color:
                            previewTheme?.tokens["--lyrical-translated"] ||
                            "rgba(62, 166, 255, 0.8)",
                        }}
                      >
                        the sadness still lingers
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                padding: "16px 24px 22px",
                borderTop:
                  "1px solid var(--lyrical-border, rgba(255,255,255,0.1))",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  fontSize: "12px",
                  color: "var(--lyrical-text-muted, #71717a)",
                  maxWidth: "13rem",
                  textWrap: "wrap",
                }}
              >
                <Palette size={18} />
                {isEditMode
                  ? t("customTheme_footerEdit")
                  : t("customTheme_footerCreate")}
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  onClick={onClose}
                  onMouseEnter={() => setHoverCancel(true)}
                  onMouseLeave={() => setHoverCancel(false)}
                  style={{
                    ...buttonStyle,
                    color: "var(--lyrical-text-primary, #fff)",
                    borderColor: hoverCancel
                      ? "var(--lyrical-card-bg-elevated, #27272a)"
                      : "var(--lyrical-border, rgba(255,255,255,0.1))",
                    opacity: hoverCancel ? 0.9 : 1,
                  }}
                >
                  {t("common_cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  onMouseEnter={() => setHoverSave(true)}
                  onMouseLeave={() => setHoverSave(false)}
                  style={{
                    ...buttonStyle,
                    background: "var(--lyrical-accent, #3ea6ff)",
                    borderColor: hoverSave
                      ? "var(--lyrical-accent, #3ea6ff)"
                      : "transparent",
                    color: "var(--lyrical-text-contrast, #121212)",
                    opacity: isSaving ? 0.72 : hoverSave ? 0.85 : 1,
                    cursor: isSaving ? "progress" : "pointer",
                    textWrap: "nowrap",
                  }}
                >
                  {isSaving
                    ? isEditMode
                      ? t("customTheme_updating")
                      : t("customTheme_saving")
                    : isEditMode
                      ? t("customTheme_update")
                      : t("customTheme_save")}
                </button>
              </div>
            </div>
          </motion.div>

          <ColorPaletteModal
            isOpen={!!activeColorField}
            onClose={() => setActiveColorField(null)}
            currentColor={activeColorField ? draft[activeColorField] : null}
            title={t("customTheme_pickColor", [
              activeColorField
                ? t(
                    THEME_FIELDS.find((field) => field.key === activeColorField)
                      ?.labelKey || "colorPalette_defaultTitle",
                  )
                : "",
            ])}
            onSelectColor={(hex) => {
              setDraft((prev) => ({ ...prev, [activeColorField]: hex }));
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CustomThemeModal;
