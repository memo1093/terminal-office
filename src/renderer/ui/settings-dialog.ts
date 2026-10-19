import { LANGS, type Key, type Lang } from '../../shared/i18n'
import type { ThemePref } from '../../shared/types'
import { t } from '../i18n'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const THEMES: ThemePref[] = ['system', 'light', 'dark']

/** ⚙ Settings: language and theme. */
export class SettingsDialog {
  private overlay = $('settings-overlay')
  private lang: Lang = 'en'
  private theme: ThemePref = 'system'

  onLang: (lang: Lang) => void = () => {}
  onTheme: (theme: ThemePref) => void = () => {}

  constructor() {
    this.overlay.addEventListener('mousedown', (e) => {
      if (e.target === this.overlay) this.close()
    })
    $('settings-close').addEventListener('click', () => this.close())
    this.overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close()
    })
  }

  get isOpen(): boolean {
    return !this.overlay.hidden
  }

  open(lang: Lang, theme: ThemePref): void {
    this.lang = lang
    this.theme = theme
    this.render()
    this.overlay.hidden = false
    this.overlay.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus()
  }

  close(): void {
    this.overlay.hidden = true
  }

  /** Re-render labels (e.g. after the language changed). */
  render(): void {
    this.segmented(
      $('set-lang'),
      LANGS.map((l) => ({ id: l.id, label: l.label })),
      this.lang,
      (id) => {
        this.lang = id as Lang
        this.onLang(this.lang)
        this.render()
      }
    )
    this.segmented(
      $('set-theme'),
      THEMES.map((id) => ({ id, label: t(`theme.${id}` as Key) })),
      this.theme,
      (id) => {
        this.theme = id as ThemePref
        this.onTheme(this.theme)
        this.render()
      }
    )
  }

  private segmented(host: HTMLElement, items: { id: string; label: string }[], current: string, pick: (id: string) => void): void {
    const focused = host.contains(document.activeElement)
    host.replaceChildren(
      ...items.map((it) => {
        const b = document.createElement('button')
        b.type = 'button'
        b.role = 'radio'
        b.textContent = it.label
        b.setAttribute('aria-checked', String(it.id === current))
        b.addEventListener('click', () => pick(it.id))
        return b
      })
    )
    if (focused) host.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus()
  }
}
