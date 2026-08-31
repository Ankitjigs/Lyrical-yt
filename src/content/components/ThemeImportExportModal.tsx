import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileJson, Upload, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  parseThemeImportPayload,
  resolveCustomThemes,
} from "../../themes/customThemeUtils";
import { t } from "../../i18n";

const iconButtonStyle = {
  width: "40px",
  height: "40px",
  borderRadius: "999px",
  border: "none",
  background: "var(--lyrical-panel-surface-soft, rgba(255,255,255,0.05))",
  color: "var(--lyrical-text-secondary, #a1a1aa)",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
};

const actionButtonStyle = {
  minHeight: "42px",
  padding: "10px 16px",
  borderRadius: "12px",
  border: "1px solid var(--lyrical-border, rgba(255,255,255,0.1))",
  color: "var(--lyrical-text-primary, #fff)",
  fontSize: "14px",
  fontWeight: 700,
  cursor: "pointer",
};

const ThemeImportExportModal = ({
  isOpen,
  onClose,
  onImportThemes,
  existingThemes = [],
}) => {
  const [rawText, setRawText] = useState("");
  const [error, setError] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setRawText("");
      setError("");
      setIsImporting(false);
    }
  }, [isOpen]);

  const parseResult = useMemo(() => {
    if (!rawText.trim()) return { records: [], error: "" };
    try {
      return {
        records: parseThemeImportPayload(rawText, existingThemes),
        error: "",
      };
    } catch (parseError) {
      return {
        records: [],
        error: parseError.message || t("themeImport_errorFailed"),
      };
    }
  }, [rawText, existingThemes]);
  const parsedRecords = parseResult.records;
  const displayedError = error || parseResult.error;

  const previewTheme = useMemo(() => {
    if (!parsedRecords.length) return null;
    return resolveCustomThemes([parsedRecords[0]])[0] || null;
  }, [parsedRecords]);

  const handleFile = async (file) => {
    if (!file) return;
    try {
      setRawText(await file.text());
      setError("");
    } catch {
      setError(t("themeImport_errorRead"));
    }
  };

  const handleImport = async () => {
    if (!parsedRecords.length) {
      setError(t("themeImport_errorInvalid"));
      return;
    }

    setIsImporting(true);
    try {
      await onImportThemes(parsedRecords);
      onClose();
    } catch (importError) {
      setError(importError.message || t("themeImport_errorFailed"));
    } finally {
      setIsImporting(false);
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
            zIndex: 112,
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
              maxWidth: "560px",
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
                    fontSize: "13px",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--lyrical-text-muted, #71717a)",
                    marginBottom: "6px",
                    fontWeight: 700,
                  }}
                >
                  {t("settings_theme_library")}
                </div>
                <h3 style={{ margin: 0, fontSize: "30px", lineHeight: 1.05 }}>
                  {t("themeImport_title")}
                </h3>
              </div>

              <button
                type="button"
                onClick={onClose}
                style={iconButtonStyle}
                aria-label={t("themeImport_close")}
              >
                <X size={18} />
              </button>
            </div>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                padding: "22px 24px 24px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                style={{ display: "none" }}
                onChange={(event) => handleFile(event.target.files?.[0])}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  minHeight: "84px",
                  borderRadius: "16px",
                  border:
                    "1px dashed var(--lyrical-border, rgba(255,255,255,0.16))",
                  background:
                    "var(--lyrical-panel-surface-soft, rgba(255,255,255,0.05))",
                  color: "var(--lyrical-text-primary, #fff)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: 700,
                }}
              >
                <Upload size={18} />
                {t("themeImport_chooseJson")}
              </button>

              <div>
                <label
                  htmlFor="theme-import-json"
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "var(--lyrical-text-secondary, #a1a1aa)",
                    marginBottom: "8px",
                  }}
                >
                  {t("themeImport_jsonLabel")}
                </label>
                <textarea
                  id="theme-import-json"
                  value={rawText}
                onChange={(event) => setRawText(event.target.value)}
                  spellCheck={false}
                  placeholder={t("themeImport_jsonPlaceholder")}
                  style={{
                    width: "100%",
                    minHeight: "132px",
                    resize: "vertical",
                    padding: "12px",
                    borderRadius: "14px",
                    border:
                      "1px solid var(--lyrical-border, rgba(255,255,255,0.1))",
                    background: "var(--lyrical-card-bg-elevated, #27272a)",
                    color: "var(--lyrical-text-primary, #fff)",
                    fontSize: "12px",
                    lineHeight: 1.5,
                    outline: "none",
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
                  }}
                />
              </div>

              {(displayedError || previewTheme) && (
                <div
                  style={{
                    borderRadius: "16px",
                    border: displayedError
                      ? "1px solid rgba(239, 68, 68, 0.28)"
                      : "1px solid var(--lyrical-border, rgba(255,255,255,0.1))",
                    background: displayedError
                      ? "rgba(239, 68, 68, 0.12)"
                      : "var(--lyrical-panel-surface-soft, rgba(255,255,255,0.05))",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "12px 14px",
                      color: "var(--lyrical-text-primary, #fff)",
                      fontSize: "13px",
                      fontWeight: 700,
                    }}
                  >
                    {displayedError ? (
                      <AlertTriangle size={16} />
                    ) : (
                      <CheckCircle2 size={16} />
                    )}
                    {displayedError ||
                      (parsedRecords.length === 1
                        ? t("themeImport_themeReady", [
                            String(parsedRecords.length),
                          ])
                        : t("themeImport_themesReady", [
                            String(parsedRecords.length),
                          ]))}
                  </div>

                  {previewTheme && !displayedError && (
                    <div>
                      <div
                        style={{
                          height: "70px",
                          background: previewTheme.tokens["--lyrical-panel-bg"],
                          position: "relative",
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            left: "14px",
                            bottom: "14px",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            color:
                              previewTheme.tokens["--lyrical-text-primary"],
                            fontSize: "13px",
                            fontWeight: 800,
                          }}
                        >
                          <FileJson size={16} />
                          {previewTheme.name}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                padding: "16px 24px 22px",
                borderTop:
                  "1px solid var(--lyrical-border, rgba(255,255,255,0.1))",
              }}
            >
              <button
                type="button"
                onClick={onClose}
                style={{
                  ...actionButtonStyle,
                  background: "var(--lyrical-panel-surface-soft)",
                }}
              >
                {t("common_cancel")}
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={
                  !parsedRecords.length || Boolean(displayedError) || isImporting
                }
                style={{
                  ...actionButtonStyle,
                  background:
                    !parsedRecords.length || displayedError || isImporting
                      ? "var(--lyrical-panel-surface-soft)"
                      : "var(--lyrical-accent)",
                  color:
                    !parsedRecords.length || displayedError || isImporting
                      ? "var(--lyrical-text-muted)"
                      : "var(--lyrical-text-contrast)",
                  cursor:
                    !parsedRecords.length || displayedError || isImporting
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {isImporting ? t("themeImport_importing") : t("themeImport_title")}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ThemeImportExportModal;
