// A block caret, as on a terminal, for a textarea or a text input: Firefox and
// Safari have no caret-shape. The real caret goes transparent and a block in
// ink sits over the character after it, which shows through in the background
// colour. Where the caret is comes from a hidden copy of the field's text,
// laid out the same way.

const COPIED = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'text-transform',
  'text-indent',
  'tab-size',
  'overflow-wrap',
  'word-break'
] as const;

export function blockCaret(field: HTMLTextAreaElement | HTMLInputElement) {
  const multiline = field instanceof HTMLTextAreaElement;
  field.style.caretColor = 'transparent';

  const mirror = document.createElement('div');
  mirror.setAttribute('aria-hidden', 'true');
  Object.assign(mirror.style, {
    position: 'absolute',
    top: '0',
    left: '-9999px',
    visibility: 'hidden',
    whiteSpace: multiline ? 'pre-wrap' : 'pre'
  });
  const marker = document.createElement('span');

  const block = document.createElement('div');
  block.className = 'block-caret';
  block.setAttribute('aria-hidden', 'true');
  document.body.append(mirror, block);

  let frame = 0;
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(place);
  };

  function place() {
    const at = field.selectionStart;
    if (document.activeElement !== field || at === null || at !== field.selectionEnd) {
      block.hidden = true;
      return;
    }
    const css = getComputedStyle(field);
    for (const p of COPIED) mirror.style.setProperty(p, css.getPropertyValue(p));
    const px = (p: string) => parseFloat(css.getPropertyValue(p)) || 0;
    const left = px('border-left-width') + px('padding-left');
    const top = px('border-top-width') + px('padding-top');
    const width = field.clientWidth - px('padding-left') - px('padding-right');
    const height = field.clientHeight - px('padding-top') - px('padding-bottom');
    mirror.style.width = multiline ? width + 'px' : 'auto';

    // The character the block covers, and the rest of its line so it wraps
    // where the field wraps it.
    // A password shows as masks: the VGA font has both browsers' (• and ●),
    // one cell each, and the block mustn't show what's under them.
    // An empty field shows its placeholder, and the block sits on its first
    // character.
    const value =
      field.value === ''
        ? field.placeholder
        : field.type === 'password'
          ? '•'.repeat(field.value.length)
          : field.value;
    const next = value[at];
    const covered = next && next !== '\n' ? next : ' ';
    const lineEnd = value.indexOf('\n', at);
    const rest = value.slice(at + (covered === next ? 1 : 0), lineEnd === -1 ? undefined : lineEnd);
    marker.textContent = covered;
    mirror.replaceChildren(value.slice(0, at), marker, rest);

    // The character's own box, not the line's: the font sits where it sits
    // in the line, not necessarily in the middle.
    const glyph = marker.getBoundingClientRect();
    const origin = mirror.getBoundingClientRect();
    const lineHeight = px('line-height') || px('font-size') * 1.5;
    const x = glyph.left - origin.left - field.scrollLeft;
    // An input centres its one line.
    const y = glyph.top - origin.top + (multiline ? -field.scrollTop : (height - lineHeight) / 2);
    if (x < 0 || x + glyph.width > width + 1 || y < 0 || y + glyph.height > height + 1) {
      block.hidden = true;
      return;
    }

    const box = field.getBoundingClientRect();
    Object.assign(block.style, {
      left: box.left + left + x + 'px',
      top: box.top + top + y + 'px',
      width: glyph.width + 'px',
      height: glyph.height + 'px',
      font: `${css.fontSize}/${glyph.height}px ${css.fontFamily}`
    });
    block.textContent = covered;
    block.hidden = false;
    // Moving restarts the blink, so the block is on while it's being moved.
    block.style.animation = 'none';
    void block.offsetWidth;
    block.style.animation = '';
  }

  const fieldEvents = ['input', 'focus', 'blur', 'scroll', 'keydown', 'keyup', 'pointerup'];
  for (const e of fieldEvents) field.addEventListener(e, schedule);
  document.addEventListener('selectionchange', schedule);
  window.addEventListener('resize', schedule);
  window.addEventListener('scroll', schedule, true);
  const resized = new ResizeObserver(schedule);
  resized.observe(field);
  schedule();

  return () => {
    cancelAnimationFrame(frame);
    for (const e of fieldEvents) field.removeEventListener(e, schedule);
    document.removeEventListener('selectionchange', schedule);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('scroll', schedule, true);
    resized.disconnect();
    mirror.remove();
    block.remove();
    field.style.caretColor = '';
  };
}
