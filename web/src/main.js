import './app.css';
import './lib/theme.js'; // 初始化主题（订阅即应用 data-theme）
import App from './App.svelte';

const app = new App({ target: document.getElementById('app') });
export default app;
