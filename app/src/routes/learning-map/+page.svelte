<script lang="ts">
	import { t } from '#lib/i18n.svelte.ts';

	let history = $state<'denominator' | 'prevalence'>('denominator');
</script>

<svelte:head><title>{t('학습 구조', 'Learning model')} · Matrix</title></svelte:head>

<main class="model">
	<header>
		<h1>{t('학습 구조', 'Learning model')}</h1>
		<p class="lead">{t('어떤 연습이 다음 주, 처음 보는 문제를 푸는 데 도움이 될까?', 'Which exercise today will help you solve an unfamiliar problem next week?')}</p>
		<p>{t('Matrix가 만들려는 지식지도에는 정해진 출발점이나 필수 순서가 없습니다. 풀이 이력이 비슷한 사람들이 서로 다른 연습을 한 뒤 무엇을 스스로 해결하는지 비교해, 연습 사이의 연결을 찾아갑니다.', 'The proposed map has no fixed starting point or required order. Its connections come from comparing what learners with similar histories can solve on their own after different kinds of practice.')}</p>
	</header>

	<section class="example" aria-labelledby="example-title">
		<div class="example-head">
			<h2 id="example-title">{t('베이즈로 보는 예시', 'An example with Bayes')}</h2>
			<span>{t('설계 예시', 'Design example')}</span>
		</div>
		<fieldset>
			<legend>{t('어떤 풀이 이력을 살펴볼까요?', 'Which practice history would you like to explore?')}</legend>
			<div class="choices">
				<label><input type="radio" name="history" value="denominator" bind:group={history} />{t('조건을 뒤집어 계산함', 'Reverses the condition')}</label>
				<label><input type="radio" name="history" value="prevalence" bind:group={history} />{t('기저율 변화를 놓침', 'Misses a change in the base rate')}</label>
			</div>
		</fieldset>
		<div class="comparison" aria-live="polite">
			<div>
				<h3>{t('같은 3분에 비교할 연습', 'Two ways to spend three minutes')}</h3>
				{#if history === 'denominator'}
					<ul><li>{t('도수표에서 양성인 항목만 골라 분모를 만든다.', 'Build the denominator by selecting flagged items in a frequency table.')}</li><li>{t('같은 표에서 두 조건부확률의 식을 각각 쓴다.', 'Write both conditional probability expressions for the same table.')}</li></ul>
				{:else}
					<ul><li>{t('기저율이 다른 두 공장의 경보를 비교한다.', 'Compare alerts from two factories with different defect rates.')}</li><li>{t('한 공장의 기저율을 바꿔 가며 경보의 정밀도를 다시 계산한다.', 'Vary one factory’s defect rate and recalculate the precision of its alerts.')}</li></ul>
				{/if}
			</div>
			<div>
				<h3>{t('일주일 뒤의 새 문제', 'An unseen problem a week later')}</h3>
				{#if history === 'denominator'}
					<p>{t('스팸 필터의 로그를 보고, 경보 하나가 실제 스팸일 확률을 구한다. 어떤 메시지를 분모에 넣을지 힌트 없이 정할 수 있을까?', 'Given a spam filter log, find the probability that a flagged message is spam. Can the learner choose the denominator without a hint?')}</p>
				{:else}
					<p>{t('새 서비스에서 모델 경보의 정밀도가 낮아졌다. 기저율 변화로 설명할 수 있는지, 판단하려면 어떤 추가 데이터가 필요한지 말할 수 있을까?', 'A model’s alerts are less precise in a new service. Could a change in the base rate explain it? What further data would settle the question?')}</p>
				{/if}
			</div>
		</div>
		<p class="caption">{t('두 연습은 비교 후보입니다. 어느 쪽이 더 도움이 되는지는 지연 평가로 추정합니다.', 'These are candidate exercises. A delayed assessment would test which one helps more.')}</p>
	</section>

	<section aria-labelledby="materials">
		<h2 id="materials">{t('문제와 지도의 역할', 'How problems fit the map')}</h2>
		<dl>
			<div><dt>{t('PDF와 보충 문제', 'PDFs and supporting exercises')}</dt><dd>{t('PDF 시범 기능은 선택한 자료를 개인 문제집으로 만듭니다. 장기적으로는 막히는 개념에 짧은 보충 연습을 연결하려 합니다. 목표는 책을 다시 펼치지 않고도 새로운 사례를 풀 수 있게 하는 것입니다.', 'The PDF pilot turns your material into a private practice set. The long-term plan connects short supporting exercises to concepts that cause difficulty. The goal is to solve new cases independently of the book.')}</dd></div>
			<div><dt>{t('암기·반복·전이', 'Recall, repetition and transfer')}</dt><dd>{t('같은 문제를 다시 풀면 기억을 확인할 수 있습니다. 전이를 확인할 때는 연습에 쓰지 않은 문제군에서 맥락이나 표현을 바꾸고, 풀이법을 스스로 선택하게 합니다.', 'Repeating an item checks recall. To test transfer, hold out a family of problems, change the context or representation, and let the learner choose a method.')}</dd></div>
			<div><dt>{t('복합 사고', 'Combining ideas')}</dt><dd>{t('기저율과 오판 비용을 따로 연습한 뒤, 새로운 경보 시스템의 임계값을 바꿀지 결정합니다. 필요한 정보를 골라내거나 판단 근거가 부족하다고 설명하는 것도 수행의 일부입니다.', 'After practicing base rates and error costs separately, decide whether to change an alert threshold in a new system. Identifying missing information and explaining when to defer a decision are part of the task.')}</dd></div>
		</dl>
		<details>
			<summary>{t('연결의 효과는 어떻게 추정할까?', 'How would we estimate the effect of a connection?')}</summary>
			<p>{t('비교할 후보가 여럿이면 일부 추천을 무작위로 배정하고, 각 후보의 제시 확률과 실제 선택을 기록합니다. 비슷한 이력에서 같은 시간을 썼을 때 새 문제의 수행 차이를 추정합니다. 데이터가 적은 연결은 미확인 상태로 둡니다.', 'When several exercises fit, randomize some offers and log their probabilities as well as the learner’s choice. Estimate the difference on unseen tasks for comparable histories and equal practice time. Connections with little evidence remain uncertain.')}</p>
		</details>
	</section>
	<section class="live" aria-labelledby="live-title">
		<h2 id="live-title">{t('지금 사용할 수 있는 기능', 'Available today')}</h2>
		<p>{t('확률·통계와 스파링에서 연습하고, 복기와 정원에서 내 풀이 기록을 확인할 수 있습니다. PDF 문제집에서 내 자료로 문제를 만들 수 있습니다. 연습 간 전이 효과 추정은 설계 단계입니다.', 'Practice in Statistics and Sparring, then explore your attempts in Debrief and Garden. Create private exercises in PDF sets. Transfer-effect estimation is in design.')}</p>
		<nav aria-labelledby="live-title">
			<a href="/library">{t('PDF 문제집', 'PDF sets')}</a><a href="/stats">{t('확률·통계', 'Statistics')}</a><a href="/spar">{t('스파링', 'Sparring')}</a><a href="/debrief">{t('복기', 'Debrief')}</a><a href="/garden">{t('정원', 'Garden')}</a>
		</nav>
	</section>
</main>

<style>
	.model { padding: clamp(24px, 5vw, 54px) clamp(17px, 4vw, 40px); display: grid; gap: 32px; overflow-wrap: anywhere; word-break: keep-all; }
	h1, h2, h3, p, dl, dd, ul { margin: 0; }
	h1 { font: 600 clamp(34px, 6vw, 56px)/1.1 var(--f-display); letter-spacing: -.045em; }
	h2 { font: 600 clamp(20px, 3vw, 26px)/1.24 var(--f-display); }
	h3, dt { font: 600 15px/1.4 var(--f-body); }
	header p, dd, .live p, details p { color: var(--muted); }
	.lead { font: 500 clamp(20px, 3vw, 25px)/1.4 var(--f-display); margin: 14px 0 8px; color: var(--ink); }
	.example { padding: clamp(17px, 3vw, 27px); background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); }
	.example-head, .choices, .live nav { display: flex; align-items: center; gap: 8px 14px; flex-wrap: wrap; }
	.example-head { justify-content: space-between; }
	.example-head span, .caption { color: var(--muted); font-size: 13px; }
	fieldset { border: 0; padding: 0; margin: 19px 0; min-width: 0; }
	legend { padding: 0; margin-bottom: 8px; }
	.choices label { display: inline-flex; align-items: baseline; gap: 7px; padding: 7px 10px; border: 1px solid var(--line); border-radius: 6px; cursor: pointer; }
	.choices label:has(:checked) { border-color: var(--accent); }
	input { margin: 0; accent-color: var(--accent); }
	.comparison { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; padding-block: 14px; border-block: 1px solid var(--line); }
	.comparison h3 { margin-bottom: 7px; color: var(--accent); }
	ul { padding-left: 18px; } li + li { margin-top: 5px; }
	.caption, .live p, .live nav { margin-top: 12px; }
	dl { margin-top: 12px; }
	dl div { display: grid; grid-template-columns: minmax(130px, 1fr) 3fr; gap: 15px; padding: 13px 0; border-top: 1px solid var(--line); }
	details { border-block: 1px solid var(--line); padding: 10px 0; } summary { cursor: pointer; } details p { margin-top: 7px; }
	a { color: var(--accent); text-underline-offset: 3px; }
	@media (max-width: 570px) { .comparison, dl div { grid-template-columns: 1fr; } dl div { gap: 4px; } }
</style>
