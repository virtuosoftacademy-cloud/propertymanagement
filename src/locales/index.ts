import enCommon from "./en/common.json";
import enSettings from "./en/settings.json";
import enDashboard from "./en/dashboard.json";
import enProperties from "./en/properties.json";
import enTenants from "./en/tenants.json";
import enLeases from "./en/leases.json";
import enMaintenance from "./en/maintenance.json";
import enCompliance from "./en/compliance.json";
import enPayments from "./en/payments.json";
import enAnalytics from "./en/analytics.json";
import enMessages from "./en/messages.json";
import enCalendar from "./en/calendar.json";
import enAdmin from "./en/admin.json";
import esCommon from "./es/common.json";
import esSettings from "./es/settings.json";
import esDashboard from "./es/dashboard.json";
import esProperties from "./es/properties.json";
import esTenants from "./es/tenants.json";
import esLeases from "./es/leases.json";
import esMaintenance from "./es/maintenance.json";
import esPayments from "./es/payments.json";
import esAnalytics from "./es/analytics.json";
import esMessages from "./es/messages.json";
import esCalendar from "./es/calendar.json";
import esAdmin from "./es/admin.json";
import frCommon from "./fr/common.json";
import frSettings from "./fr/settings.json";
import frDashboard from "./fr/dashboard.json";
import frProperties from "./fr/properties.json";
import frTenants from "./fr/tenants.json";
import frLeases from "./fr/leases.json";
import frMaintenance from "./fr/maintenance.json";
import frPayments from "./fr/payments.json";
import frAnalytics from "./fr/analytics.json";
import frMessages from "./fr/messages.json";
import frCalendar from "./fr/calendar.json";
import frAdmin from "./fr/admin.json";
import deCommon from "./de/common.json";
import deSettings from "./de/settings.json";
import deDashboard from "./de/dashboard.json";
import deProperties from "./de/properties.json";
import deTenants from "./de/tenants.json";
import deLeases from "./de/leases.json";
import deMaintenance from "./de/maintenance.json";
import dePayments from "./de/payments.json";
import deAnalytics from "./de/analytics.json";
import deMessages from "./de/messages.json";
import deCalendar from "./de/calendar.json";
import deAdmin from "./de/admin.json";

type LanguageCatalog = Record<string, string>;

const mergeCatalogs = (...sources: LanguageCatalog[]): LanguageCatalog => {
  return Object.assign({}, ...sources);
};

const catalogsByLanguage: Record<string, LanguageCatalog> = {
  en: mergeCatalogs(
    enCommon,
    enSettings,
    enDashboard,
    enProperties,
    enTenants,
    enLeases,
    enMaintenance,
    enCompliance,
    enPayments,
    enAnalytics,
    enMessages,
    enCalendar,
    enAdmin
  ),
  es: mergeCatalogs(
    esCommon,
    esSettings,
    esDashboard,
    esProperties,
    esTenants,
    esLeases,
    esMaintenance,
    esPayments,
    esAnalytics,
    esMessages,
    esCalendar,
    esAdmin
  ),
  fr: mergeCatalogs(
    frCommon,
    frSettings,
    frDashboard,
    frProperties,
    frTenants,
    frLeases,
    frMaintenance,
    frPayments,
    frAnalytics,
    frMessages,
    frCalendar,
    frAdmin
  ),
  de: mergeCatalogs(
    deCommon,
    deSettings,
    deDashboard,
    deProperties,
    deTenants,
    deLeases,
    deMaintenance,
    dePayments,
    deAnalytics,
    deMessages,
    deCalendar,
    deAdmin
  ),
};

export const translations: Record<string, Record<string, string>> = {};

for (const [language, catalog] of Object.entries(catalogsByLanguage)) {
  for (const [key, value] of Object.entries(catalog)) {
    if (!translations[key]) {
      translations[key] = {};
    }
    translations[key][language] = value;
  }
}
