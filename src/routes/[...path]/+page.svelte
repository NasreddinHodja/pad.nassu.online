<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { storedKeys, storeKeys, type Keys } from '#lib/crypto.ts';
	import Gate from '#lib/Gate.svelte';
	import Pad from '#lib/Pad.svelte';
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
		mode={data.state === 'open' ? 'claim' : 'unlock'}
		salt={data.salt}
		{onunlock}
	/>
{:else if page.url.searchParams.has('password')}
	<Gate path={data.path} root={data.root} mode="password" salt={data.salt} {onunlock} />
{:else}
	<!-- A fresh editor per pad, so nothing typed in one leaks into the next. -->
	{#key data.path}
		<Pad path={data.path} root={data.root} {keys} />
	{/key}
{/if}
