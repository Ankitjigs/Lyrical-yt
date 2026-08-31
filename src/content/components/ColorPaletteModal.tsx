import React, { useState, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { t } from "../../i18n";

const pickerStyles = {
  default: {
    picker: {
      background: "var(--lyrical-card-bg-elevated, #27272a)",
      border: "1px solid var(--lyrical-border, rgba(255,255,255,0.1))",
      boxShadow: "0 12px 32px rgba(0, 0, 0, 0.5)",
      borderRadius: "20px",
      fontFamily: "inherit",
      width: "100%",
      boxSizing: "border-box",
    },
    body: {
      padding: "16px 20px 20px",
    },
  },
};

const ColorPaletteModal = ({
  isOpen,
  onClose,
  onSelectColor,
  currentColor,
  title = t("colorPalette_defaultTitle"),
}) => {
  // Local state to track color during dragging for smooth UI
  // Initialize with currentColor or a default
  const [localColor, setLocalColor] = useState(currentColor || "#3ea6ff");
  const [ChromePickerComponent, setChromePickerComponent] = useState(null);

  // Sync local color when parent changes it or modal opens
  useEffect(() => {
    if (isOpen && currentColor) {
      setLocalColor(currentColor);
    }
  }, [isOpen, currentColor]);

  useEffect(() => {
    if (!isOpen || ChromePickerComponent) return;

    let cancelled = false;

    import("react-color")
      .then((module) => {
        if (!cancelled) {
          setChromePickerComponent(() => module.ChromePicker);
        }
      })
      .catch((error) => {
        console.error("[Lyrical] Failed to load react-color:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [ChromePickerComponent, isOpen]);

  const handleChange = (newColor) => {
    setLocalColor(newColor.rgb);

    // Choose the best format to emit back to parent
    // If there is an alpha channel less than 1, emit rgba, otherwise emit hex.
    if (newColor.rgb.a !== undefined && newColor.rgb.a < 1) {
      onSelectColor(
        `rgba(${newColor.rgb.r}, ${newColor.rgb.g}, ${newColor.rgb.b}, ${newColor.rgb.a})`,
      );
    } else {
      onSelectColor(newColor.hex);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0, 0, 0, 0.45)",
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            zIndex: 120, // Must be higher than CustomThemeModal (110)
          }}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            style={{
              width: "100%",
              maxWidth: "300px",
            }}
          >
            {/* Deep CSS overrides to perfectly match the dark theme */}
            <style>
              {`
                .lyrical-chrome-picker-wrapper * {
                  font-family: inherit !important;
                }
                .lyrical-chrome-picker-wrapper input {
                  background-color: var(--lyrical-card-bg, #18181b) !important;
                  color: var(--lyrical-text-primary, #fff) !important;
                  border: 1px solid var(--lyrical-border, rgba(255,255,255,0.1)) !important;
                  border-radius: 8px !important;
                  box-shadow: inset 0 2px 4px rgba(0,0,0,0.2) !important;
                  padding: 14px 8px !important;
                  font-size: 11px !important;
                  font-weight: 500 !important;
                  text-align: center !important;
                  transition: all 0.2s ease !important;
                }
                .lyrical-chrome-picker-wrapper input:focus {
                  outline: none !important;
                  border-color: var(--lyrical-accent, #3ea6ff) !important;
                }
                .lyrical-chrome-picker-wrapper svg {
                  fill: var(--lyrical-text-secondary, #a1a1aa) !important;
                  transition: all 0.2s ease;
                }
                .lyrical-chrome-picker-wrapper svg:hover {
                  fill: var(--lyrical-text-primary, #fff) !important;
                  background: var(--lyrical-panel-surface-soft, rgba(255,255,255,0.05)) !important;
                  border-radius: 4px !important;
                }
                /* Fix label colors (HEX, R, G, B, A text under the inputs) */
                .lyrical-chrome-picker-wrapper span {
                  color: var(--lyrical-text-secondary, #a1a1aa) !important;
                  font-weight: 600 !important;
                  font-size: 10px !important;
                  margin-top: 10px !important;
                }
                /* Hide the default tiny grey top border that ChromePicker has */
                .lyrical-chrome-picker-wrapper > div > div:nth-child(2) > div:nth-child(1) {
                  border: none !important;
                  box-shadow: none !important;
                }
                /* Fix the pointer on the hue/alpha sliders */
                .lyrical-chrome-picker-wrapper > div > div:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div > div:nth-child(1) > div > div {
                   box-shadow: 0 0 2px rgba(0,0,0,0.8), inset 0 0 1px rgba(0,0,0,0.3) !important;
                }
                .lyrical-chrome-picker-wrapper > div > div:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div > div:nth-child(2) > div > div > div > div {
                   box-shadow: 0 0 2px rgba(0,0,0,0.8), inset 0 0 1px rgba(0,0,0,0.3) !important;
                }
                /* Align the inputs and up/down toggle button */
                .lyrical-chrome-picker-wrapper > div > div:nth-child(2) > div:last-child {
                  align-items: flex-start !important;
                  gap: 16px !important;
                  margin-top: 4px !important;
                }
                .lyrical-chrome-picker-wrapper > div > div:nth-child(2) > div:last-child > div:last-child > div {
                  margin-top: 2px !important;
                  display: flex !important;
                  align-items: flex-start !important;
                  height: 38px !important; /* Match input height to center visually */
                }
              `}
            </style>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "16px",
                padding: "16px 20px",
                background: "var(--lyrical-card-bg-elevated, #27272a)",
                border:
                  "1px solid var(--lyrical-border, rgba(255,255,255,0.1))",
                borderBottom: "none",
                borderTopLeftRadius: "20px",
                borderTopRightRadius: "20px",
                color: "var(--lyrical-text-primary, #fff)",
              }}
            >
              <h4 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>
                {title}
              </h4>
              <button
                type="button"
                onClick={onClose}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "999px",
                  border: "none",
                  background:
                    "var(--lyrical-panel-surface-soft, rgba(255,255,255,0.05))",
                  color: "var(--lyrical-text-secondary, #a1a1aa)",
                  display: "grid",
                  placeItems: "center",
                  cursor: "pointer",
                }}
                aria-label={t("colorPalette_close")}
              >
                <X size={16} />
              </button>
            </div>

            <div className="lyrical-chrome-picker-wrapper">
              {ChromePickerComponent ? (
                <ChromePickerComponent
                  color={localColor}
                  onChange={handleChange}
                  styles={{
                    default: {
                      ...pickerStyles.default,
                      picker: {
                        ...pickerStyles.default.picker,
                        borderTopLeftRadius: 0,
                        borderTopRightRadius: 0,
                        borderTop:
                          "1px solid var(--lyrical-border, rgba(255,255,255,0.1))",
                      },
                    },
                  }}
                  disableAlpha={false}
                />
              ) : (
                <div
                  style={{
                    background: "var(--lyrical-card-bg-elevated, #27272a)",
                    border:
                      "1px solid var(--lyrical-border, rgba(255,255,255,0.1))",
                    borderBottomLeftRadius: "20px",
                    borderBottomRightRadius: "20px",
                    color: "var(--lyrical-text-secondary, #a1a1aa)",
                    padding: "32px 20px",
                    textAlign: "center",
                    fontSize: "13px",
                    fontWeight: 500,
                  }}
                >
                  {t("colorPalette_loading")}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ColorPaletteModal;
