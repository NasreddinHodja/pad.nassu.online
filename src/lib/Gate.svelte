<script lang="ts">
	import { goto } from '$app/navigation';
	import * as api from './api';
	import { checkPassword, type Keys } from './crypto';
	import { href } from './href';

	let {
		path,
		root,
		mode,
		salt,
		onunlock
	}: {
		path: string;
		root: string;
		mode: 'claim' | 'unlock' | 'password';
		salt: string | null;
		onunlock: (keys: Keys) => void;
	} = $props();

	// The fields have no names, so even with scripts off the form can't send
	// a password anywhere: it only ever leaves through the code below, as keys.
	let current = $state('');
	let next = $state('');
	let confirm = $state('');
	let busy = $state(false);
	let problem = $state('');

	async function onsubmit(e: SubmitEvent) {
		e.preventDefault();
		if (mode !== 'unlock') {
			const bad = checkPassword(next) ?? (next !== confirm ? "the passwords don't match" : null);
			if (bad) return (problem = bad);
		}
		busy = true;
		problem = '';
		try {
			if (mode === 'claim') onunlock(await api.claim(root, next));
			else if (mode === 'unlock') onunlock(await api.unlock(root, current, salt!));
			else {
				await api.changePassword(root, current, next, salt!);
				await goto(href(path.split('/')), { invalidateAll: true });
			}
		} catch (e) {
			problem = e instanceof Error ? e.message : 'something went wrong';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>{path} · pad</title>
</svelte:head>

{#snippet field(
	label: string,
	autocomplete: 'current-password' | 'new-password',
	get: () => string,
	set: (v: string) => void
)}
	<label class="flex flex-col gap-1">
		<span class="text-dim">{label}</span>
		<input
			class="h-8 border border-ink bg-bg px-2 text-fg pointer-coarse:h-10"
			type="password"
			{autocomplete}
			required
			maxlength="256"
			bind:value={get, set}
		/>
	</label>
{/snippet}

<main class="flex min-h-dvh flex-col items-center justify-center px-3 py-8">
	<form class="flex w-full max-w-xl flex-col gap-3 panel p-3 sm:p-6" {onsubmit}>
		<!-- For password managers: what the password is for. -->
		<input type="text" autocomplete="username" value="/{root}" hidden readonly />
		{#if mode === 'claim'}
			<h1 class="border-b border-ink text-xl break-all">/{root} is free</h1>
			<p class="text-dim">
				set its password. it locks /{root} and every pad under it, for reading too. the pads are encrypted
				with it in your browser: the server never sees it, so if you lose it, the pads are gone.
			</p>
			{@render field(
				'password',
				'new-password',
				() => next,
				(v) => (next = v)
			)}
			{@render field(
				'again',
				'new-password',
				() => confirm,
				(v) => (confirm = v)
			)}
		{:else if mode === 'unlock'}
			<h1 class="border-b border-ink text-xl break-all">/{root} is locked</h1>
			{@render field(
				'password',
				'current-password',
				() => current,
				(v) => (current = v)
			)}
		{:else}
			<h1 class="border-b border-ink text-xl break-all">/{root}'s password</h1>
			<p class="text-dim">changing it signs every other browser out of /{root}.</p>
			{@render field(
				'current password',
				'current-password',
				() => current,
				(v) => (current = v)
			)}
			{@render field(
				'new password',
				'new-password',
				() => next,
				(v) => (next = v)
			)}
			{@render field(
				'again',
				'new-password',
				() => confirm,
				(v) => (confirm = v)
			)}
		{/if}
		{#if problem}
			<p class="text-ink" role="alert">► {problem}</p>
		{/if}
		<div class="flex items-center gap-3">
			<button
				class="hit relative h-8 cursor-pointer border border-ink bg-ink px-3 text-bg shadow-raised enabled:hover:bg-hi enabled:active:translate-x-0.5 enabled:active:translate-y-0.5 enabled:active:shadow-sunk disabled:cursor-wait pointer-coarse:h-10"
				disabled={busy}
			>
				{busy
					? 'deriving keys…'
					: mode === 'claim'
						? 'claim'
						: mode === 'unlock'
							? 'unlock'
							: 'change'}
			</button>
			{#if mode === 'password'}
				<a class="hit relative text-ink hover:text-hi hover:underline" href={href(path.split('/'))}
					>cancel</a
				>
			{:else}
				<a class="hit relative text-ink hover:text-hi hover:underline" href="/">another pad</a>
			{/if}
		</div>
	</form>
</main>
