import { DEFAULT_LANG, translate, type Key, type Lang } from '../shared/i18n'

let lang: Lang = DEFAULT_LANG
const listeners: (() => void)[] = []

export const t = (key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars)
export const currentLang = () => lang

export function onLangChange(cb: () => void): void {
  listeners.push(cb)
}

/**
 * Static markup is translated through attributes:
 * data-i18n → textContent, data-i18n-title → title, data-i18n-placeholder → placeholder.
 */
function applyDom(): void {
  document.documentElement.lang = lang
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) el.textContent = t(el.dataset.i18n as Key)
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle as Key)
  for (const el of document.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]'))
    el.placeholder = t(el.dataset.i18nPlaceholder as Key)
}

export function setLang(next: Lang): void {
  lang = next
  applyDom()
  for (const cb of listeners) cb()
}
