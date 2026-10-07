<script lang="ts">
	import { page } from '$app/state';
	import Gate from '#lib/Gate.svelte';
	import Pad from '#lib/Pad.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

{#if data.state !== 'unlocked'}
	<Gate
		path={data.path}
		root={data.root}
		mode={data.state === 'open' ? 'claim' : 'unlock'}
		problem={form?.problem}
	/>
{:else if page.url.searchParams.has('password')}
	<Gate path={data.path} root={data.root} mode="password" problem={form?.problem} />
{:else}
	<!-- A fresh editor per pad, so nothing typed in one leaks into the next. -->
	{#key data.path}
		<Pad path={data.path} initial={data.content} subpads={data.subpads} />
	{/key}
{/if}
