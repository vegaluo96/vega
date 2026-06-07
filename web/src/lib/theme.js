// 白天/黑夜主题：跟随系统 + 手动切换并持久化（§8.4）。颜色全在 CSS 变量，切 data-theme 即全站适配。
import { writable } from 'svelte/store';

const KEY = 'zsky-theme';
const initial = localStorage.getItem(KEY) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export const theme = writable(initial);
theme.subscribe((t) => {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem(KEY, t);
});

export function toggleTheme() {
  theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
}
