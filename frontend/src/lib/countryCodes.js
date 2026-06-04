// Lista centralizzata dei prefissi internazionali supportati per il login
// via SMS. Ordinata "in cima i più comuni per l'app (IT/EU/US)", poi resto
// in ordine alfabetico.
//
// Per aggiungere un nuovo paese: pusha un oggetto qui — viene usato sia da
// PhoneLoginModal che da ProfilePhoneCard.
//
// Note:
// - `code` = prefisso E.164 (es. "+39")
// - `flag` = emoji bandiera (per UI compatta)
// - `label` = ISO-2 code visualizzato (es. "IT")
// - `name` = nome paese in inglese (per la lista lunga e l'accessibility)

export const COUNTRY_CODES = [
  // Top — i più comuni per FAMMY
  { code: '+39',  flag: '🇮🇹', label: 'IT', name: 'Italia' },
  { code: '+1',   flag: '🇺🇸', label: 'US/CA', name: 'USA / Canada' },
  { code: '+44',  flag: '🇬🇧', label: 'UK', name: 'United Kingdom' },
  { code: '+33',  flag: '🇫🇷', label: 'FR', name: 'France' },
  { code: '+49',  flag: '🇩🇪', label: 'DE', name: 'Deutschland' },
  { code: '+34',  flag: '🇪🇸', label: 'ES', name: 'España' },
  { code: '+41',  flag: '🇨🇭', label: 'CH', name: 'Schweiz' },

  // Europa
  { code: '+43',  flag: '🇦🇹', label: 'AT', name: 'Österreich' },
  { code: '+32',  flag: '🇧🇪', label: 'BE', name: 'Belgique' },
  { code: '+359', flag: '🇧🇬', label: 'BG', name: 'България' },
  { code: '+357', flag: '🇨🇾', label: 'CY', name: 'Κύπρος' },
  { code: '+420', flag: '🇨🇿', label: 'CZ', name: 'Česko' },
  { code: '+45',  flag: '🇩🇰', label: 'DK', name: 'Danmark' },
  { code: '+372', flag: '🇪🇪', label: 'EE', name: 'Eesti' },
  { code: '+358', flag: '🇫🇮', label: 'FI', name: 'Suomi' },
  { code: '+30',  flag: '🇬🇷', label: 'GR', name: 'Ελλάδα' },
  { code: '+385', flag: '🇭🇷', label: 'HR', name: 'Hrvatska' },
  { code: '+36',  flag: '🇭🇺', label: 'HU', name: 'Magyarország' },
  { code: '+353', flag: '🇮🇪', label: 'IE', name: 'Ireland' },
  { code: '+354', flag: '🇮🇸', label: 'IS', name: 'Ísland' },
  { code: '+423', flag: '🇱🇮', label: 'LI', name: 'Liechtenstein' },
  { code: '+370', flag: '🇱🇹', label: 'LT', name: 'Lietuva' },
  { code: '+352', flag: '🇱🇺', label: 'LU', name: 'Luxembourg' },
  { code: '+371', flag: '🇱🇻', label: 'LV', name: 'Latvija' },
  { code: '+377', flag: '🇲🇨', label: 'MC', name: 'Monaco' },
  { code: '+356', flag: '🇲🇹', label: 'MT', name: 'Malta' },
  { code: '+31',  flag: '🇳🇱', label: 'NL', name: 'Nederland' },
  { code: '+47',  flag: '🇳🇴', label: 'NO', name: 'Norge' },
  { code: '+48',  flag: '🇵🇱', label: 'PL', name: 'Polska' },
  { code: '+351', flag: '🇵🇹', label: 'PT', name: 'Portugal' },
  { code: '+40',  flag: '🇷🇴', label: 'RO', name: 'România' },
  { code: '+381', flag: '🇷🇸', label: 'RS', name: 'Србија' },
  { code: '+46',  flag: '🇸🇪', label: 'SE', name: 'Sverige' },
  { code: '+386', flag: '🇸🇮', label: 'SI', name: 'Slovenija' },
  { code: '+421', flag: '🇸🇰', label: 'SK', name: 'Slovensko' },
  { code: '+90',  flag: '🇹🇷', label: 'TR', name: 'Türkiye' },
  { code: '+380', flag: '🇺🇦', label: 'UA', name: 'Україна' },

  // Resto del mondo (selezione dei paesi più usati)
  { code: '+971', flag: '🇦🇪', label: 'AE', name: 'United Arab Emirates' },
  { code: '+54',  flag: '🇦🇷', label: 'AR', name: 'Argentina' },
  { code: '+61',  flag: '🇦🇺', label: 'AU', name: 'Australia' },
  { code: '+55',  flag: '🇧🇷', label: 'BR', name: 'Brasil' },
  { code: '+56',  flag: '🇨🇱', label: 'CL', name: 'Chile' },
  { code: '+86',  flag: '🇨🇳', label: 'CN', name: '中国' },
  { code: '+57',  flag: '🇨🇴', label: 'CO', name: 'Colombia' },
  { code: '+20',  flag: '🇪🇬', label: 'EG', name: 'مصر' },
  { code: '+852', flag: '🇭🇰', label: 'HK', name: 'Hong Kong' },
  { code: '+62',  flag: '🇮🇩', label: 'ID', name: 'Indonesia' },
  { code: '+972', flag: '🇮🇱', label: 'IL', name: 'ישראל' },
  { code: '+91',  flag: '🇮🇳', label: 'IN', name: 'India' },
  { code: '+98',  flag: '🇮🇷', label: 'IR', name: 'ایران' },
  { code: '+81',  flag: '🇯🇵', label: 'JP', name: '日本' },
  { code: '+254', flag: '🇰🇪', label: 'KE', name: 'Kenya' },
  { code: '+82',  flag: '🇰🇷', label: 'KR', name: '대한민국' },
  { code: '+212', flag: '🇲🇦', label: 'MA', name: 'المغرب' },
  { code: '+52',  flag: '🇲🇽', label: 'MX', name: 'México' },
  { code: '+60',  flag: '🇲🇾', label: 'MY', name: 'Malaysia' },
  { code: '+234', flag: '🇳🇬', label: 'NG', name: 'Nigeria' },
  { code: '+64',  flag: '🇳🇿', label: 'NZ', name: 'New Zealand' },
  { code: '+51',  flag: '🇵🇪', label: 'PE', name: 'Perú' },
  { code: '+63',  flag: '🇵🇭', label: 'PH', name: 'Philippines' },
  { code: '+92',  flag: '🇵🇰', label: 'PK', name: 'Pakistan' },
  { code: '+7',   flag: '🇷🇺', label: 'RU', name: 'Россия' },
  { code: '+966', flag: '🇸🇦', label: 'SA', name: 'السعودية' },
  { code: '+65',  flag: '🇸🇬', label: 'SG', name: 'Singapore' },
  { code: '+66',  flag: '🇹🇭', label: 'TH', name: 'ไทย' },
  { code: '+216', flag: '🇹🇳', label: 'TN', name: 'تونس' },
  { code: '+886', flag: '🇹🇼', label: 'TW', name: '台灣' },
  { code: '+84',  flag: '🇻🇳', label: 'VN', name: 'Việt Nam' },
  { code: '+27',  flag: '🇿🇦', label: 'ZA', name: 'South Africa' },
];
