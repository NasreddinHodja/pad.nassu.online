<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import * as api from '#lib/api.ts';
  import { storedKeys, storeKeys, type Keys } from '#lib/crypto.ts';
  import Gate from '#lib/Gate.svelte';
  import Pad from '#lib/Pad.svelte';
  import { applyTheme, DEFAULT, rememberedTheme, rememberTheme, type Theme } from '#lib/theme.ts';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  // The root's keys in this browser: undefined while looking, null if it has none.
  let keys = $state<Keys | null | undefined>(undefined);

  $effect(() => {
    const { root, state } = data;
    keys = undefined;
    if (state !== 'unlocked') {
      keys = null;
      return;
    }
    let current = true;
    storedKeys(root).then((k) => current && (keys = k ?? null));
    return () => (current = false);
  });

  // The root's theme on every page of it, the gate's too: as this browser
  // last saw it, until the root's own copy says.
  let theme = $state<Theme>(DEFAULT);

  $effect(() => {
    const { root, state } = data;
    theme = rememberedTheme(root) ?? DEFAULT;
    if (!keys || state !== 'unlocked') return;
    let current = true;
    api.theme(root, keys).then(
      (t) => {
        if (!current) return;
        theme = t ?? DEFAULT;
        rememberTheme(root, t);
      },
      () => {}
    );
    return () => (current = false);
  });

  $effect(() => {
    applyTheme(theme);
    return () => applyTheme(DEFAULT);
  });

  /** Shows `next`; `keep` saves it to the root too. */
  async function retheme(next: Theme, keep: boolean) {
    theme = next;
    if (!keep || !keys) return;
    rememberTheme(data.root, next);
    await api.setTheme(data.root, keys, next);
  }

  async function onunlock(unlocked: Keys) {
    await storeKeys(data.root, unlocked);
    await invalidateAll();
    keys = unlocked;
  }
</script>

<!-- The server lets this browser in, but it needs the keys too, and the other
     way round: either missing, the password gives both. -->
{#if keys === undefined}
  <!-- Opening the key store takes a moment; nothing to show before. -->
{:else if !keys || data.state !== 'unlocked'}
  <Gate
    path={data.path}
    root={data.root}
    mode={data.state === 'open' || data.state === 'deleted' ? 'claim' : 'unlock'}
    salt={data.salt}
    purgeAt={data.purgeAt}
    {onunlock}
  />
{:else if page.url.searchParams.has('password')}
  <Gate path={data.path} root={data.root} mode="password" salt={data.salt} {onunlock} />
{:else}
  <!-- A fresh editor per pad, so nothing typed in one leaks into the next. -->
  {#key data.path}
    <Pad path={data.path} root={data.root} {keys} {theme} {retheme} />
  {/key}
{/if}
