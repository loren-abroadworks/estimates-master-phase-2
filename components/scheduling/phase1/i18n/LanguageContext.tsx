import React, { createContext, useContext } from 'react';
import { Language } from '../types';
import { translate } from './translate';

interface LanguageContextValue {
  appLanguage: Language;
  clientLanguage: Language;
}

const LanguageContext = createContext<LanguageContextValue>({
  appLanguage: 'en',
  clientLanguage: 'en',
});

export const LanguageProvider: React.FC<{
  appLanguage: Language;
  clientLanguage: Language;
  children: React.ReactNode;
}> = ({ appLanguage, clientLanguage, children }) => (
  <LanguageContext.Provider value={{ appLanguage, clientLanguage }}>
    {children}
  </LanguageContext.Provider>
);

type Vars = Record<string, string | number>;

/** Resolve UI strings against the contractor's app language. */
export function useTranslation() {
  const { appLanguage } = useContext(LanguageContext);
  const t = (key: string, vars?: Vars) => translate(appLanguage, key, vars);
  return { t, language: appLanguage };
}

/** Resolve labels against the client-document language (for client-facing output). */
export function useClientTranslation() {
  const { clientLanguage } = useContext(LanguageContext);
  const tc = (key: string, vars?: Vars) => translate(clientLanguage, key, vars);
  return { tc, clientLanguage };
}
