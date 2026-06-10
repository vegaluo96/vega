<script>
  import { session } from './lib/api.js';
  import { theme } from './lib/theme.js'; // 引入即生效：data-theme 跟随系统 + localStorage 记忆
  import Login from './routes/Login.svelte';
  import Shell from './routes/Shell.svelte';
  $: void $theme; // 订阅保持主题副作用常驻
</script>

{#if $session}<Shell />{:else}<Login />{/if}
