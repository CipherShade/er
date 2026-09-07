import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import arCommon from './ar/common.json';
import enCommon from './en/common.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      ar: { common: arCommon },
      en: { common: enCommon },
    },
    lng: 'ar', // Arabic is the primary default language
    fallbackLng: 'en',
    supportedLngs: ['ar', 'en'],
    returnEmptyString: false,
    defaultNS: 'common',
    interpolation: {
      escapeValue: false,
    },
  });

// Automatically synchronize document direction with language
i18n.on('languageChanged', (lng) => {
  const dir = lng === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.dir = dir;
  document.documentElement.lang = lng;
});

document.documentElement.dir = 'rtl';
document.documentElement.lang = 'ar';

export default i18n;
