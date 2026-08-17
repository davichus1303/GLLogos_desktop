/**
 * Renderizador mínimo de Markdown → Pango markup.
 *
 * La app no dispone de una librería de Markdown, así que este módulo
 * implementa el subconjunto exigido por la especificación de notas:
 * títulos (#, ##, ###), negrita, itálica, listas, listas numeradas, citas,
 * enlaces y código. El texto original (Markdown) se conserva tal cual; este
 * renderer solo se usa para la vista previa.
 */

/** Escapes text so it is safe inside Pango markup. */
function escapeMarkup(text) {
    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

/** Renders inline Markdown (bold, italic, code, links) as Pango markup. */
function inline(text) {
    let out = escapeMarkup(text);

    out = out.replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g,
        (_match, label, url) =>
            `<a href="${url.replaceAll('"', '&quot;')}">${label}</a>`);
    out = out.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
    out = out.replace(/__([^_\n]+)__/g, '<b>$1</b>');
    out = out.replace(/\*([^*\n]+)\*/g, '<i>$1</i>');
    out = out.replace(/_([^_\n]+)_/g, '<i>$1</i>');
    out = out.replace(/`([^`\n]+)`/g, '<tt>$1</tt>');
    return out;
}

const HEADING_SIZES = {
    1: 'x-large',
    2: 'large',
    3: 'medium',
};

/**
 * Converts Markdown text into Pango markup for display.
 * @param {string} markdown - raw Markdown source.
 * @returns {string} Pango markup.
 */
export function markdownToPango(markdown) {
    const lines = String(markdown ?? '')
        .replace(/\r\n?/g, '\n')
        .split('\n');

    const blocks = [];
    let paragraph = [];
    let list = null;

    const flushParagraph = () => {
        if (paragraph.length === 0)
            return;
        blocks.push(`<span>${paragraph.map(inline).join('<br/>')}</span>`);
        paragraph = [];
    };

    const flushList = () => {
        if (!list)
            return;
        const items = list.items.map((item, index) => {
            const marker = list.ordered ? `${index + 1}.` : '&#9679;';
            return `<span>${marker} ${inline(item)}</span>`;
        });
        blocks.push(`<span>${items.join('<br/>')}</span>`);
        list = null;
    };

    const flush = () => {
        flushParagraph();
        flushList();
    };

    for (const raw of lines) {
        const line = raw.trimEnd();
        const trimmed = line.trim();

        if (trimmed === '') {
            flush();
            continue;
        }

        const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
        if (heading) {
            flush();
            const level = heading[1].length;
            const size = HEADING_SIZES[level] ?? 'medium';
            blocks.push(
                `<span font_weight="bold" size="${size}">${inline(heading[2])}</span>`);
            continue;
        }

        if (trimmed.startsWith('> ')) {
            flush();
            blocks.push(
                `<span style="italic" foreground="gray">${inline(trimmed.slice(2))}</span>`);
            continue;
        }

        const unordered = trimmed.match(/^[-*+]\s+(.*)$/);
        if (unordered) {
            flushParagraph();
            if (!list || list.ordered) {
                flushList();
                list = {ordered: false, items: []};
            }
            list.items.push(unordered[1]);
            continue;
        }

        const ordered = trimmed.match(/^(\d+)[.)]\s+(.*)$/);
        if (ordered) {
            flushParagraph();
            if (!list || !list.ordered) {
                flushList();
                list = {ordered: true, items: []};
            }
            list.items.push(ordered[2]);
            continue;
        }

        if (list)
            flushList();
        paragraph.push(line);
    }

    flush();
    return blocks.join('<br/>');
}
