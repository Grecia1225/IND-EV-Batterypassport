import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "hi";

const STORAGE_KEY = "battery-passport-lang";

const dictionary = {
  en: {
    appName: "Battery Passport",
    tagline: "Know the battery before you pay for it",
    heroDescription:
      "Every pack carries a permanent record — who made it, how it's been used, its health today, and how much life is left in each cell inside. Records can be added but never edited, so hidden usage shows up.",
    registeredBatteries: "Registered batteries",
    noBatteries: "No batteries registered yet.",
    registerOne: "Register one",
    navHome: "Home",
    navMarketplace: "Marketplace",
    navScan: "Scan",
    navRegister: "Register Battery",
    navAddReading: "Add Reading",
    navDashboard: "Dashboard",
    navSignIn: "Sign in",
    navSignOut: "Sign out",
    allBatteries: "All batteries",
    retroRegistered: "Retro-registered",
    stateOfHealth: "State of Health",
    stateOfCharge: "State of Charge",
    confidence: "Confidence",
    fairPriceEstimate: "Fair price estimate",
    cells: "Cells",
    cellsHint: "Pack health is judged by the weakest cell here, not the average. Tap a cell for detail.",
    selectCellHint: "Select a cell above to see its detail.",
    usageHistory: "Usage history",
    noUsageHistory: "No usage history recorded yet.",
    degradationForecast: "Degradation forecast",
    forecastDisclaimer: "A straight-line projection from this cell's own history — not a physics model.",
    recommendation: "Recommendation",
    packTemperatureSensors: "Pack temperature sensors",
    noPackReading: "No pack-level reading yet.",
    marketplaceClearance: "Marketplace clearance",
    clearedForListing: "Cleared for listing",
    notCleared: "Not cleared",
    priceDisclaimer: "Fair price is an indicative estimate based on remaining capacity, not a live market quote.",
    listen: "Listen",
    stopListening: "Stop",
    healthy: "Healthy",
    secondLife: "Second-life",
    retire: "Retire",
  },
  hi: {
    appName: "बैटरी पासपोर्ट",
    tagline: "पैसे देने से पहले बैटरी को जानें",
    heroDescription:
      "हर बैटरी का एक स्थायी रिकॉर्ड होता है — इसे किसने बनाया, इसका उपयोग कैसे हुआ, आज इसकी हालत कैसी है, और अंदर हर सेल में कितनी क्षमता बची है। रिकॉर्ड जोड़े जा सकते हैं पर कभी बदले नहीं जा सकते, इसलिए छुपाई गई जानकारी सामने आ जाती है।",
    registeredBatteries: "पंजीकृत बैटरियाँ",
    noBatteries: "अभी तक कोई बैटरी पंजीकृत नहीं है।",
    registerOne: "एक पंजीकृत करें",
    navHome: "होम",
    navMarketplace: "बाज़ार",
    navScan: "स्कैन करें",
    navRegister: "बैटरी पंजीकृत करें",
    navAddReading: "रीडिंग जोड़ें",
    navDashboard: "डैशबोर्ड",
    navSignIn: "साइन इन करें",
    navSignOut: "साइन आउट करें",
    allBatteries: "सभी बैटरियाँ",
    retroRegistered: "बाद में पंजीकृत",
    stateOfHealth: "स्वास्थ्य स्थिति",
    stateOfCharge: "चार्ज स्थिति",
    confidence: "विश्वसनीयता",
    fairPriceEstimate: "उचित मूल्य अनुमान",
    cells: "सेल",
    cellsHint: "बैटरी की सेहत सबसे कमज़ोर सेल से तय होती है, औसत से नहीं। विवरण के लिए किसी सेल पर टैप करें।",
    selectCellHint: "विवरण देखने के लिए ऊपर किसी सेल को चुनें।",
    usageHistory: "उपयोग इतिहास",
    noUsageHistory: "अभी तक कोई उपयोग इतिहास दर्ज नहीं है।",
    degradationForecast: "गिरावट पूर्वानुमान",
    forecastDisclaimer: "यह इस सेल के अपने इतिहास पर आधारित एक सीधी-रेखा अनुमान है — कोई भौतिकी मॉडल नहीं।",
    recommendation: "सुझाव",
    packTemperatureSensors: "पैक तापमान सेंसर",
    noPackReading: "अभी तक कोई पैक-स्तरीय रीडिंग नहीं है।",
    marketplaceClearance: "बाज़ार स्वीकृति",
    clearedForListing: "सूची के लिए स्वीकृत",
    notCleared: "स्वीकृत नहीं",
    priceDisclaimer: "उचित मूल्य शेष क्षमता पर आधारित एक संकेतात्मक अनुमान है, न कि बाज़ार का वास्तविक भाव।",
    listen: "सुनें",
    stopListening: "रोकें",
    healthy: "स्वस्थ",
    secondLife: "दूसरा जीवन",
    retire: "सेवामुक्त",
  },
} as const;

export type TranslationKey = keyof typeof dictionary.en;

interface LangContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey) => string;
}

const LangContext = createContext<LangContextValue | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "hi" ? "hi" : "en";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
  }, [lang]);

  function setLang(next: Lang) {
    setLangState(next);
  }

  function t(key: TranslationKey): string {
    return dictionary[lang][key] ?? dictionary.en[key] ?? key;
  }

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used inside LangProvider");
  return ctx;
}