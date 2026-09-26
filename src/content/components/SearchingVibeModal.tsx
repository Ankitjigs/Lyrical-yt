import React from "react";
import { X, Check, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useAppStore, SearchingIndicatorStyle } from "../store";
import { SearchingVibeIcon } from "./SearchingVibeIcons";

interface SearchingVibeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface VibeOption {
  id: SearchingIndicatorStyle;
  name: string;
  tag: string;
  description: string;
}

const VIBE_OPTIONS: VibeOption[] = [
  {
    id: "lofi",
    name: "Lo-Fi Vinyl",
    tag: "Recommended",
    description: "Analog vinyl record with melodic notes floating into the air.",
  },
  {
    id: "disco",
    name: "Disco Ball",
    tag: "Retro Glint",
    description: "Retro mirror ball with sparkling diamond light reflections.",
  },
  {
    id: "rock",
    name: "Rock Pulse",
    tag: "Dynamic",
    description: "Dynamic neon audio bars pulsing with rhythmic energy.",
  },
  {
    id: "soothing",
    name: "Soothing Halo",
    tag: "Zen Acoustic",
    description: "Serene ambient acoustic rings expanding from a soft glow.",
  },
  {
    id: "none",
    name: "No Indicator",
    tag: "Minimalist",
    description: "Hide animation and show glowing searching text only.",
  },
];

