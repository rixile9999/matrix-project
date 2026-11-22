/** Escape HTML, then turn `code` spans into <code>. Safe for {@html}. */
export function renderInline(text: string): string {
	const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	return esc.replace(/`([^`\n]+)`/g, '<code>$1</code>');
}
