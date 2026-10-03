import type { TranslationKey } from "./en";

/** Swahili translation of the app's primary navigation, chrome, and common
 * table/KPI labels — see lib/i18n/index.tsx for scope and honesty notes.
 * This is a first-pass translation (by an AI assistant with working but
 * not native-level Swahili, not a professional translator); it covers the
 * navigation, buttons, headings, and shared table/KPI labels a user
 * touches on every page, not the longer explanatory paragraphs, hints, or
 * error messages, which stay English for now. Flag anything that reads
 * wrong to a native speaker — this is meant to be corrected, not treated
 * as final. */
const sw: Record<TranslationKey, string> = {
  "app.tagline": "Taarifa za Mlipuko",
  "app.title": "Mfumo wa Malaria",

  "nav.group.overview": "Muhtasari",
  "nav.group.caseReports": "Ripoti za Wagonjwa",
  "nav.group.forecasting": "Utabiri",
  "nav.group.allocation": "Ugawaji",
  "nav.group.referenceData": "Data ya Marejeleo",

  "nav.analytics": "Uchambuzi",
  "nav.decisionSupport": "Usaidizi wa Maamuzi",
  "nav.simulations": "Miigo",
  "nav.uploadSimulate": "Pakia na Uige",
  "nav.caseReports": "Ripoti za Wagonjwa",
  "nav.submitReport": "Wasilisha Ripoti",
  "nav.chainIntegrity": "Uadilifu wa Mnyororo",
  "nav.forecasts": "Utabiri",
  "nav.generateForecast": "Tengeneza Utabiri",
  "nav.vaccineAllocation": "Ugawaji wa Chanjo",
  "nav.runAllocation": "Fanya Ugawaji",
  "nav.allocationLog": "Kumbukumbu ya Ugawaji",
  "nav.counties": "Kaunti",
  "nav.facilities": "Vituo vya Afya",
  "nav.settings": "Mipangilio",

  "page.analyticsOverview": "Muhtasari wa Uchambuzi",
  "page.decisionSupport": "Usaidizi wa Maamuzi",
  "page.simulations": "Miigo",
  "page.uploadSimulate": "Pakia na Uige",
  "page.counties": "Kaunti",
  "page.caseReports": "Ripoti za Wagonjwa",
  "page.submitCaseReport": "Wasilisha Ripoti ya Mgonjwa",
  "page.correctReport": "Sahihisha Ripoti #{{id}}",
  "page.outbreakForecasts": "Utabiri wa Mlipuko",
  "page.generateForecast": "Tengeneza Utabiri",
  "page.vaccineAllocationRecommendations": "Mapendekezo ya Ugawaji wa Chanjo",
  "page.runAllocation": "Fanya Ugawaji",
  "page.allocationLog": "Kumbukumbu ya Ugawaji",
  "page.facilities": "Vituo vya Afya",
  "page.chainIntegrity": "Uadilifu wa Mnyororo",
  "page.settings": "Mipangilio ya Usaidizi wa Maamuzi",

  "common.signIn": "Ingia",
  "common.signOut": "Toka",
  "common.username": "Jina la mtumiaji",
  "common.password": "Nywila",
  "common.signingIn": "Inaingia…",
  "common.save": "Hifadhi",
  "common.resetToDefaults": "Rejesha chaguo-msingi",
  "common.exportCsv": "Hamisha CSV",
  "common.loading": "Inapakia…",
  "common.correct": "Sahihisha",
  "common.submitReport": "Wasilisha ripoti",
  "common.submitCorrection": "Wasilisha marekebisho",
  "common.submitting": "Inawasilisha…",
  "common.generateForecasts": "Tengeneza utabiri",
  "common.generating": "Inatengeneza…",
  "common.runAllocation": "Fanya ugawaji",
  "common.allocating": "Inagawa…",
  "common.reverify": "Hakiki tena",
  "common.verifying": "Inahakiki…",
  "common.yes": "Ndiyo",
  "common.no": "Hapana",
  "common.set": "Imewekwa",
  "common.missing": "Haipo",

  "table.date": "Tarehe",
  "table.county": "Kaunti",
  "table.facility": "Kituo",
  "table.confirmed": "Vilivyothibitishwa",
  "table.suspected": "Vinavyoshukiwa",
  "table.deaths": "Vifo",
  "table.status": "Hali",
  "table.period": "Kipindi",
  "table.periodStart": "Mwanzo wa kipindi",
  "table.riskScore": "Alama ya hatari",
  "table.model": "Muundo",
  "table.predictedCases": "Visa vinavyotabiriwa",
  "table.recommendedDoses": "Dozi zinazopendekezwa",
  "table.rationale": "Sababu",
  "table.triggeredBy": "Ilianzishwa na",
  "table.name": "Jina",
  "table.code": "Msimbo",
  "table.population": "Idadi ya watu",
  "table.endemicFocus": "Lengo la Ugonjwa Sugu",
  "table.boundary": "Mpaka",
  "table.recordHash": "Hashi ya rekodi",

  "kpi.confirmedCasesAllTime": "Visa vilivyothibitishwa (wakati wote)",
  "kpi.casesPer1000": "Visa kwa kila watu 1,000",
  "kpi.deathsReported": "Vifo vilivyoripotiwa",
  "kpi.avgOutbreakRisk": "Wastani wa hatari ya mlipuko",
  "kpi.dosesAllocated": "Dozi zilizogawiwa",

  "offline.banner": "Huna mtandao — inaonyesha data ya mwisho iliyopakiwa ukiwa mtandaoni. Hakuna kinachoweza kuwasilishwa hadi urejee mtandaoni.",

  "skipLink": "Nenda moja kwa moja kwa maudhui makuu",
};

export default sw;
