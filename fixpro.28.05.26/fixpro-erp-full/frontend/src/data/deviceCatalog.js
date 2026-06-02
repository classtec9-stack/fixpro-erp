// كتالوج الأجهزة الشامل — محدّث حتى يناير 2026
// البنية: الشركة ← نوع المنتج ← الموديلات

export const DEVICE_CATALOG = {
  Apple: {
    label: 'Apple',
    types: {
      smartphone: {
        label: 'هاتف ذكي (iPhone)',
        models: [
          'iPhone 16 Pro Max','iPhone 16 Pro','iPhone 16 Plus','iPhone 16','iPhone 16e',
          'iPhone 15 Pro Max','iPhone 15 Pro','iPhone 15 Plus','iPhone 15',
          'iPhone 14 Pro Max','iPhone 14 Pro','iPhone 14 Plus','iPhone 14',
          'iPhone 13 Pro Max','iPhone 13 Pro','iPhone 13','iPhone 13 mini',
          'iPhone 12 Pro Max','iPhone 12 Pro','iPhone 12','iPhone 12 mini',
          'iPhone SE (2022)','iPhone 11 Pro Max','iPhone 11 Pro','iPhone 11',
          'iPhone XS Max','iPhone XS','iPhone XR','iPhone X',
          'iPhone 8 Plus','iPhone 8','iPhone 7 Plus','iPhone 7','أخرى',
        ],
      },
      tablet: {
        label: 'تابلت (iPad)',
        models: [
          'iPad Pro 13" (M4)','iPad Pro 11" (M4)','iPad Air 13" (M2)','iPad Air 11" (M2)',
          'iPad 10th Gen','iPad mini 6','iPad Pro 12.9" (2022)','iPad Pro 11" (2022)',
          'iPad Air 5','iPad 9th Gen','أخرى',
        ],
      },
      laptop: {
        label: 'لابتوب (MacBook)',
        models: [
          'MacBook Pro 16" (M4)','MacBook Pro 14" (M4)','MacBook Air 15" (M3)','MacBook Air 13" (M3)',
          'MacBook Pro 16" (M3)','MacBook Pro 14" (M3)','MacBook Air (M2)','MacBook Pro (M2)',
          'MacBook Air (M1)','MacBook Pro (M1)','أخرى',
        ],
      },
      desktop: {
        label: 'كمبيوتر (Mac)',
        models: ['iMac 24" (M4)','Mac mini (M4)','Mac Studio (M2)','Mac Pro (M2)','iMac 24" (M3)','أخرى'],
      },
      watch: {
        label: 'ساعة ذكية (Apple Watch)',
        models: [
          'Apple Watch Series 10','Apple Watch Ultra 2','Apple Watch SE 2',
          'Apple Watch Series 9','Apple Watch Series 8','Apple Watch Ultra',
          'Apple Watch Series 7','Apple Watch SE','أخرى',
        ],
      },
      audio: {
        label: 'سماعات (AirPods)',
        models: ['AirPods Pro 2','AirPods 4','AirPods Max','AirPods 3','AirPods 2','أخرى'],
      },
    },
  },

  Samsung: {
    label: 'Samsung',
    types: {
      smartphone: {
        label: 'هاتف ذكي (Galaxy)',
        models: [
          'Galaxy S25 Ultra','Galaxy S25+','Galaxy S25',
          'Galaxy S24 Ultra','Galaxy S24+','Galaxy S24','Galaxy S24 FE',
          'Galaxy S23 Ultra','Galaxy S23+','Galaxy S23','Galaxy S23 FE',
          'Galaxy Z Fold6','Galaxy Z Flip6','Galaxy Z Fold5','Galaxy Z Flip5',
          'Galaxy A55','Galaxy A35','Galaxy A25','Galaxy A15',
          'Galaxy S22 Ultra','Galaxy S22+','Galaxy S22','Galaxy Note 20 Ultra',
          'Galaxy A54','Galaxy A34','Galaxy A14','أخرى',
        ],
      },
      tablet: {
        label: 'تابلت (Galaxy Tab)',
        models: [
          'Galaxy Tab S10 Ultra','Galaxy Tab S10+','Galaxy Tab S9 Ultra','Galaxy Tab S9+','Galaxy Tab S9',
          'Galaxy Tab S8 Ultra','Galaxy Tab A9+','Galaxy Tab A9','أخرى',
        ],
      },
      watch: {
        label: 'ساعة ذكية (Galaxy Watch)',
        models: ['Galaxy Watch7','Galaxy Watch Ultra','Galaxy Watch6 Classic','Galaxy Watch6','Galaxy Watch5 Pro','Galaxy Watch5','أخرى'],
      },
      laptop: {
        label: 'لابتوب (Galaxy Book)',
        models: ['Galaxy Book4 Ultra','Galaxy Book4 Pro','Galaxy Book4','Galaxy Book3 Pro','أخرى'],
      },
      audio: {
        label: 'سماعات (Galaxy Buds)',
        models: ['Galaxy Buds3 Pro','Galaxy Buds3','Galaxy Buds2 Pro','Galaxy Buds FE','أخرى'],
      },
    },
  },

  Huawei: {
    label: 'Huawei',
    types: {
      smartphone: {
        label: 'هاتف ذكي',
        models: ['Mate 70 Pro','Mate 60 Pro','P60 Pro','Mate X5','Nova 12','P50 Pro','Mate 50 Pro','أخرى'],
      },
      tablet: { label:'تابلت (MatePad)', models:['MatePad Pro 13.2','MatePad Pro 11','MatePad 11.5','أخرى'] },
      watch: { label:'ساعة ذكية', models:['Watch GT 5 Pro','Watch GT 4','Watch GT 3','Watch Fit 3','أخرى'] },
      laptop: { label:'لابتوب (MateBook)', models:['MateBook X Pro','MateBook 14','MateBook D16','أخرى'] },
    },
  },

  Xiaomi: {
    label: 'Xiaomi',
    types: {
      smartphone: {
        label: 'هاتف ذكي',
        models: ['Xiaomi 15 Ultra','Xiaomi 15','Xiaomi 14 Ultra','Xiaomi 14','Redmi Note 14 Pro','Redmi Note 13 Pro','POCO X6 Pro','Redmi 13C','أخرى'],
      },
      tablet: { label:'تابلت', models:['Xiaomi Pad 6S Pro','Xiaomi Pad 6','Redmi Pad Pro','Redmi Pad','أخرى'] },
      watch: { label:'ساعة ذكية', models:['Watch S4','Watch 2 Pro','Redmi Watch 5','Smart Band 9','أخرى'] },
    },
  },

  OPPO: {
    label: 'OPPO',
    types: {
      smartphone: { label:'هاتف ذكي', models:['Find X8 Pro','Find X7 Ultra','Reno 12 Pro','Reno 11','A79','A60','أخرى'] },
      tablet: { label:'تابلت', models:['Pad 3 Pro','Pad 2','Pad Air','أخرى'] },
      watch: { label:'ساعة ذكية', models:['Watch X','Watch 4 Pro','Watch 3','أخرى'] },
    },
  },

  OnePlus: {
    label: 'OnePlus',
    types: {
      smartphone: { label:'هاتف ذكي', models:['OnePlus 13','OnePlus 12','OnePlus 12R','OnePlus Nord 4','OnePlus 11','أخرى'] },
      tablet: { label:'تابلت', models:['OnePlus Pad 2','OnePlus Pad','أخرى'] },
      watch: { label:'ساعة ذكية', models:['OnePlus Watch 2','OnePlus Watch','أخرى'] },
    },
  },

  Google: {
    label: 'Google',
    types: {
      smartphone: { label:'هاتف ذكي (Pixel)', models:['Pixel 9 Pro XL','Pixel 9 Pro','Pixel 9','Pixel 8 Pro','Pixel 8','Pixel 7 Pro','Pixel Fold','أخرى'] },
      watch: { label:'ساعة ذكية', models:['Pixel Watch 3','Pixel Watch 2','Pixel Watch','أخرى'] },
    },
  },

  Dell: {
    label: 'Dell',
    types: {
      laptop: { label:'لابتوب', models:['XPS 16','XPS 15','XPS 13','Latitude 9450','Inspiron 16','Inspiron 15','Alienware m18','G16','أخرى'] },
      desktop: { label:'كمبيوتر مكتبي', models:['OptiPlex','XPS Desktop','Alienware Aurora','Inspiron Desktop','أخرى'] },
    },
  },

  HP: {
    label: 'HP',
    types: {
      laptop: { label:'لابتوب', models:['Spectre x360','Envy 16','Pavilion 15','EliteBook 1040','Omen 16','Victus 15','أخرى'] },
      desktop: { label:'كمبيوتر مكتبي', models:['Pavilion Desktop','Omen Desktop','EliteDesk','أخرى'] },
    },
  },

  Lenovo: {
    label: 'Lenovo',
    types: {
      laptop: { label:'لابتوب', models:['ThinkPad X1 Carbon','ThinkPad X1 Yoga','Yoga 9i','Legion Pro 7','IdeaPad 5','LOQ 15','أخرى'] },
      tablet: { label:'تابلت', models:['Tab P12','Tab P11 Pro','Tab M11','أخرى'] },
      desktop: { label:'كمبيوتر مكتبي', models:['ThinkCentre','Legion Tower','IdeaCentre','أخرى'] },
    },
  },

  ASUS: {
    label: 'ASUS',
    types: {
      laptop: { label:'لابتوب', models:['ROG Zephyrus G16','ROG Strix G18','Zenbook 14 OLED','Vivobook 16','TUF Gaming A15','ProArt Studiobook','أخرى'] },
      desktop: { label:'كمبيوتر مكتبي', models:['ROG Strix','ProArt Station','أخرى'] },
    },
  },

  Sony: {
    label: 'Sony',
    types: {
      console: { label:'بلايستيشن', models:['PlayStation 5 Pro','PlayStation 5 Slim','PlayStation 5','PlayStation 4 Pro','PlayStation 4 Slim','PS VR2','أخرى'] },
      smartphone: { label:'هاتف ذكي (Xperia)', models:['Xperia 1 VI','Xperia 5 V','Xperia 10 VI','أخرى'] },
      audio: { label:'سماعات', models:['WH-1000XM5','WH-1000XM4','WF-1000XM5','أخرى'] },
    },
  },

  Microsoft: {
    label: 'Microsoft',
    types: {
      console: { label:'إكس بوكس', models:['Xbox Series X','Xbox Series S','Xbox One X','Xbox One S','أخرى'] },
      laptop: { label:'لابتوب (Surface)', models:['Surface Laptop 7','Surface Pro 11','Surface Laptop Studio 2','Surface Go 4','أخرى'] },
    },
  },

  Nintendo: {
    label: 'Nintendo',
    types: {
      console: { label:'أجهزة ألعاب', models:['Nintendo Switch 2','Switch OLED','Switch Lite','Switch','أخرى'] },
    },
  },

  أخرى: {
    label: 'أخرى / غير مدرج',
    types: {
      smartphone: { label:'هاتف ذكي', models:['أخرى'] },
      tablet: { label:'تابلت', models:['أخرى'] },
      laptop: { label:'لابتوب', models:['أخرى'] },
      desktop: { label:'كمبيوتر مكتبي', models:['أخرى'] },
      watch: { label:'ساعة ذكية', models:['أخرى'] },
      console: { label:'جهاز ألعاب', models:['أخرى'] },
      audio: { label:'سماعات', models:['أخرى'] },
      other: { label:'أخرى', models:['أخرى'] },
    },
  },
}

// قائمة الشركات
export const BRANDS = Object.keys(DEVICE_CATALOG)

// أنواع المنتجات لشركة معيّنة
export function getTypesForBrand(brand) {
  const b = DEVICE_CATALOG[brand]
  if (!b) return []
  return Object.entries(b.types).map(([key, val]) => ({ value: key, label: val.label }))
}

// الموديلات لشركة ونوع معيّن
export function getModelsForType(brand, type) {
  return DEVICE_CATALOG[brand]?.types?.[type]?.models || []
}

// تحويل نوع المنتج لقيمة ENUM المدعومة في قاعدة البيانات
export function normalizeDeviceType(type) {
  const map = {
    smartphone:'smartphone', tablet:'tablet', laptop:'laptop',
    desktop:'desktop', watch:'other', console:'other', audio:'other', other:'other'
  }
  return map[type] || 'other'
}
