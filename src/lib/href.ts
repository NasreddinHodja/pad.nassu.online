/** `['a', 'b c']` → `/a/b%20c` */
export const href = (parts: string[]) => '/' + parts.map(encodeURIComponent).join('/');
