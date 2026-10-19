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
  'ram.title': 'Memory in use: {used} / {total} GB · Terminal Office itself: {app} MB',

  'tour.welcome.title': 'Welcome to Terminal Office',
  'tour.welcome.body': 'Every terminal you open becomes a desk with a little worker. Here is a 30-second tour.',
  'tour.add.title': 'Add a desk',
  'tour.add.body': 'Choose a folder — or one of your recent projects — and a terminal opens there. A worker walks in and sits down.',
  'tour.desk.title': 'Open the console',
  'tour.desk.body': 'Click a desk for the full, colored terminal and a command line. ✕ Close shuts the terminal and removes the desk.',
  'tour.worker.title': 'Quick command',
  'tour.worker.body': 'Click a worker to type a command for its terminal, right in the middle of the screen.',
  'tour.bubble.title': 'Speech bubbles',
  'tour.bubble.body': 'The latest output appears above each worker. Hover a bubble to enlarge it — links inside are clickable.',
  'tour.coffee.title': 'Coffee breaks',
  'tour.coffee.body': 'When a terminal stays quiet, its worker grabs a coffee or wanders around — and rushes back with a ! when new output arrives.',
  'tour.bar.title': 'Keep an eye on things',
  'tour.bar.body': 'CPU and RAM usage, ⚙ Settings (language, theme) and ▣ mini mode, which keeps a small office above all windows.',
  'tour.done.title': "You're all set",
  'tour.done.body': 'Start with + Add Desk. You can replay this tour anytime from ⚙ Settings.',
  'tour.next': 'Next',
  'tour.back': 'Back',
  'tour.skip': 'Skip tour',
  'tour.finish': 'Get started',
  'tour.step': '{n} / {total}',
  'settings.tour': 'Walkthrough',
  'settings.tour.replay': 'Show the tour again',

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
  'ram.title': 'Kullanılan bellek: {used} / {total} GB · Terminal Office: {app} MB',

  'tour.welcome.title': "Terminal Office'e hoş geldin",
  'tour.welcome.body': 'Açtığın her terminal, küçük bir çalışanın oturduğu bir masaya dönüşür. 30 saniyelik kısa bir tur.',
  'tour.add.title': 'Masa ekle',
  'tour.add.body': 'Bir klasör — ya da son projelerinden birini — seç; orada bir terminal açılır. Bir çalışan içeri girip masaya oturur.',
  'tour.desk.title': 'Konsolu aç',
  'tour.desk.body': 'Masaya tıklayınca renkli tam terminal ve komut satırı açılır. ✕ Kapat terminali kapatır ve masayı siler.',
  'tour.worker.title': 'Hızlı komut',
  'tour.worker.body': 'Çalışana tıklayınca ekranın ortasında o terminal için komut yazabilirsin.',
  'tour.bubble.title': 'Konuşma baloncukları',
  'tour.bubble.body': 'Son çıktılar çalışanın üstünde görünür. Baloncuğun üzerine gelince büyür — içindeki linkler tıklanabilir.',
  'tour.coffee.title': 'Kahve molası',
  'tour.coffee.body': 'Terminal sessiz kalınca çalışan kahve almaya gider ya da ofiste dolaşır; yeni çıktı gelince başında ! ile masasına koşar.',
  'tour.bar.title': 'Gözün üstünde olsun',
  'tour.bar.body': 'CPU ve RAM kullanımı, ⚙ Ayarlar (dil, tema) ve ▣ mini mod — küçük ofisi tüm pencerelerin önünde tutar.',
  'tour.done.title': 'Hazırsın',
  'tour.done.body': "+ Masa Ekle ile başla. Bu turu ⚙ Ayarlar'dan istediğin zaman tekrar izleyebilirsin.",
  'tour.next': 'İleri',
  'tour.back': 'Geri',
  'tour.skip': 'Turu atla',
  'tour.finish': 'Başla',
  'tour.step': '{n} / {total}',
  'settings.tour': 'Tanıtım turu',
  'settings.tour.replay': 'Turu tekrar göster',

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
