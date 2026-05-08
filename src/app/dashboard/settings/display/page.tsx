"use client";

import { Palette } from "lucide-react";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { DisplaySettings } from "@/components/settings/display-settings";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";

export default function DisplaySettingsPage() {
  const { t } = useLocalizationContext();

  return (
    <SettingsLayout
      title={t("settings.display.pageTitle")}
      description={t("settings.display.pageDescription")}
      icon={Palette}
      section="display"
    >
      {({ userSettings, onUpdate, onAlert }) => (
        <DisplaySettings
          settings={userSettings?.display}
          onUpdate={onUpdate}
          onAlert={onAlert}
        />
      )}
    </SettingsLayout>
  );
}
