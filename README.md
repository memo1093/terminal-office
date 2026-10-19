# Terminal Office

Terminallerini pixel-art bir ofis olarak gösteren, internetsiz çalışan bir Electron masaüstü uygulaması.
Windows, macOS ve Linux'ta çalışır. Her terminal bir masadır; masada küçük bir karakter çalışır, başının üstünde klasör adı ve son çıktılar (konuşma baloncuğu) görünür.
Terminal bir süre (25–50 sn) sessiz kalırsa çalışan masasından kalkar: ya köşedeki kahve makinesinden kahve alır ya da ofiste dolaşır. Bu sırada terminale çıktı gelirse başında **!** ile hemen masasına döner.

## Kullanım

| Eylem | Sonuç |
| --- | --- |
| **+ Masa Ekle** | Pencere açılır: **Klasör seç…** ya da **Son projeler** listesinden birine tıkla → o klasörde shell açılır (Windows: PowerShell, macOS/Linux: `$SHELL` login shell), karakter kapıdan girip masaya oturur. Listede açık masa sayısı görünür, ✕ ile listeden kaldırılır |
| Karaktere tıkla | Ekranın ortasında komut girişi (Enter gönderir, ↑↓ geçmiş, Ctrl+C durdurur) |
| Link baloncuğu (🔗) | Terminalde görünen son URL karakterin üstünde durur; tıklayınca varsayılan tarayıcıda açılır |
| Baloncuğun üzerine gel | Baloncuk büyür: son 10 satır, uzun satırlar kesilmeden alta kayar. İçindeki linkler tıklanınca tarayıcıda açılır; başka bir yere tıklayınca konsol açılır |
| Masaya tıkla | Tam konsol çıktısı (renkli; URL'ler tıklanabilir). Alttaki komut satırından komut gönderilir (Enter, ↑↓ geçmiş, Ctrl+C); terminale tıklayıp doğrudan da yazılabilir. **✕ Kapat** → onay → terminal kapanır, karakter çıkar, masa silinir |
| ▣ | Mini mod: sağ üste küçülür, tüm uygulamaların önünde kalır |
| — | Görev çubuğuna küçült (macOS'ta sarı trafik ışığı) |
| ✕ | Arka plana al: tepside / menü çubuğunda çalışmaya devam eder (çıkış tepsi menüsünden, macOS'ta ⌘Q) |
| ⚙ | Ayarlar: dil (English / Türkçe — varsayılan English) ve tema |
| CPU | Sağ üstte sistem CPU kullanımı (2 sn'de bir; %50+ sarı, %80+ kırmızı). Üzerine gelince uygulamanın kendi payı görünür |

Her projenin masa rengi ayrıdır; aynı klasör adıyla açılan terminaller aynı renkte masaya oturur ve `api #1`, `api #2` diye numaralanır.
Baloncuklardaki çıktı terminal renklerini korur; renksiz metinde hata kırmızı, uyarı sarı, başarı yeşil, URL mavi gösterilir.

Masalar `office.json` içinde saklanır ve açılışta geri yüklenir:
Windows `%APPDATA%	erminal-office`, macOS `~/Library/Application Support/terminal-office`, Linux `~/.config/terminal-office`.

### Platform notları
- **macOS:** Pencere kapatılınca Dock'ta ve menü çubuğunda kalır; Dock ikonuna tıklamak geri getirir. Build imzasız olduğundan ilk açılışta sağ tık → *Aç* gerekir.
- **Linux:** Tepsi ikonu için masaüstünde AppIndicator desteği gerekir (GNOME'da *AppIndicator* eklentisi). Tepsi yoksa ✕ pencereyi küçültür; uygulamayı tekrar çalıştırmak da açık pencereyi öne getirir.

## Geliştirme

```bash
npm install
npm run dev        # Electron + HMR
npm run typecheck
npm run dist       # bulunduğun işletim sistemi için paket (dist/)
npm run dist:win   # NSIS kurulum + portable exe
npm run dist:mac   # dmg + zip (arm64 + x64) — macOS üzerinde
npm run dist:linux # AppImage + deb — Linux üzerinde
```

Her paket kendi işletim sisteminde derlenmeli: `npm install` yalnızca o sistemin node-pty binary'sini indirir. `.github/workflows/build.yml` üç sistemi de GitHub Actions'ta derler (`v*` tag'i veya elle tetikleme).

Renderer, Electron dışında düz tarayıcıda açılırsa (`src/renderer/mock-api.ts`) sahte bir backend ile çalışır.

## Yapı

- `src/main` — pencere/tepsi/mini mod, `pty-manager.ts` (node-pty + headless xterm: baloncuk satırları ve konsol snapshot'ı), JSON store
- `src/preload` — `window.api` (contextIsolation + sandbox)
- `src/renderer/scene` — canvas üzerinde izometrik pixel-art sahne; sprite'lar kod içinde piksel haritası, kontur otomatik üretilir
- `src/renderer/ui` — komut girişi ve konsol paneli

Arayüz metinleri `src/shared/i18n.ts` içinde; yeni dil eklemek için oraya bir sözlük eklemek yeterli.

Harici asset, font veya CDN yok; her şey offline çalışır.
