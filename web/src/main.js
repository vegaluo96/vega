import './app.css';
import './lib/theme.js'; // 初始化主题（订阅即应用 data-theme）
import App from './App.svelte';

// PWA：注册 service worker（离线壳 + 推送）。
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

const app = new App({ target: document.getElementById('app') });
export default app;
