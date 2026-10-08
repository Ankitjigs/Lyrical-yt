import React, { useState, useMemo, useEffect, useRef } from "react";
import { X, Search, Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { t } from "../../i18n";

export interface SearchableOption {
  value: string;
  label: string;
  subLabel?: string;
}

export interface SearchableSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  options: SearchableOption[];
  selectedValue: string;
  onSelect: (value: string) => void;
  placeholder?: string;
}

export const SearchableSelectModal: React.FC<SearchableSelectModalProps> = ({
  isOpen,
  onClose,
  title,
  options,
  selectedValue,
  onSelect,
  placeholder,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter options based on search query
  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        opt.value.toLowerCase().includes(q) ||
        (opt.subLabel && opt.subLabel.toLowerCase().includes(q)),
    );
  }, [options, searchQuery]);

  // Reset highlight & search query when modal opens or query changes
  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      const initialIdx = options.findIndex((opt) => opt.value === selectedValue);
      setHighlightedIndex(initialIdx >= 0 ? initialIdx : 0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, selectedValue, options]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchQuery]);

  // Keep highlighted item scrolled into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector(
      `[data-option-index="${highlightedIndex}"]`,
    ) as HTMLElement | null;
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        filteredOptions.length > 0 ? (prev + 1) % filteredOptions.length : 0,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        filteredOptions.length > 0
          ? (prev - 1 + filteredOptions.length) % filteredOptions.length
          : 0,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      const chosen = filteredOptions[highlightedIndex];
      if (chosen) {
        onSelect(chosen.value);
        onClose();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
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
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.72)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            zIndex: 99999,
            overflow: "hidden",
            boxSizing: "border-box",
          }}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKeyDown}
            initial={{ opacity: 0, scale: 0.96, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            style={{
              width: "100%",
              maxWidth: "460px",
              maxHeight: "85vh",
              borderRadius: "20px",
              background:
                "color-mix(in srgb, var(--lyrical-panel-surface-strong, #121218) 96%, #000000 4%)",
              border: "1px solid var(--lyrical-border, rgba(255, 255, 255, 0.14))",
              boxShadow:
                "0 24px 60px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.06)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxSizing: "border-box",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "18px 20px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid var(--lyrical-border-soft, rgba(255, 255, 255, 0.08))",
              }}
            >
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize: "16px",
                    fontWeight: "700",
                    color: "var(--lyrical-text-primary, #ffffff)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {title}
                </h3>
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--lyrical-text-muted, rgba(255, 255, 255, 0.5))",
                    marginTop: "3px",
                  }}
                >
                  {filteredOptions.length === options.length
                    ? `${options.length} ${t("common_options", undefined, "options available")}`
                    : `${filteredOptions.length} of ${options.length} matches`}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "10px",
                  border: "1px solid var(--lyrical-border-soft, rgba(255, 255, 255, 0.1))",
                  background: "transparent",
                  color: "var(--lyrical-text-secondary, rgba(255, 255, 255, 0.7))",
                  display: "grid",
                  placeItems: "center",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
                  e.currentTarget.style.color = "#ffffff";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--lyrical-text-secondary, rgba(255, 255, 255, 0.7))";
                }}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* Search Input Bar */}
            <div
              style={{
                padding: "14px 20px 10px",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  background: "var(--lyrical-card-bg-elevated, rgba(255, 255, 255, 0.05))",
                  border: "1px solid var(--lyrical-border, rgba(255, 255, 255, 0.12))",
                  transition: "border-color 0.18s ease",
                }}
              >
                <Search size={15} color="var(--lyrical-text-muted, rgba(255, 255, 255, 0.45))" />
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={placeholder || t("common_searchPlaceholder", undefined, "Type to search...")}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "var(--lyrical-text-primary, #ffffff)",
                    fontSize: "13px",
                    fontWeight: "500",
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      inputRef.current?.focus();
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--lyrical-text-muted, rgba(255, 255, 255, 0.45))",
                      cursor: "pointer",
                      padding: 0,
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable Options List */}
            <div
              ref={listRef}
              style={{
                flex: 1,
                minHeight: 0,
                maxHeight: "360px",
                overflowY: "auto",
                padding: "4px 12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: "2px",
              }}
            >
              {filteredOptions.length === 0 ? (
                <div
                  style={{
                    padding: "32px 16px",
                    textAlign: "center",
                    color: "var(--lyrical-text-muted, rgba(255, 255, 255, 0.45))",
                    fontSize: "13px",
                  }}
                >
                  {t("common_noMatches", undefined, "No matching languages found")}
                </div>
              ) : (
                filteredOptions.map((option, idx) => {
                  const isSelected = option.value === selectedValue;
                  const isHighlighted = idx === highlightedIndex;

                  return (
                    <button
                      key={option.value}
                      data-option-index={idx}
                      type="button"
                      onClick={() => {
                        onSelect(option.value);
                        onClose();
                      }}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "9px 12px",
                        borderRadius: "10px",
                        border: "1px solid",
                        borderColor: isSelected
                          ? "var(--lyrical-accent, #30c7c7)"
                          : isHighlighted
                            ? "var(--lyrical-border, rgba(255, 255, 255, 0.12))"
                            : "transparent",
                        background: isSelected
                          ? "var(--lyrical-accent-soft, rgba(48, 199, 199, 0.12))"
                          : isHighlighted
                            ? "rgba(255, 255, 255, 0.06)"
                            : "transparent",
                        color: isSelected
                          ? "var(--lyrical-accent, #30c7c7)"
                          : "var(--lyrical-text-primary, #ffffff)",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all 0.12s ease",
                        width: "100%",
                        boxSizing: "border-box",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "baseline", gap: "8px", minWidth: 0 }}>
                        <span
                          style={{
                            fontSize: "13.5px",
                            fontWeight: isSelected ? "700" : "500",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {option.label}
                        </span>
                        <span
                          style={{
                            fontSize: "11px",
                            fontFamily: "monospace",
                            color: isSelected
                              ? "var(--lyrical-accent, #30c7c7)"
                              : "var(--lyrical-text-muted, rgba(255, 255, 255, 0.45))",
                            opacity: 0.85,
                          }}
                        >
                          {option.value}
                        </span>
                        {option.subLabel && (
                          <span
                            style={{
                              fontSize: "11px",
                              color: "var(--lyrical-text-muted, rgba(255, 255, 255, 0.45))",
                            }}
                          >
                            {option.subLabel}
                          </span>
                        )}
                      </div>

                      {isSelected && (
                        <Check
                          size={15}
                          color="var(--lyrical-accent, #30c7c7)"
                          style={{ flexShrink: 0, marginLeft: "8px" }}
                        />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer / Helper hint */}
            <div
              style={{
                padding: "8px 20px",
                borderTop: "1px solid var(--lyrical-border-soft, rgba(255, 255, 255, 0.08))",
                background: "rgba(0, 0, 0, 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: "11px",
                color: "var(--lyrical-text-muted, rgba(255, 255, 255, 0.4))",
              }}
            >
              <span>Use ↑ ↓ to navigate, Enter to choose</span>
              <span>ESC to exit</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SearchableSelectModal;
