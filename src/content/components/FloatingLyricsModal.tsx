import React from "react";
import { X, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useAppStore } from "../store";

interface FloatingLyricsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ALBUM_ART_TRANSITIONS = [
  { id: "shuffle", label: "Shuffle" },
  { id: "flip", label: "Flip" },
  { id: "push", label: "Push" },
  { id: "crossfade", label: "Crossfade" },
  { id: "none", label: "None" },
] as const;

const TITLE_TRANSITIONS = [
  { id: "spring", label: "Spring" },
  { id: "push", label: "Push" },
  { id: "crossfade", label: "Crossfade" },
  { id: "none", label: "None" },
] as const;

export const FloatingLyricsModal: React.FC<FloatingLyricsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const albumArtTransition = useAppStore((state) => state.albumArtTransition);
  const titleTransition = useAppStore((state) => state.titleTransition);
  const scrollLongTitles = useAppStore((state) => state.scrollLongTitles);
  const showProgressBar = useAppStore((state) => state.showProgressBar);
  const reduceAnimations = useAppStore((state) => state.reduceAnimations);

  const setAlbumArtTransition = useAppStore(
    (state) => state.setAlbumArtTransition,
  );
  const setTitleTransition = useAppStore((state) => state.setTitleTransition);
  const setScrollLongTitles = useAppStore((state) => state.setScrollLongTitles);
  const setShowProgressBar = useAppStore((state) => state.setShowProgressBar);

  // Re-hydrate settings from storage when modal opens to guarantee fresh sync
  React.useEffect(() => {
    if (!isOpen) return;
    if (typeof chrome !== "undefined" && chrome?.storage?.sync) {
      chrome.storage.sync.get(
        {
          albumArtTransition: "shuffle",
          titleTransition: "spring",
          scrollLongTitles: true,
          showProgressBar: true,
        },
        (items: any) => {
          useAppStore.setState({
            albumArtTransition: items.albumArtTransition || "shuffle",
            titleTransition: items.titleTransition || "spring",
            scrollLongTitles: items.scrollLongTitles ?? true,
            showProgressBar: items.showProgressBar ?? true,
          });
        },
      );
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="floating-lyrics-modal-backdrop"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceAnimations ? 0 : 0.18, ease: "easeOut" }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.65)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            zIndex: 999999,
            overflow: "hidden",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          <motion.div
            key="floating-lyrics-modal-card"
            onClick={(e) => e.stopPropagation()}
            initial={
              reduceAnimations
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.96, y: 12 }
            }
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={
              reduceAnimations
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.96, y: 12 }
            }
            transition={{
              duration: reduceAnimations ? 0 : 0.22,
              ease: [0.16, 1, 0.3, 1],
            }}
            style={{
              background: "var(--lyrical-card-bg, #222228)",
              border: "1px solid var(--lyrical-border-soft, rgba(255, 255, 255, 0.12))",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "460px",
              boxShadow: "0 24px 48px rgba(0, 0, 0, 0.55)",
              color: "var(--lyrical-text-primary, #ffffff)",
              overflow: "hidden",
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "20px 24px 16px 24px",
                borderBottom:
                  "1px solid var(--lyrical-border-soft, rgba(255, 255, 255, 0.08))",
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: "16px",
                  fontWeight: "700",
                  letterSpacing: "-0.01em",
                  color: "var(--lyrical-text-primary, #ffffff)",
                }}
              >
                Player Header & Transitions
              </h3>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--lyrical-text-muted, rgba(255, 255, 255, 0.6))",
                  cursor: "pointer",
                  padding: "6px",
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "color 0.18s, background 0.18s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--lyrical-text-primary, #ffffff)";
                  e.currentTarget.style.background =
                    "var(--lyrical-card-bg-elevated, rgba(255, 255, 255, 0.08))";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color =
                    "var(--lyrical-text-muted, rgba(255, 255, 255, 0.6))";
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body - Strict NO SCROLLBAR */}
            <div
              style={{
                padding: "16px 24px 24px 24px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                overflow: "hidden",
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >

              {/* Option 3: Album art transition */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "16px",
                }}
              >
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "var(--lyrical-text-primary, #ffffff)",
                  }}
                >
                  Album art transition
                </span>
                <div style={{ position: "relative", minWidth: "128px" }}>
                  <select
                    value={albumArtTransition}
                    onChange={(e) =>
                      setAlbumArtTransition(
                        e.target.value as (typeof ALBUM_ART_TRANSITIONS)[number]["id"],
                      )
                    }
                    style={{
                      width: "100%",
                      appearance: "none",
                      WebkitAppearance: "none",
                      background: "var(--lyrical-card-bg-elevated, #2b2b34)",
                      border:
                        "1px solid var(--lyrical-border, rgba(255, 255, 255, 0.15))",
                      borderRadius: "8px",
                      padding: "7px 32px 7px 12px",
                      fontSize: "13px",
                      fontWeight: "500",
                      color: "var(--lyrical-text-primary, #ffffff)",
                      cursor: "pointer",
                      outline: "none",
                    }}
                  >
                    {ALBUM_ART_TRANSITIONS.map((opt) => (
                      <option
                        key={opt.id}
                        value={opt.id}
                        style={{
                          background: "#222228",
                          color: "#ffffff",
                        }}
                      >
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    style={{
                      position: "absolute",
                      right: "10px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      pointerEvents: "none",
                      color: "var(--lyrical-text-muted, rgba(255, 255, 255, 0.6))",
                    }}
                  />
                </div>
              </div>

              {/* Option 4: Title transition */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "16px",
                }}
              >
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "var(--lyrical-text-primary, #ffffff)",
                  }}
                >
                  Title transition
                </span>
                <div style={{ position: "relative", minWidth: "128px" }}>
                  <select
                    value={titleTransition}
                    onChange={(e) =>
                      setTitleTransition(
                        e.target.value as (typeof TITLE_TRANSITIONS)[number]["id"],
                      )
                    }
                    style={{
                      width: "100%",
                      appearance: "none",
                      WebkitAppearance: "none",
                      background: "var(--lyrical-card-bg-elevated, #2b2b34)",
                      border:
                        "1px solid var(--lyrical-border, rgba(255, 255, 255, 0.15))",
                      borderRadius: "8px",
                      padding: "7px 32px 7px 12px",
                      fontSize: "13px",
                      fontWeight: "500",
                      color: "var(--lyrical-text-primary, #ffffff)",
                      cursor: "pointer",
                      outline: "none",
                    }}
                  >
                    {TITLE_TRANSITIONS.map((opt) => (
                      <option
                        key={opt.id}
                        value={opt.id}
                        style={{
                          background: "#222228",
                          color: "#ffffff",
                        }}
                      >
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    style={{
                      position: "absolute",
                      right: "10px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      pointerEvents: "none",
                      color: "var(--lyrical-text-muted, rgba(255, 255, 255, 0.6))",
                    }}
                  />
                </div>
              </div>

              {/* Option 5: Scroll long titles */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "16px",
                }}
              >
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "var(--lyrical-text-primary, #ffffff)",
                  }}
                >
                  Scroll long titles
                </span>
                <ToggleSwitch
                  checked={Boolean(scrollLongTitles)}
                  onChange={setScrollLongTitles}
                />
              </div>

              {/* Option 6: Show progress bar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "16px",
                }}
              >
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "var(--lyrical-text-primary, #ffffff)",
                  }}
                >
                  Show progress bar
                </span>
                <ToggleSwitch
                  checked={Boolean(showProgressBar)}
                  onChange={setShowProgressBar}
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Reusable toggle switch matching Better Lyrics styling
const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ checked, onChange }) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        width: "42px",
        height: "24px",
        borderRadius: "999px",
        border: "none",
        cursor: "pointer",
        background: checked
          ? "var(--lyrical-accent, #3b82f6)"
          : "var(--lyrical-card-bg-elevated, #3a3a44)",
        transition: "background 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        padding: 0,
        flexShrink: 0,
        outline: "none",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: "2px",
          left: checked ? "20px" : "2px",
          width: "20px",
          height: "20px",
          borderRadius: "50%",
          background: "#ffffff",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.4)",
          transition: "left 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />
    </button>
  );
};

export default FloatingLyricsModal;
