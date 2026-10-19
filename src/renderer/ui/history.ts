/** Per-terminal command history, shared by the quick command box and the console panel. */
const store = new Map<string, string[]>()
const MAX = 100

export function historyOf(id: string): string[] {
  let h = store.get(id)
  if (!h) store.set(id, (h = []))
  return h
}

export function remember(id: string, cmd: string): void {
  const h = historyOf(id)
  if (!cmd.trim() || h[h.length - 1] === cmd) return
  h.push(cmd)
  if (h.length > MAX) h.shift()
}

/**
 * Wires ↑/↓ history browsing onto an input. `getId` returns the terminal the input
 * currently targets; returns a reset function to call when it is (re)opened.
 */
export function bindHistory(input: HTMLInputElement, getId: () => string | null): () => void {
  let cursor = 0
  input.addEventListener('keydown', (e) => {
    const id = getId()
    if (!id || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    const h = historyOf(id)
    if (!h.length) return
    cursor = e.key === 'ArrowUp' ? Math.max(0, cursor - 1) : Math.min(h.length, cursor + 1)
    input.value = h[cursor] ?? ''
    e.preventDefault()
  })
  return () => {
    const id = getId()
    cursor = id ? historyOf(id).length : 0
  }
}
