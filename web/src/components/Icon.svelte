<script>
  // 统一线性图标：全部纯描边、同一笔宽、同一视觉重量、同一光学尺寸（不混填充）。
  // currentColor 跟主题，零依赖，不用 emoji。
  export let name = '';
  export let size = 22;
  export let sw = 1.8;
</script>

<svg class="ico" width={size} height={size} viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width={sw} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if name === 'plaza'}
    <!-- 此刻/广场：星芒（ZSKY 星空，纯描边） -->
    <path d="M12 3.5Q12.7 11.3 20.5 12 12.7 12.7 12 20.5 11.3 12.7 3.5 12 11.3 11.3 12 3.5Z" />
  {:else if name === 'explore'}
    <!-- 探索：罗盘 -->
    <circle cx="12" cy="12" r="8.3" />
    <path d="M14.7 9.3 13 13 9.3 14.7 11 11Z" />
  {:else if name === 'notifications'}
    <!-- 通知：铃 -->
    <path d="M6.5 10.5a5.5 5.5 0 0 1 11 0c0 3.7 1.4 4.8 1.9 5.4H4.6c.5-.6 1.9-1.7 1.9-5.4Z" />
    <path d="M10 19a2 2 0 0 0 4 0" />
  {:else if name === 'chats'}
    <!-- 对话：气泡 -->
    <path d="M20 13.5A3.5 3.5 0 0 1 16.5 17H9l-4 3 .02-12.5A3.5 3.5 0 0 1 8.5 4h8A3.5 3.5 0 0 1 20 7.5Z" />
  {:else if name === 'me'}
    <!-- 我：人 -->
    <circle cx="12" cy="8" r="3.4" />
    <path d="M5.7 20a6.3 6.3 0 0 1 12.6 0" />
  {:else if name === 'search'}
    <circle cx="11" cy="11" r="6.4" />
    <path d="M19.8 19.8 15.5 15.5" />
  {:else if name === 'back'}
    <path d="M14.5 5l-7 7 7 7" />
  {:else if name === 'chevron'}
    <path d="M9.5 5l7 7-7 7" />
  {:else if name === 'send'}
    <path d="M12 20V5M6.5 10.5 12 5l5.5 5.5" />
  {:else if name === 'qr'}
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.2" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" />
    <path d="M13.5 13.5h2.6v2.6M20 13.5v3M16 20h4M20 16.5V20" />
  {:else if name === 'sun'}
    <circle cx="12" cy="12" r="3.8" />
    <path d="M12 2.8v2.2M12 19v2.2M4.8 12H2.6M21.4 12h-2.2M5.6 5.6l1.5 1.5M16.9 16.9l1.5 1.5M18.4 5.6l-1.5 1.5M7.1 16.9l-1.5 1.5" />
  {:else if name === 'moon'}
    <path d="M20 13.4A8 8 0 1 1 10.6 4a6.3 6.3 0 0 0 9.4 9.4Z" />
  {:else if name === 'logout'}
    <path d="M14 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2.5M10 12h10M17 9l3 3-3 3" />
  {/if}
</svg>

<style>
  .ico { display: block; flex: none; }
</style>
