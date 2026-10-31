/**
 * Draft Sinhala translations for Milestone 0.
 * Not yet reviewed by the translation owner (OD 06).
 */
export const si = {
  common: {
    appName: 'SAHANA',
    language: {
      en: 'ඉංග්‍රීසි',
      si: 'සිංහල',
      ta: 'දෙමළ',
      label: 'භාෂාව',
    },
    action: {
      save: 'සුරකින්න',
      cancel: 'අවලංගු කරන්න',
      signIn: 'පිවිසෙන්න',
      signOut: 'ඉවත් වන්න',
      retry: 'නැවත උත්සාහ කරන්න',
      approve: 'අනුමත කරන්න',
      close: 'වසන්න',
      previous: 'පෙර',
      next: 'ඊළඟ',
    },
    state: {
      loading: 'පූරණය වෙමින්',
      empty: 'තවම කිසිවක් නැත',
      error: 'යමක් වැරදී ඇත',
    },
  },
  auth: {
    signIn: {
      title: 'පිවිසෙන්න',
      email: 'විද්‍යුත් තැපෑල',
      password: 'මුරපදය',
      submit: 'පිවිසෙන්න',
      failed: 'විද්‍යුත් තැපෑල හෝ මුරපදය වලංගු නැත',
      society: 'සමිතිය',
      chooseSociety: 'සමිතියක් තෝරන්න',
      rateLimited: 'පිවිසීමේ උත්සාහයන් වැඩිය. පසුව නැවත උත්සාහ කරන්න.',
    },
  },
  shell: {
    nav: {
      menu: 'මෙනුව',
      collapse: 'මෙනුව හකුළන්න',
      expand: 'මෙනුව විහිදන්න',
      config: 'වින්‍යාසය',
      home: 'මුල් පිටුව',
      requests: 'ඉල්ලීම්',
      profile: 'පැතිකඩ',
    },
    user: {
      menu: 'ගිණුම',
    },
    mfa: {
      title: 'පිවිසුම් කේතය',
      start: 'පිවිසුම් කේතයක් සකසන්න',
      code: 'ඉලක්කම් 6 කේතය',
      confirm: 'කේතය තහවුරු කරන්න',
      saved: 'පිවිසුම් කේතය සක්‍රියයි',
      already: 'මෙම ගිණුමට පිවිසුම් කේතයක් දැනටමත් සක්‍රියයි',
      hint: 'සැකසුම් සබැඳිය authenticator යෙදුමක තබා වර්තමාන කේතය ඇතුළත් කරන්න. මෙය ඔබේ මුරපදය ප්‍රතිස්ථාපනය නොකරයි.',
    },
    environment: {
      banner: 'පරිසරය',
    },
    emergency: {
      title: 'හදිසි ආධාර',
      disabled: 'ඉදිරිපත් කිරීම තවම ලබා ගත නොහැක',
      notASubstitute:
        'SAHANA සමිති සුභසාධන ආධාර සම්බන්ධීකරණය කරයි. එය ගිලන් රථ, පොලිස් හෝ වෙනත් හදිසි සේවා ප්‍රතිස්ථාපනය නොකරයි.',
    },
  },
  config: {
    title: 'වින්‍යාසය',
    description: 'වියමන, ජංගම යෙදුම සහ API සඳහා යෙදෙන සමිති සැකසුම්.',
    field: {
      displayName: 'සමිතියේ නම',
      logoFileId: 'ලාංඡන ගොනු යොමුව',
      contactEmail: 'සම්බන්ධතා විද්‍යුත් තැපෑල',
      contactPhone: 'සම්බන්ධතා දුරකථනය',
      defaultLanguage: 'පෙරනිමි භාෂාව',
      currencyCode: 'මුදල් ඒකකය',
      timezone: 'වේලා කලාපය',
      environmentLabel: 'පරිසරය',
    },
    reason: {
      label: 'වෙනස සඳහා හේතුව',
    },
    save: {
      success: 'සුරැකිණි',
    },
    critical: {
      pending: 'මෙම වෙනස අනුමත කිරීමට දෙවන පුද්ගලයෙකු බලා සිටී.',
      approve: 'වෙනස අනුමත කරන්න',
      selfApproval: 'ඔබ ඉදිරිපත් කළ වෙනසක් ඔබට අනුමත කළ නොහැක.',
    },
    consent: {
      title: 'කොන්දේසි සහ පෞද්ගලිකත්වය',
      empty: 'කොන්දේසි හෝ පෞද්ගලිකත්ව පෙළ තවම ප්‍රකාශයට පත් කර නැත.',
    },
    error: {
      forbidden: 'මෙම සැකසුම වෙනස් කිරීමට ඔබට අවසර නැත.',
    },
  },
  errors: {
    unauthorized: 'ඉදිරියට යාමට පිවිසෙන්න',
    forbidden: 'එය කිරීමට ඔබට අවසර නැත',
    notFound: 'එම වාර්තාව ලබා ගත නොහැක',
    validation: 'ඉස්මතු කළ ක්ෂේත්‍ර පරීක්ෂා කරන්න',
    generic: 'ඉල්ලීම සම්පූර්ණ කළ නොහැකි විය',
    rateLimited: 'උත්සාහයන් වැඩිය. පසුව නැවත උත්සාහ කරන්න.',
  },
  modules: {
    kpi: {
      records: 'වාර්තා',
    },
    notice:
      'මෙම වාර්තා සමාජය සඳහා ගබඩා කෙරේ. සුබසාධන සුදුසුකම්, ණය පොලිය, අනුමැති සීමා, සහ ESG ප්‍රතිඵල ගණනය නොකෙරේ.',
    saved: 'සුරකින ලදි',
    nav: {
      members: 'සාමාජිකයින්',
      governance: 'පාලනය',
      welfare: 'සුබසාධනය',
      ledger: 'ලෙජරය',
      loans: 'ණය',
      projects: 'ව්‍යාපෘති',
      emergency: 'හදිසි ආධාර',
      esg: 'ESG',
    },
    field: {
      memberNo: 'සාමාජික අංකය',
      givenName: 'මුල් නම',
      familyName: 'වාසගම',
      statusCode: 'තත්ත්ව කේතය',
      categoryCode: 'වර්ග කේතය',
      name: 'නම',
      relationshipCode: 'නෑදෑ කේතය',
      requestType: 'ඉල්ලීම් වර්ගය',
      phone: 'දුරකථනය',
      description: 'විස්තරය',
      accountCode: 'ගිණුම් කේතය',
      accountName: 'ගිණුමේ නම',
      accountType: 'ගිණුම් වර්ගය',
      reason: 'හේතුව',
      debit: 'හර',
      credit: 'බැර',
    },
    members: {
      title: 'සාමාජිකයින් සහ පවුල',
      hint: 'තත්ත්ව සහ වර්ග කේත සමාජය ඇතුළත් කරයි. පවුලේ පැතිකඩක් පිවිසුමක් නොවේ. සුදුසුකම් ගණනය නොකෙරේ.',
    },
    governance: {
      title: 'පාලනය',
      hint: 'කමිටු නම් සමාජය ඇතුළත් කරයි. ඡන්දය මෙම අනුවාදයේ නැත.',
    },
    welfare: {
      title: 'සුබසාධනය',
      hint: 'යෝජනාවක් ගබඩා කළ හැක. සමාජ රීතිය පිළිගන්නා තුරු සුදුසුකම් ගණනය නොකෙරේ.',
    },
    ledger: {
      title: 'ලෙජරය',
      hint: 'ගිණුම් සටහන හිස්ව ආරම්භ වේ. හර සහ බැර සමාන වූ විට පමණක් සටහන පළ කෙරේ. පළ කළ පේළි වෙනස් නොකෙරේ.',
    },
    loans: {
      title: 'ණය',
      hint: 'අයදුම් ගබඩා කෙරේ. පොලිය, ගාස්තු, සහ ආපසු ගෙවීම් ගණනය නොකෙරේ.',
    },
    projects: {
      title: 'ව්‍යාපෘති සහ යෝජනා',
      hint: 'යෝජනාවක් පිළිගත්, ප්‍රතික්ෂේප කළ, හෝ පසුවට තැබූ විට මුල් පෙළ ඉතිරි වේ.',
    },
    emergency: {
      title: 'හදිසි ආධාර',
      hint: 'SAHANA සමාජ සුබසාධන සහය සම්බන්ධීකරණය කරයි. එය ගිලන් රථ, පොලිස්, හෝ වෙනත් හදිසි සේවා ප්‍රතිස්ථාපනය නොකරයි.',
    },
    esg: {
      title: 'ESG',
      hint: 'ඉලක්ක ගබඩා කළ හැක. සත්‍යාපිත ප්‍රතිඵලයක් ගණන් කරන්නේ පරීක්ෂා කළ මූලාශ්‍ර පමණි.',
    },
    finance: {
      statements: 'මූල්‍ය ප්‍රකාශ',
      surplus: 'අතිරික්තය',
      cashFlow: 'මුදල් චලනය',
      balanced: 'ශේෂ පත්‍රය සමතුලිතයි',
      unbalanced: 'ශේෂ පත්‍රය සමතුලිත නොවේ',
      bank: 'බැංකු ගැලපීම',
      unmatched: 'නොගැලපුණු ප්‍රකාශ පේළි',
      budget: 'අයවැය පළ කළ මුදල් සමඟ',
      asset: 'වත්කම්',
      depreciation: 'වාර්ෂික ක්ෂය වීම පෙන්වන්නේ ආයු කාලයක් ඇති විට පමණි. එය තනිව පළ නොකෙරේ.',
      investment: 'ආයෝජන පිරිවැයෙන් ගබඩා වේ. මෙය වෙළඳපල වටිනාකමක් නොවේ.',
      funds: 'අරමුදල්',
    },
    member: {
      history: 'තත්ත්ව ඉතිහාසය',
      family: 'පවුල',
      contributions: 'දායකත්ව',
      welfare: 'සුබසාධනය',
      loans: 'ණය',
      projects: 'ව්‍යාපෘති',
      documents: 'ලේඛන',
      notifications: 'දැනුම්දීම්',
      newStatus: 'නව තත්ත්ව කේතය',
      open: 'අරින්න',
      notCalculatedSection: 'මෙම කොටසේ කිසිවක් ගණනය කර නැත.',
    },
    error: {
      unbalanced: 'ලෙජර සටහන තුලනය නොවේ.',
      immutable: 'පළ කළ ඇතුළත් කිරීමක් වෙනස් කළ නොහැක.',
      notCalculated: 'මෙම ප්‍රතිඵලය ගණනය කර නැත.',
      periodClosed: 'එම කාලය වසා ඇත.',
      channelDisabled: 'යෙදුම තුළ අච්චුවක් පමණක් ගබඩා කළ හැක. WhatsApp යවනු නොලැබේ.',
    },
  },
} as const;
