<script lang="ts">
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<!-- Here, not in the gate or the editor: the server renders neither, since
     which one shows waits on the keys in IndexedDB. A pad's address is all a
     search engine or a link preview could learn of it: the text is locked. -->
<svelte:head>
	<title>{page.data.path} · pad</title>
	<meta property="og:title" content="/{page.data.path}" />
	<meta name="robots" content="noindex" />
</svelte:head>

{@render children()}
