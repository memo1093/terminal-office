export type Lang = 'en' | 'tr'
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'tr', label: 'Türkçe' }
]
export const DEFAULT_LANG: Lang = 'en'

const en = {
  'app.title': 'Terminal Office',
  'bar.add': '+ Add Desk',
  'bar.add.title': 'Add a new desk for a folder',
  'bar.settings': 'Settings',
  'bar.mini': 'Mini mode — top right, above all windows',
  'bar.minimize': 'Minimize to taskbar',
  'bar.hide': 'Send to background (keeps running in the tray)',
  'mini.add': 'Add desk',
  'mini.restore': 'Normal window',
  'mini.hide': 'Send to background',
  'cpu.title': 'System CPU usage · Terminal Office itself: {app}%',

  'theme.system': 'System',
  'theme.light': 'Light',
  'theme.dark': 'Dark',

  'cmd.placeholder': 'type a command…',
  'cmd.hint': 'Enter: send · ↑↓: history · Esc: close',
  'cmd.ctrlc.title': 'Stop the running command',

  'add.title': 'Add Desk',
  'add.close': 'Close (Esc)',
  'add.pick': 'Choose folder…',
  'add.recent': 'Recent projects',
  'add.empty': 'No projects yet — choose a folder to get started.',
  'add.forget': 'Remove from list',
  'add.open': '{n} open',

  'console.hide': 'Hide',
  'console.hide.title': 'Hide the panel',
  'console.close': '✕ Close',
  'console.close.title': 'Close the terminal and remove the desk',
  'console.confirm': 'Close this terminal and remove the desk?',
  'console.confirm.yes': 'Yes, close it',
  'console.confirm.no': 'Cancel',
  'console.placeholder': 'type a command and press Enter…  (↑↓ history · or click the terminal to type directly)',
  'console.send': 'Send',
  'console.send.title': 'Send the command (Enter)',

  'scene.hint': 'Use + Add Desk to choose a folder',

  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.theme': 'Theme',
  'settings.close': 'Close (Esc)',

  'main.pickFolder': 'Choose a folder for the desk',
  'tray.show': 'Show',
  'tray.mini': 'Mini mode (top right)',
  'tray.normal': 'Normal window',
  'tray.quit': 'Quit'
}

export type Key = keyof typeof en

const tr: Record<Key, string> = {
  'app.title': 'Terminal Office',
  'bar.add': '+ Masa Ekle',
  'bar.add.title': 'Bir klasör için yeni masa ekle',
  'bar.settings': 'Ayarlar',
  'bar.mini': 'Mini mod — sağ üstte, her şeyin önünde',
  'bar.minimize': 'Görev çubuğuna küçült',
  'bar.hide': 'Arka plana al (tepside çalışmaya devam eder)',
  'mini.add': 'Masa ekle',
  'mini.restore': 'Normal ekran',
  'mini.hide': 'Arka plana al',
  'cpu.title': 'Sistem CPU kullanımı · Terminal Office: %{app}',

  'theme.system': 'Sistem',
  'theme.light': 'Açık',
  'theme.dark': 'Koyu',

  'cmd.placeholder': 'komut yaz…',
  'cmd.hint': 'Enter: gönder · ↑↓: geçmiş · Esc: kapat',
  'cmd.ctrlc.title': 'Çalışan komutu durdur',

  'add.title': 'Masa Ekle',
  'add.close': 'Kapat (Esc)',
  'add.pick': 'Klasör seç…',
  'add.recent': 'Son projeler',
  'add.empty': 'Henüz proje yok — bir klasör seçerek başla.',
  'add.forget': 'Listeden kaldır',
  'add.open': '{n} açık',

  'console.hide': 'Gizle',
  'console.hide.title': 'Paneli gizle',
  'console.close': '✕ Kapat',
  'console.close.title': 'Terminali kapat ve masayı sil',
  'console.confirm': 'Terminal kapatılsın ve masa silinsin mi?',
  'console.confirm.yes': 'Evet, kapat',
  'console.confirm.no': 'Vazgeç',
  'console.placeholder': "komut yaz ve Enter'a bas…  (↑↓ geçmiş · terminale tıklayıp doğrudan da yazabilirsin)",
  'console.send': 'Gönder',
  'console.send.title': 'Komutu gönder (Enter)',

  'scene.hint': '+ Masa Ekle ile bir klasör seç',

  'settings.title': 'Ayarlar',
  'settings.language': 'Dil',
  'settings.theme': 'Tema',
  'settings.close': 'Kapat (Esc)',

  'main.pickFolder': 'Masa için klasör seç',
  'tray.show': 'Göster',
  'tray.mini': 'Mini mod (sağ üst)',
  'tray.normal': 'Normal ekran',
  'tray.quit': 'Çıkış'
}

const DICTS: Record<Lang, Record<Key, string>> = { en, tr }

export const isLang = (v: unknown): v is Lang => v === 'en' || v === 'tr'

export function translate(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  let s = DICTS[lang]?.[key] ?? en[key]
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v))
  return s
}
