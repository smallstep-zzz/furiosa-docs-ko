const originalTooltip = document.createElement('div');
originalTooltip.id = 'original-prose-tooltip';
originalTooltip.lang = 'en';
originalTooltip.setAttribute('role', 'tooltip');
originalTooltip.hidden = true;
document.body.append(originalTooltip);

let activeOriginal;
let dismissTimer;
function hideOriginal() {
  clearTimeout(dismissTimer);
  activeOriginal?.removeAttribute('aria-describedby');
  activeOriginal = undefined;
  originalTooltip.hidden = true;
}

function showOriginal(block) {
  clearTimeout(dismissTimer);
  if (!block || activeOriginal === block) return;
  hideOriginal();
  activeOriginal = block;
  originalTooltip.textContent = block.dataset.originalEn;
  originalTooltip.hidden = false;
  block.setAttribute('aria-describedby', originalTooltip.id);
  const rect = block.getBoundingClientRect();
  const gap = 8;
  const below = window.innerHeight - rect.bottom;
  const above = rect.top;
  const placeBelow = originalTooltip.offsetHeight + gap <= below || below >= above;
  originalTooltip.style.left = Math.max(gap, Math.min(rect.left, window.innerWidth - originalTooltip.offsetWidth - gap)) + 'px';
  originalTooltip.style.top = Math.max(gap, Math.min(placeBelow ? rect.bottom + gap : rect.top - originalTooltip.offsetHeight - gap, window.innerHeight - originalTooltip.offsetHeight - gap)) + 'px';
}

for (const block of document.querySelectorAll('[data-original-en]')) {
  block.tabIndex = 0;
  block.addEventListener('pointerenter', () => showOriginal(block));
  block.addEventListener('pointerleave', event => {
    if (!block.matches(':focus-within')) dismissTimer = setTimeout(hideOriginal, 180);
  });
  block.addEventListener('focusin', () => showOriginal(block));
  block.addEventListener('focusout', event => {
    if (!block.contains(event.relatedTarget)) hideOriginal();
  });
}
originalTooltip.addEventListener('pointerenter', () => clearTimeout(dismissTimer));
originalTooltip.addEventListener('pointerleave', () => {
  if (!activeOriginal?.matches(':focus-within')) hideOriginal();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') hideOriginal();
});
window.addEventListener('resize', hideOriginal);
document.addEventListener('scroll', event => {
  if (event.target !== originalTooltip) hideOriginal();
}, true);
