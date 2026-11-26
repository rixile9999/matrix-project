import type { Lesson } from '#lib/stats/types.ts';

export const lessons: Lesson[] = [
	{
		id: 'sample-space', topic: 'probability', mode: 'speed', seconds: 90,
		title: ['표본공간 세기', 'Counting Outcomes'],
		targets: ['표본공간 · 여사건', 'Sample space · complement'],
		prompt: ['공정한 동전을 독립적으로 세 번 던진다. 앞면이 한 번 이상 나올 확률을 구하라.', 'Flip a fair coin three times independently. Find the probability of at least one head.'],
		reference: ['같은 확률을 가진 결과라면 P(A) = |A| / |Ω|. 여사건의 확률은 P(Aᶜ) = 1 − P(A).', 'For equally likely outcomes, P(A) = |A| / |Ω|. The complement satisfies P(Aᶜ) = 1 − P(A).'],
		fields: [{ label: ['앞면이 한 번 이상 나올 확률', 'Probability of at least one head'], answer: 7/8, feedback: ['앞면이 한 번도 안 나오는 경우부터 세어 보라.', 'Start by counting the outcomes with zero heads.'] }],
		hints: [['“한 번 이상”의 여사건을 구하라.', 'Use the complement of “at least one.”'], ['동전을 두 번 던지면 TT 한 가지가 앞면이 없는 경우다. 독립이므로 그 확률은 (1/2)²이다.', 'For two flips, TT is the only outcome with zero heads. Its probability is (1/2)² by independence.']],
		solution: ['전체 결과는 2³ = 8가지다. 앞면이 없는 TTT는 한 가지뿐이므로 1 − 1/8 = 7/8이다.', 'There are 2³ = 8 equally likely outcomes. TTT is the only one with no heads, so the probability is 1 − 1/8 = 7/8.'],
		intent: ['“적어도 하나”가 보이면 직접 세기 전에 여사건의 크기를 확인하라.', 'When you see “at least one,” check how large the complement is before counting directly.']
	},
	{
		id: 'base-rates', topic: 'probability', mode: 'accuracy', seconds: 180,
		title: ['베이즈와 기저율', 'Bayes and Base Rates'],
		targets: ['조건부확률 · 전확률 · 베이즈 정리', 'Conditional probability · total probability · Bayes’ rule'],
		prompt: ['부품의 2%가 불량이다. 검사는 불량품의 95%, 정상품의 5%를 양성으로 표시한다. 전체 양성 확률과 양성일 때 실제 불량일 확률을 구하라.', 'Two percent of parts are defective. A test flags 95% of defective parts and 5% of good parts. Find the overall flag rate and the probability that a flagged part is defective.'],
		reference: ['P(A ∩ B) = P(B | A)P(A). P(A | B) = P(A ∩ B) / P(B). 서로 배반인 경로의 확률은 더한다.', 'P(A ∩ B) = P(B | A)P(A). P(A | B) = P(A ∩ B) / P(B). Add probabilities across disjoint paths.'],
		fields: [
			{ label: ['전체 양성 확률', 'Overall flag rate'], answer: .068, feedback: ['불량품과 정상품이 양성이 되는 두 경로를 합쳐라.', 'Combine the two paths to a flag, one for defective parts and one for good parts.'] },
			{ label: ['양성일 때 불량일 확률', 'Probability of defect given a flag'], answer: 19/68, feedback: ['분모는 전체 부품 수가 아니라 양성 부품 수에 해당한다.', 'The denominator corresponds to all flagged parts.'] }
		],
		hints: [['불량 여부로 집단을 둘로 나누고 각 가지에서 양성이 될 확률을 곱하라.', 'Split the population by defect status and multiply along each path to a flag.'], ['부품 100개 중 불량이 10개이고 두 집단에서 각각 8개와 12개가 양성이면, 전체 양성은 20개이고 양성 중 불량은 8개다.', 'If 8 defective parts and 12 good parts are flagged out of 100 parts, 20 are flagged in total and 8 of those 20 are defective.']],
		solution: ['부품 1,000개로 생각하면 불량 20개 중 19개, 정상 980개 중 49개가 양성이다. 전체 양성 확률은 (19 + 49)/1,000 = 0.068이고, 양성 중 불량 확률은 19/68 ≈ 0.2794이다.', 'Out of 1,000 parts in expectation, 19 of 20 defective parts and 49 of 980 good parts are flagged. The overall flag rate is (19 + 49)/1,000 = 0.068. The defect probability given a flag is 19/68 ≈ 0.2794.'],
		intent: ['P(양성 | 불량)과 P(불량 | 양성)을 바꾸면 분모와 질문이 함께 달라진다.', 'Swapping the test result and defect status changes the conditioning population and the question.']
	},
	{
		id: 'expectation', topic: 'probability', mode: 'accuracy', seconds: 180,
		title: ['기댓값과 분산', 'Mean and Variance'],
		targets: ['이산 확률변수 · 2차 모멘트', 'Discrete random variables · second moments'],
		prompt: ['확률변수 X는 0, 1, 3을 각각 확률 1/2, 1/4, 1/4로 취한다. E[X]와 Var(X)를 구하라.', 'A random variable X takes values 0, 1, and 3 with probabilities 1/2, 1/4, and 1/4. Find E[X] and Var(X).'],
		reference: ['E[g(X)] = Σ g(x)P(X = x). Var(X) = E[X²] − (E[X])².', 'E[g(X)] = Σ g(x)P(X = x). Var(X) = E[X²] − (E[X])².'],
		fields: [
			{ label: ['기댓값 E[X]', 'Mean E[X]'], answer: 1, feedback: ['각 값을 그 값의 확률로 가중하라.', 'Weight each value by its probability.'] },
			{ label: ['분산 Var(X)', 'Variance Var(X)'], answer: 1.5, feedback: ['값을 먼저 제곱해서 평균을 내고, 기댓값의 제곱을 빼라.', 'Average the squared outcomes first, then subtract the squared mean.'] }
		],
		hints: [['같은 확률표로 X와 X²의 기댓값을 각각 구하라.', 'Use the same probability table to find the means of X and X².'], ['X가 같은 확률로 0 또는 2이면 E[X] = 1, E[X²] = 2이므로 Var(X) = 2 − 1² = 1이다.', 'If X is equally likely to be 0 or 2, E[X] = 1 and E[X²] = 2, so Var(X) = 2 − 1² = 1.']],
		solution: ['E[X] = 0/2 + 1/4 + 3/4 = 1이다. E[X²] = 0/2 + 1/4 + 9/4 = 2.5이므로 분산은 2.5 − 1² = 1.5다.', 'E[X] = 0/2 + 1/4 + 3/4 = 1. E[X²] = 0/2 + 1/4 + 9/4 = 2.5, which gives variance 2.5 − 1² = 1.5.'],
		intent: ['제곱의 평균과 평균의 제곱의 차이가 분산이다.', 'Variance is the gap between the mean of the squares and the square of the mean.']
	},
	{
		id: 'shared-coin', topic: 'probability', mode: 'depth', seconds: 360,
		title: ['조건부 독립', 'Conditional Independence'],
		targets: ['잠재변수 · 결합확률 · 공분산', 'Latent variables · joint probability · covariance'],
		prompt: ['앞면 확률이 각각 1/4, 3/4인 두 동전 중 하나를 같은 확률로 뽑아 두 번 던진다. 선택한 동전이 주어지면 두 던짐은 독립이다. X₁과 X₂를 앞면 지시변수로 두고, 첫 던짐의 앞면 확률, 두 번 모두 앞면일 확률, Cov(X₁, X₂)를 구하라.', 'Choose one of two coins with equal probability. Their head probabilities are 1/4 and 3/4. Toss that coin twice, independently given the choice. Let X₁ and X₂ indicate heads. Find the first-toss head probability, the probability of two heads, and Cov(X₁, X₂).'],
		reference: ['Cov(X, Y) = E[XY] − E[X]E[Y]. 잠재변수 Z가 있으면 P(A) = Σ P(A | Z = z)P(Z = z).', 'Cov(X, Y) = E[XY] − E[X]E[Y]. For a latent variable Z, P(A) = Σ P(A | Z = z)P(Z = z).'],
		fields: [
			{ label: ['첫 던짐의 앞면 확률', 'Probability of heads on toss one'], answer: .5, feedback: ['두 동전의 첫 던짐 확률을 선택 확률로 가중하라.', 'Average the first-toss probabilities over the coin choice.'] },
			{ label: ['두 번 모두 앞면일 확률', 'Probability of two heads'], answer: 5/16, feedback: ['동전을 하나로 고정한 뒤 두 확률을 곱하라.', 'Multiply the toss probabilities while holding the selected coin fixed.'] },
			{ label: ['공분산 Cov(X₁, X₂)', 'Covariance Cov(X₁, X₂)'], answer: 1/16, feedback: ['X₁X₂는 두 번 모두 앞면일 때만 1이다.', 'X₁X₂ equals one exactly when both tosses are heads.'] }
		],
		hints: [['동전 선택에 조건을 걸고 계산한 뒤 조건을 없애라.', 'Compute conditional probabilities for each coin, then average them.'], ['항상 앞면인 동전과 항상 뒷면인 동전을 반반 섞으면 첫 앞면 확률과 두 번 앞면 확률이 둘 다 1/2이다. 두 던짐이 같은 동전을 쓰기 때문이다.', 'Mix an always-heads coin and an always-tails coin equally. Both first-toss heads and two heads have probability 1/2 because both tosses share the selected coin.']],
		solution: ['첫 앞면은 (1/4 + 3/4)/2 = 1/2이다. 두 번 앞면은 ((1/4)² + (3/4)²)/2 = 5/16이다. 두 지시변수의 공분산은 5/16 − (1/2)(1/2) = 1/16이다.', 'First-toss heads has probability (1/4 + 3/4)/2 = 1/2. Two heads has probability ((1/4)² + (3/4)²)/2 = 5/16. The covariance is 5/16 − (1/2)(1/2) = 1/16.'],
		intent: ['같은 잠재 조건을 공유하는 관측값은 조건부 독립이어도 주변분포에서 의존할 수 있다.', 'Observations can depend on each other marginally even when they are independent given a shared latent variable.']
	},
	{
		id: 'standard-error', topic: 'inference', mode: 'speed', seconds: 120,
		title: ['표준오차', 'Standard Error'],
		targets: ['표본평균 · 표준오차', 'Sample mean · standard error'],
		prompt: ['모집단 표준편차가 12다. 독립 표본 36개의 평균에 대한 표준오차를 구하라.', 'A population has standard deviation 12. Find the standard error of the mean of 36 independent draws from this population.'],
		reference: ['독립이고 같은 분포를 따르는 n개 값의 평균은 Var(X̄) = σ²/n을 만족한다.', 'The mean of n independent, identically distributed draws has variance Var(X̄) = σ²/n.'],
		fields: [{ label: ['표준오차', 'Standard error'], answer: 2, feedback: ['분산을 n으로 나누고 그 결과의 제곱근을 취하라.', 'Divide the variance by n and take the square root.'] }],
		hints: [['표준오차는 통계량의 표준편차다.', 'The standard error is the standard deviation of the statistic.'], ['σ = 15이고 n = 25라면 Var(X̄) = 225/25 = 9이고 표준오차는 3이다.', 'When σ = 15 and n = 25, Var(X̄) = 225/25 = 9, so the standard error is 3.']],
		solution: ['SE(X̄) = σ/√n = 12/√36 = 2다.', 'SE(X̄) = σ/√n = 12/√36 = 2.'],
		intent: ['관측값의 산포와 표본평균의 반복 표집 변동성을 구별하라.', 'Distinguish variation among observations from variation of the sample mean across repeated samples.']
	},
	{
		id: 'confidence-interval', topic: 'inference', mode: 'accuracy', seconds: 180,
		title: ['신뢰구간', 'Confidence Intervals'],
		targets: ['정규 평균 · 오차한계 · 반복 표집', 'Normal mean · margin of error · repeated sampling'],
		prompt: ['정규 모집단에서 독립적으로 64개를 뽑았다. 모표준편차는 16이고 표본평균은 50이다. z = 1.96으로 모평균의 양측 95% 신뢰구간을 구하라.', 'A random sample of 64 independent draws from a normal population has mean 50. The population standard deviation is 16. Use z = 1.96 to find the two-sided 95% confidence interval for the population mean.'],
		reference: ['정규 모집단의 σ를 알 때 평균의 구간은 X̄ ± zσ/√n이다.', 'For a normal population with known σ, the interval for its mean is X̄ ± zσ/√n.'],
		fields: [
			{ label: ['하한', 'Lower endpoint'], answer: 46.08, feedback: ['표본평균에서 오차한계를 빼라.', 'Subtract the margin of error from the sample mean.'] },
			{ label: ['상한', 'Upper endpoint'], answer: 53.92, feedback: ['표본평균에 오차한계를 더하라.', 'Add the margin of error to the sample mean.'] }
		],
		hints: [['먼저 표본평균의 표준오차를 구하라.', 'Find the standard error of the sample mean first.'], ['평균 20, 표준오차 1의 예에서 95% 오차한계는 1.96이므로 구간은 [18.04, 21.96]이다.', 'For a sample mean of 20 and a standard error of 1, the 95% margin is 1.96, giving [18.04, 21.96].']],
		solution: ['표준오차는 16/√64 = 2이고 오차한계는 1.96 × 2 = 3.92이므로 구간은 [46.08, 53.92]이다.', 'The standard error is 16/√64 = 2, so the margin is 1.96 × 2 = 3.92 and the interval is [46.08, 53.92].'],
		intent: ['95%는 같은 절차로 반복해 만든 구간이 고정된 모평균을 포함하는 비율이다.', 'The 95% refers to the long-run fraction of intervals from this procedure that cover the fixed population mean.']
	},
	{
		id: 'likelihood', topic: 'inference', mode: 'depth', seconds: 360,
		title: ['우도와 추정', 'Likelihood and Estimation'],
		targets: ['베르누이 우도 · 최대우도추정 · 우도비', 'Bernoulli likelihood · maximum likelihood · likelihood ratio'],
		prompt: ['성공 확률 p가 공통인 독립 베르누이 시행 10번 중 7번 성공했다. p의 최대우도추정값과 우도비 L(0.6)/L(0.5)를 구하라. 우도비는 소수 넷째 자리까지 입력하라.', 'Ten independent Bernoulli trials with common success probability p yield seven successes. Find the maximum-likelihood estimate of p and the likelihood ratio L(0.6)/L(0.5). Round the ratio to four decimal places.'],
		reference: ['로그는 양수에서 증가한다. 곱으로 된 우도의 최대값은 로그우도를 최대화해 찾을 수 있다.', 'The logarithm is increasing on positive numbers. Maximizing the log likelihood also maximizes the likelihood.'],
		fields: [
			{ label: ['최대우도추정값', 'Maximum-likelihood estimate'], answer: .7, feedback: ['로그우도에서 성공과 실패의 개수를 각각 계수로 써라.', 'Use the success and failure counts as separate coefficients in the log likelihood.'] },
			{ label: ['우도비 L(0.6)/L(0.5)', 'Likelihood ratio L(0.6)/L(0.5)'], answer: (0.6/0.5)**7 * (0.4/0.5)**3, feedback: ['성공 확률의 비는 7제곱, 실패 확률의 비는 3제곱한다.', 'Raise the success-probability ratio to the seventh power and the failure-probability ratio to the third.'] }
		],
		hints: [['고정된 성공과 실패 결과 각각의 확률을 곱해 우도를 구하라.', 'Form the likelihood by multiplying the probabilities of the observed successes and failures.'], ['4번 중 3번 성공하면 L(p)는 p³(1 − p)에 비례한다. 로그우도 미분식 3/p − 1/(1 − p)를 0으로 놓으면 p = 3/4다.', 'For three successes in four trials, L(p) is proportional to p³(1 − p). Setting the log-likelihood derivative 3/p − 1/(1 − p) to zero gives p = 3/4.']],
		solution: ['L(p)는 p⁷(1 − p)³에 비례한다. 로그우도의 일차 도함수 7/p − 3/(1 − p)를 0으로 놓으면 p = 0.7이다. 이차 도함수는 음수이므로 최대다. 우도비는 1.2⁷ × 0.8³ ≈ 1.8346이다.', 'L(p) is proportional to p⁷(1 − p)³. Setting 7/p − 3/(1 − p) to zero gives p = 0.7. The log-likelihood second derivative is negative, so this is the maximum. The ratio is 1.2⁷ × 0.8³ ≈ 1.8346.'],
		intent: ['우도는 관측값을 고정하고 모수에 따라 읽는다.', 'Hold the observed data fixed and read the likelihood as a function of the parameter.']
	},
	{
		id: 'testing-and-power', topic: 'inference', mode: 'depth', seconds: 480,
		title: ['가설검정과 검정력', 'Testing and Power'],
		targets: ['p값 · 제1종 오류 · 검정력', 'p-value · type I error · power'],
		prompt: ['정규 모집단 평균 μ를 검정한다. 표본평균의 표준오차는 2이고 관측 평균은 14다. 귀무가설 μ = 10을 대립가설 μ > 10에 대해 검정한다. 검정 규칙은 표본평균이 13.29를 넘으면 기각하는 것이다. 표준정규 누적확률 Φ(2) = 0.9772와 Φ(1.355) = 0.9123을 써서 관측 p값과 실제 μ = 16에서의 검정력을 구하라.', 'Test a normal population mean μ. The standard error of the sample mean is 2 and the observed mean is 14. Test μ = 10 against μ > 10, rejecting if the sample mean exceeds 13.29. Use the standard normal CDF values Φ(2) = 0.9772 and Φ(1.355) = 0.9123 to find the observed p-value and the power when μ = 16.'],
		reference: ['정규 확률변수 X의 표준화는 Z = (X − μ)/σ다. 위쪽 꼬리는 P(Z > z) = 1 − Φ(z)이다.', 'Standardize a normal variable X with Z = (X − μ)/σ. Its upper tail is P(Z > z) = 1 − Φ(z).'],
		fields: [
			{ label: ['관측 p값', 'Observed p-value'], answer: .0228, feedback: ['귀무가설의 평균 10을 기준으로, 관측값 14 이상의 꼬리를 구하라.', 'Center the distribution at the null mean 10 and take the upper tail beyond the observed mean 14.'] },
			{ label: ['μ = 16에서 검정력', 'Power at μ = 16'], answer: .9123, feedback: ['실제 평균 16을 기준으로, 기각 경계 13.29보다 클 확률을 구하라.', 'Center the distribution at the true mean 16 and find the upper tail beyond the rejection cutoff 13.29.'] }
		],
		hints: [['p값과 검정력에는 각각 어떤 평균과 경계값을 써야 하는지 먼저 적어라.', 'Write down the mean and cutoff for each of the two probabilities before standardizing.'], ['기각 경계가 7이고 실제 평균이 8, 표준오차가 1이면 검정력은 P(Z > −1) = Φ(1)이다.', 'With a rejection cutoff of 7, a true mean of 8, and a standard error of 1, the power is P(Z > −1) = Φ(1).']],
		solution: ['귀무가설하에서 관측 평균의 z는 (14 − 10)/2 = 2이므로 p값은 1 − 0.9772 = 0.0228이다. 실제 평균이 16이면 기각 경계의 z는 (13.29 − 16)/2 = −1.355이므로 검정력은 P(Z > −1.355) = Φ(1.355) = 0.9123이다.', 'Under the null, the observed mean gives z = (14 − 10)/2 = 2, so p = 1 − 0.9772 = 0.0228. When the true mean is 16, the rejection cutoff gives z = (13.29 − 16)/2 = −1.355, so power is P(Z > −1.355) = Φ(1.355) = 0.9123.'],
		intent: ['p값은 귀무가설하에서 관측값으로 정해지는 꼬리다. 검정력은 특정 대립가설하에서 기각 규칙으로 정해지는 꼬리다.', 'The p-value uses the observed data to define a tail under the null. Power uses the rejection rule to define a tail under a specific alternative.']
	},
	{
		id: 'classifier', topic: 'ml', mode: 'depth', seconds: 360,
		title: ['분류기 임계값', 'Classifier Thresholds'],
		targets: ['기저율 · 정밀도와 재현율 · 임계값', 'Base rate · precision and recall · thresholds'],
		prompt: ['평가 표본은 양성 80개, 음성 920개다. 임계값 A에서 TP = 60, FP = 40이다. 더 높은 임계값 B에서 TP = 40, FP = 10이다. A의 정밀도와 재현율을 구하라. 재현율 60% 이상을 유지하며 정밀도를 최대화하려면 A와 B 중 무엇을 골라야 하는가? A는 1, B는 2를 입력하라.', 'An evaluation set contains 80 positives and 920 negatives. At threshold A, TP = 60 and FP = 40. At a higher threshold B, TP = 40 and FP = 10. Find A’s precision and recall. Which threshold maximizes precision subject to recall of at least 60%? Enter 1 for A or 2 for B.'],
		reference: ['정밀도 = TP/(TP + FP), 재현율 = TP/(TP + FN). 제약을 만족하는 후보끼리 목적을 비교한다.', 'Precision = TP/(TP + FP), and recall = TP/(TP + FN). Compare the objective across feasible choices.'],
		fields: [
			{ label: ['A의 정밀도', 'Precision at A'], answer: .6, feedback: ['분모는 양성으로 예측한 모든 표본이다.', 'The denominator is all predicted positives.'] },
			{ label: ['A의 재현율', 'Recall at A'], answer: .75, feedback: ['분모는 실제 양성 표본 80개다.', 'The denominator is the 80 actual positives.'] },
			{ label: ['임계값 선택 (1 또는 2)', 'Threshold choice (1 or 2)'], answer: 1, feedback: ['두 후보가 필요한 재현율을 각각 충족하는지 확인하라.', 'Check which thresholds meet the recall requirement.'] }
		],
		hints: [['정밀도와 재현율은 양성 예측과 실제 양성이라는 서로 다른 집합을 기준으로 한다.', 'Precision conditions on predicted positives. Recall conditions on actual positives.'], ['실제 양성 20개 중 8개를 찾으면 재현율은 40%다. 재현율 50% 이상이 필요한 경우 이 후보는 제외한다.', 'Finding 8 of 20 actual positives gives 40% recall. A 50% minimum recall excludes that candidate.']],
		solution: ['A에서 정밀도는 60/100 = 0.60, 재현율은 60/80 = 0.75이다. B의 정밀도는 40/50 = 0.8이지만 재현율은 40/80 = 0.5이다. 재현율 제약을 만족하는 A를 고른다.', 'At A, precision is 60/100 = 0.60 and recall is 60/80 = 0.75. At B, precision is 40/50 = 0.8 and recall is 40/80 = 0.5. Only A meets the recall constraint.'],
		intent: ['운영 조건을 식으로 먼저 적으면 임계값을 평가할 때 어떤 지표를 우선할지 정해진다.', 'Write down the operating constraint before comparing thresholds so you know which tradeoffs are feasible.']
	},
	{
		id: 'multiple-testing', topic: 'bio', mode: 'depth', seconds: 360,
		title: ['유전자 다중검정', 'Multiple Gene Tests'],
		targets: ['다중검정 · 거짓 양성의 기댓값 · 가족단위 오류율', 'Multiple testing · expected false positives · family-wise error'],
		prompt: ['조직 분류기에 넣을 변수를 학습 데이터에서 고른다. 두 조직 사이에 실제 발현 차이가 없는 유전자 1,000개에 보정 전 유의수준 0.05로 검정한다. 각 검정의 제1종 오류 확률은 정확히 0.05다. 거짓 양성 수의 기댓값과 가족단위 오류율을 최대 0.05로 제어하는 본페로니 검정별 기준을 구하라.', 'You are screening features for a tissue classifier using its training set. Test 1,000 genes with no true expression differences between the tissues at an unadjusted significance level of 0.05. Each test has a type I error probability of exactly 0.05. Find the expected number of false positives and the Bonferroni per-test cutoff for a family-wise error rate of at most 0.05.'],
		reference: ['E[Σ Xᵢ] = Σ E[Xᵢ]. 합집합의 확률은 각 사건 확률의 합 이하이다.', 'E[Σ Xᵢ] = Σ E[Xᵢ]. The probability of a union is at most the sum of its event probabilities.'],
		fields: [
			{ label: ['거짓 양성 수의 기댓값', 'Expected false positives'], answer: 50, feedback: ['거짓 양성의 지시변수 1,000개의 평균을 더하라.', 'Sum the expectations of the 1,000 false-positive indicators.'] },
			{ label: ['본페로니 기준', 'Bonferroni cutoff'], answer: .00005, feedback: ['검정별 기준에 검정 수를 곱하면 전체 오류 예산이 되어야 한다.', 'Multiply the per-test cutoff by the number of tests to recover the family-wise error budget.'] }
		],
		hints: [['거짓 양성 개수와 하나 이상 나올 확률은 서로 다른 양이다.', 'The number of false positives and the probability of at least one false positive describe different quantities.'], ['10개 검정으로 가족단위 오류율 0.1을 보장하려면 검정별 오류 확률을 0.01 이하로 두며, 합집합 상계는 10 × 0.01 = 0.1이다.', 'For 10 tests and a family-wise budget of 0.1, use a per-test cutoff of 0.01. The union bound is 10 × 0.01 = 0.1.']],
		solution: ['선형성에 따라 거짓 양성 수의 기댓값은 1,000 × 0.05 = 50이다. 본페로니 기준은 0.05/1,000 = 0.00005이다. 이 기준에서 거짓 양성이 하나라도 나올 확률은 합집합 상계로 0.05 이하이다.', 'Linearity of expectation gives 1,000 × 0.05 = 50 expected false positives. The Bonferroni cutoff is 0.05/1,000 = 0.00005. At that cutoff, the union bound caps the probability of any false positive at 0.05.'],
		intent: ['두 계산 모두 검정의 독립성을 요구하지 않는다. 본페로니 기준은 거짓 발견을 하나라도 할 확률을 제어한다. 새 기증자에서의 분류 성능은 변수 선택과 학습에서 제외한 기증자로 따로 평가한다.', 'Bonferroni controls the chance of making at least one false discovery even when tests are dependent. To estimate accuracy on new donors, evaluate the classifier on donors held out from feature selection and training.']
	}
];
