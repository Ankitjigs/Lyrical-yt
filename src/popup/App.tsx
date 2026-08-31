import React from "react";
import { Github } from "lucide-react";
import SettingsContent from "../content/components/SettingsContent";
import { useAppStore } from "../content/store";
import { getThemeCssVariables } from "../themes";
import { useShallow } from "zustand/react/shallow";
import { t } from "../i18n";

const PopupApp = () => {
  const { themeId, customThemes } = useAppStore(
    useShallow((state) => ({
      themeId: state.themeId,
      customThemes: state.customThemes,
    })),
  );
  const themeVars = getThemeCssVariables(themeId, customThemes);

  return (
    <div
      style={{
        ...themeVars,
        width: "580px", // Slightly wider for better fit
        height: "580px", // Taller
        background: "var(--lyrical-popup-bg)",
        color: "var(--lyrical-text-primary)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "'Inter', sans-serif",
        position: "relative",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 20px",
          background: "var(--lyrical-popup-header-bg)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexShrink: 0,
          borderBottom: "1px solid var(--lyrical-border-soft)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              src={chrome.runtime.getURL("icon128.png")}
              alt={t("popup_logoAlt")}
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
              }}
            />
          </div>
          <span
            style={{
              fontSize: "16px",
              fontWeight: "700",
              color: "var(--lyrical-text-primary)",
            }}
          >
            Lyrical{" "}
            <span
              style={{
                fontSize: "12px",
                color: "var(--lyrical-text-muted)",
                marginLeft: "6px",
                fontWeight: "400",
              }}
            >
              v1.0.0
            </span>
          </span>
        </div>
        <a
          href="https://github.com/Ankitjigs/Lyrical"
          target="_blank"
          style={{
            color: "var(--lyrical-text-secondary)",
            transition: "color 0.2s",
          }}
          title="GitHub"
        >
          <Github size={20} />
        </a>
      </div>

      {/* Shared Content */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
        }}
      >
        <SettingsContent />
      </div>
    </div>
  );
};

export default PopupApp;
