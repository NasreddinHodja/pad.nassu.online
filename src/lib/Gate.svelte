<script lang="ts">
	import { enhance } from '$app/forms';
	import { href } from './href';

	let {
		path,
		root,
		mode,
		problem
	}: { path: string; root: string; mode: 'claim' | 'unlock' | 'password'; problem?: string } =
		$props();

	let busy = $state(false);
</script>

<svelte:head>
	<title>{path} · pad</title>
</svelte:head>

{#snippet input(name: string, label: string, autocomplete: 'current-password' | 'new-password')}
	<label class="flex flex-col gap-1">
		<span class="text-dim">{label}</span>
		<input
			class="h-8 border border-ink bg-bg px-2 text-fg pointer-coarse:h-10"
			type="password"
			{name}
			{autocomplete}
			required
			minlength={name === 'password' ? undefined : 8}
			maxlength="256"
		/>
	</label>
{/snippet}

<main class="flex min-h-svh flex-col items-center justify-center gap-6 px-3 py-12">
	<form
		class="flex w-full max-w-xl flex-col gap-4 panel p-6"
		method="post"
		action="?/{mode}"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update();
				busy = false;
			};
		}}
	>
		<!-- For password managers: what the password is for. -->
		<input type="text" name="username" autocomplete="username" value="/{root}" hidden readonly />
		{#if mode === 'claim'}
			<h1 class="text-xl break-all underline">/{root} is free</h1>
			<p class="text-dim">
				set its password. it locks /{root} and every pad under it, for reading too. there's no way to
				get it back if you lose it.
			</p>
			{@render input('new', 'password', 'new-password')}
			{@render input('confirm', 'again', 'new-password')}
		{:else if mode === 'unlock'}
			<h1 class="text-xl break-all underline">/{root} is locked</h1>
			{@render input('password', 'password', 'current-password')}
		{:else}
			<h1 class="text-xl break-all underline">/{root}'s password</h1>
			<p class="text-dim">changing it signs every other browser out of /{root}.</p>
			{@render input('password', 'current password', 'current-password')}
			{@render input('new', 'new password', 'new-password')}
			{@render input('confirm', 'again', 'new-password')}
		{/if}
		{#if problem}
			<p class="text-ink" role="alert">► {problem}</p>
		{/if}
		<div class="flex items-center gap-4">
			<button
				class="hit relative h-8 cursor-pointer border border-ink bg-ink px-3 text-bg shadow-raised hover:bg-hi active:translate-x-0.5 active:translate-y-0.5 active:shadow-sunk disabled:cursor-wait pointer-coarse:h-10"
				disabled={busy}
			>
				{mode === 'claim' ? 'claim' : mode === 'unlock' ? 'unlock' : 'change'}
			</button>
			{#if mode === 'password'}
				<a class="text-ink hover:text-hi hover:underline" href={href(path.split('/'))}>cancel</a>
			{:else}
				<a class="text-ink hover:text-hi hover:underline" href="/">another pad</a>
			{/if}
		</div>
	</form>
</main>
