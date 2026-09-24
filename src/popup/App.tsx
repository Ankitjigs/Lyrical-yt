import React, { useEffect, useMemo } from "react";
import { Github } from "lucide-react";
import SettingsContent from "../content/components/SettingsContent";
import { useAppStore } from "../content/store";
import { getThemeCssVariables, getObsidianPopupTokens } from "../themes";
import { useShallow } from "zustand/react/shallow";
import { t } from "../i18n";

const PopupApp = () => {
  const { themeId, customThemes, dynamicThemeTokens } = useAppStore(
    useShallow((state) => ({
      themeId: state.themeId,
      customThemes: state.customThemes,
      dynamicThemeTokens: state.dynamicThemeTokens,
    })),
  );

  useEffect(() => {
    if (typeof chrome !== "undefined" && chrome?.storage?.local) {
      chrome.storage.local.get(
        ["dynamicThemeTokens", "dynamicArtworkUrl"],
        (res) => {
          if (res.dynamicThemeTokens) {
            useAppStore
              .getState()
              .setDynamicThemeTokens(res.dynamicThemeTokens as Record<string, string>);
          }
          if (res.dynamicArtworkUrl) {
            useAppStore
              .getState()
              .setDynamicArtworkUrl(res.dynamicArtworkUrl as string);
          }
        },
      );
      const listener = (
        changes: Record<string, chrome.storage.StorageChange>,
        areaName: string,
      ) => {
        if (areaName === "local") {
          if (changes.dynamicThemeTokens) {
            useAppStore
              .getState()
              .setDynamicThemeTokens(
                (changes.dynamicThemeTokens.newValue as Record<string, string>) || null,
              );
          }
          if (changes.dynamicArtworkUrl) {
            useAppStore
              .getState()
              .setDynamicArtworkUrl(
                (changes.dynamicArtworkUrl.newValue as string) || null,
              );
          }
        }
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
  }, []);

  const themeVars = useMemo(() => {
    if (themeId === "dynamic") {
      const dynamicAccent = dynamicThemeTokens?.["--lyrical-accent"];
      return getObsidianPopupTokens(dynamicAccent);
    }
    return getThemeCssVariables(themeId, customThemes);
  }, [themeId, customThemes, dynamicThemeTokens]);

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
