"use client";

import { Palette } from "lucide-react";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { DisplaySettings } from "@/components/settings/display-settings";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";
import { RequirePermission } from "@/components/auth/require-permission-client";
import { UserRole } from "@/types";

export default function DisplaySettingsPage() {
  const { t } = useLocalizationContext();

  // Org-wide branding, theme and language — not per-user taste, so it is not
  // a page every signed-in user should reach. Admins always; anyone else only
  // if their role has been granted company_settings.
  return (
    <RequirePermission
      permission="company_settings"
      roles={[UserRole.ADMIN, UserRole.MANAGER]}
    >
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
    </RequirePermission>
  );
}
