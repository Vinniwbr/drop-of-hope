/** Pequenos auxiliares para camadas HTML (formularios, janelas) sobre o jogo. */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export interface ModalHandle {
  body: HTMLElement;
  close: () => void;
}

/** Janela modal simples. Fecha com ESC, clique fora ou pelo botao. */
export function openModal(title: string, onClose?: () => void): ModalHandle {
  const overlay = el('div', 'doh-overlay');
  const card = el('div', 'doh-card');
  const heading = el('h2', 'doh-title', title);
  const body = el('div', 'doh-body');
  const closeButton = el('button', 'doh-btn ghost', 'Fechar');
  closeButton.type = 'button';
  card.append(heading, body, closeButton);
  overlay.append(card);
  document.body.append(overlay);

  const close = () => {
    overlay.remove();
    window.removeEventListener('keydown', onKey, true);
    onClose?.();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  };
  window.addEventListener('keydown', onKey, true);
  closeButton.addEventListener('click', close);
  overlay.addEventListener('pointerdown', (event) => {
    if (event.target === overlay) close();
  });
  return { body, close };
}