export const SearchingVibeModal: React.FC<SearchingVibeModalProps> = ({
  isOpen,
  onClose,
}) => {
  const currentVibe = useAppStore(
    (state) => state.searchingIndicatorStyle || "lofi",
  );
  const setVibe = useAppStore((state) => state.setSearchingIndicatorStyle);

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
            background: "rgba(0, 0, 0, 0.74)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            zIndex: 100,
            overflow: "hidden",
          }}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Searching indicator vibe"
            initial={{ scale: 0.95, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            style={{
              width: "min(100%, 500px)",
              maxHeight: "90vh",
              overflowY: "auto",
              background: "var(--lyrical-panel-bg)",
              border: "1px solid var(--lyrical-border)",
              borderRadius: "18px",
              boxShadow: "0 24px 80px rgba(0, 0, 0, 0.55)",
              padding: "22px",
              display: "flex",
              flexDirection: "column",
              gap: "18px",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "14px",
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "4px",
                  }}
                >
                  <Sparkles size={18} color="var(--lyrical-accent)" />
                  <h3
                    style={{
                      margin: 0,
                      color: "var(--lyrical-text-primary)",
                      fontSize: "17.5px",
                      fontWeight: "750",
                      letterSpacing: "-0.2px",
                    }}
                  >
                    Searching Indicator Vibe
                  </h3>
                </div>
                <p
                  style={{
                    margin: 0,
                    color: "var(--lyrical-text-muted)",
                    fontSize: "12.5px",
                    lineHeight: 1.4,
                  }}
                >
                  Choose the micro-animation shown beside "Searching for lyrics..."
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "10px",
                  border: "1px solid var(--lyrical-border)",
                  background: "var(--lyrical-panel-hover)",
                  color: "var(--lyrical-text-muted)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  transition: "all 0.18s ease",
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--lyrical-text-primary)";
                  e.currentTarget.style.background = "var(--lyrical-accent-soft)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--lyrical-text-muted)";
                  e.currentTarget.style.background = "var(--lyrical-panel-hover)";
                }}
              >
                <X size={17} />
              </button>
            </div>

            {/* Vibe Options Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
              }}
            >
              {VIBE_OPTIONS.map((vibe) => {
                const isSelected = currentVibe === vibe.id;
                const isNone = vibe.id === "none";

                return (
                  <button
                    key={vibe.id}
                    type="button"
                    onClick={() => setVibe(vibe.id)}
                    style={{
                      gridColumn: isNone ? "1 / -1" : undefined,
                      padding: isNone ? "14px 16px" : "16px",
                      borderRadius: "16px",
                      border: isSelected
                        ? "2px solid var(--lyrical-accent)"
                        : "1px solid var(--lyrical-border)",
                      background: isSelected
                        ? "var(--lyrical-accent-soft)"
                        : "var(--lyrical-card-bg)",
                      color: "var(--lyrical-text-primary)",
                      cursor: "pointer",
                      textAlign: "left",
                      display: "flex",
                      flexDirection: isNone ? "row" : "column",
                      alignItems: isNone ? "center" : "stretch",
                      justifyContent: "space-between",
                      gap: isNone ? "14px" : "14px",
                      transition: "all 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
                      outline: "none",
                      boxShadow: isSelected
                        ? "0 4px 18px color-mix(in srgb, var(--lyrical-accent) 22%, transparent)"
                        : "none",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.borderColor =
                          "var(--lyrical-border-hover, rgba(255,255,255,0.25))";
                        e.currentTarget.style.background =
                          "var(--lyrical-card-bg-elevated)";
                        e.currentTarget.style.transform = "translateY(-2px)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.borderColor = "var(--lyrical-border)";
                        e.currentTarget.style.background = "var(--lyrical-card-bg)";
                        e.currentTarget.style.transform = "none";
                      }
                    }}
                  >
                    {isNone ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "14px",
                          flex: 1,
                        }}
                      >
                        <div
                          style={{
                            width: "48px",
                            height: "48px",
                            borderRadius: "14px",
                            background: isSelected
                              ? "color-mix(in srgb, var(--lyrical-accent) 22%, transparent)"
                              : "var(--lyrical-panel-surface)",
                            border: isSelected
                              ? "1.5px solid color-mix(in srgb, var(--lyrical-accent) 55%, transparent)"
                              : "1px solid var(--lyrical-border)",
                            boxShadow: isSelected
                              ? "0 0 16px color-mix(in srgb, var(--lyrical-accent) 28%, transparent)"
                              : "inset 0 1px 3px rgba(0, 0, 0, 0.35)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            transition: "all 0.2s ease",
                          }}
                        >
                          <SearchingVibeIcon
                            vibe="none"
                            size={26}
                            showNoneFallback={true}
                          />
                        </div>

                        <div>
                          <div
                            style={{
                              fontSize: "14px",
                              fontWeight: 750,
                              color: isSelected
                                ? "var(--lyrical-accent)"
                                : "var(--lyrical-text-primary)",
                              marginBottom: "3px",
                              letterSpacing: "-0.1px",
                            }}
                          >
                            {vibe.name}
                          </div>
                          <div
                            style={{
                              fontSize: "12px",
                              color: "var(--lyrical-text-muted)",
                              lineHeight: 1.35,
                            }}
                          >
                            {vibe.description}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Top Row: Generous 48px Animated Stage & Badge */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            width: "100%",
                          }}
                        >
                          <div
                            style={{
                              width: "48px",
                              height: "48px",
                              borderRadius: "14px",
                              background: isSelected
                                ? "color-mix(in srgb, var(--lyrical-accent) 22%, transparent)"
                                : "var(--lyrical-panel-surface)",
                              border: isSelected
                                ? "1.5px solid color-mix(in srgb, var(--lyrical-accent) 55%, transparent)"
                                : "1px solid var(--lyrical-border)",
                              boxShadow: isSelected
                                ? "0 0 16px color-mix(in srgb, var(--lyrical-accent) 28%, transparent)"
                                : "inset 0 1px 3px rgba(0, 0, 0, 0.35)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                              transition: "all 0.2s ease",
                            }}
                          >
                            <SearchingVibeIcon
                              vibe={vibe.id}
                              size={28}
                              reduceAnimations={false}
                            />
                          </div>

                          {isSelected ? (
                            <div
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "3.5px",
                                padding: "4px 9px",
                                borderRadius: "999px",
                                background: "var(--lyrical-accent)",
                                color: "var(--lyrical-accent-contrast, #000)",
                                fontSize: "11px",
                                fontWeight: 700,
                                letterSpacing: "0.2px",
                                boxShadow:
                                  "0 2px 8px color-mix(in srgb, var(--lyrical-accent) 35%, transparent)",
                              }}
                            >
                              <Check size={11} strokeWidth={3} />
                              Active
                            </div>
                          ) : (
                            <span
                              style={{
                                fontSize: "10.5px",
                                fontWeight: 600,
                                color: "var(--lyrical-text-muted)",
                                padding: "3.5px 8px",
                                borderRadius: "999px",
                                background: "var(--lyrical-panel-hover)",
                                border: "1px solid var(--lyrical-border-soft)",
                              }}
                            >
                              {vibe.tag}
                            </span>
                          )}
                        </div>

                        {/* Vibe Info */}
                        <div>
                          <div
                            style={{
                              fontSize: "14px",
                              fontWeight: 750,
                              color: isSelected
                                ? "var(--lyrical-accent)"
                                : "var(--lyrical-text-primary)",
                              marginBottom: "4px",
                              letterSpacing: "-0.1px",
                            }}
                          >
                            {vibe.name}
                          </div>
                          <div
                            style={{
                              fontSize: "12px",
                              color: "var(--lyrical-text-muted)",
                              lineHeight: 1.4,
                            }}
                          >
                            {vibe.description}
                          </div>
                        </div>
                      </>
                    )}

                    {isNone && (
                      <div style={{ flexShrink: 0 }}>
                        {isSelected ? (
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "3.5px",
                              padding: "4px 9px",
                              borderRadius: "999px",
                              background: "var(--lyrical-accent)",
                              color: "var(--lyrical-accent-contrast, #000)",
                              fontSize: "11px",
                              fontWeight: 700,
                              letterSpacing: "0.2px",
                              boxShadow:
                                "0 2px 8px color-mix(in srgb, var(--lyrical-accent) 35%, transparent)",
                            }}
                          >
                            <Check size={11} strokeWidth={3} />
                            Active
                          </div>
                        ) : (
                          <span
                            style={{
                              fontSize: "10.5px",
                              fontWeight: 600,
                              color: "var(--lyrical-text-muted)",
                              padding: "3.5px 8px",
                              borderRadius: "999px",
                              background: "var(--lyrical-panel-hover)",
                              border: "1px solid var(--lyrical-border-soft)",
                            }}
                          >
                            {vibe.tag}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Footer Notice & Done Button */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingTop: "8px",
                borderTop: "1px solid var(--lyrical-border-soft)",
              }}
            >
              <span
                style={{
                  fontSize: "11.5px",
                  color: "var(--lyrical-text-muted)",
                }}
              >
                Adaptive colors match your selected theme
              </span>

              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: "8px 20px",
                  borderRadius: "10px",
                  background: "var(--lyrical-accent)",
                  color: "var(--lyrical-accent-contrast, #000)",
                  border: "none",
                  fontSize: "13px",
                  fontWeight: 650,
                  cursor: "pointer",
                  transition: "opacity 0.18s ease",
                  boxShadow:
                    "0 2px 10px color-mix(in srgb, var(--lyrical-accent) 30%, transparent)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                Done
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SearchingVibeModal;
