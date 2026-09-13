"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { translations, Language, Translations } from "@/lib/translations";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType>({
  language: "de",
  setLanguage: () => {},
  t: translations.de,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("de");

  useEffect(() => {
    // Read from localStorage on client mount
    try {
      const saved = localStorage.getItem("autoacts_lang") as Language | null;
      if (saved === "de" || saved === "en") {
        setLanguageState(saved);
        document.documentElement.lang = saved;
      }
    } catch {
      // Fallback
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem("autoacts_lang", lang);
      document.cookie = `autoacts_lang=${lang}; path=/; max-age=31536000; SameSite=Lax`;
      document.documentElement.lang = lang;
    } catch {
      // Fallback
    }
  };

  return (
    <LanguageContext.Provider
      value={{
        language: language === "en" ? "en" : "de",
        setLanguage,
        t: translations[language] || translations.de,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
