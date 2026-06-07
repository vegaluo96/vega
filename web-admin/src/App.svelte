<script>
  import { session } from './lib/api.js';
  import Login from './routes/Login.svelte';
  import Dashboard from './routes/Dashboard.svelte';
</script>
{#if $session}<Dashboard />{:else}<Login />{/if}
