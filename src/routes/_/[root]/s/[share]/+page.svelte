<script lang="ts">
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import * as api from '#lib/api.ts';
  import { href } from '#lib/href.ts';

  // A read-only link's copy. The key is after the `#`, which never reaches the
  // server, so this opens in the browser only.
  let shared = $state<{ path: string; text: string; createdAt: number } | null>(null);
  let problem = $state('');

  const when = (ms: number) =>
    new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  onMount(async () => {
    const key = location.hash.slice(1);
    if (!key) return (problem = 'this link is missing its key, the part after the #');
    try {
      shared = await api.readShare(page.params.root!, page.params.share!, key);
    } catch (e) {
      problem = e instanceof Error ? e.message : "couldn't open the link";
    }
  });
</script>

<svelte:head>
  <title>{shared ? `${shared.path} · ` : ''}read-only · pad</title>
  <meta name="robots" content="noindex" />
  <meta property="og:title" content="a read-only pad" />
</svelte:head>

<div class="mx-auto flex min-h-dvh max-w-6xl flex-col gap-3 p-3 sm:p-6">
  <header
    class="flex flex-wrap items-center gap-x-4 panel px-3 py-1 pointer-coarse:gap-y-2 pointer-coarse:py-2"
  >
    <nav class="flex min-w-0 flex-wrap" aria-label="path">
      <a class="hit relative text-ink hover:text-hi hover:underline" href="/">pad</a>
      {#if shared}
        <span class="px-1 text-dim">/</span>
        <!-- The pad itself, for those with the password. -->
        <a
          class="hit relative break-all text-ink hover:text-hi hover:underline"
          href={href(shared.path.split('/'))}>{shared.path}</a
        >
      {/if}
    </nav>
    <span class="ml-auto text-dim">
      {shared ? `read-only, as of ${when(shared.createdAt)}` : problem ? '' : 'opening…'}
    </span>
  </header>

  {#if problem}
    <p class="panel p-3 text-ink" role="alert">► {problem}</p>
  {:else if shared}
    <pre
      class="flex-1 panel p-3 font-sans break-words whitespace-pre-wrap text-fg">{shared.text}</pre>
  {/if}
</div>
