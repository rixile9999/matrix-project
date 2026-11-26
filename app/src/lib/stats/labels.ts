import type { Copy, Mode, Outcome, Topic } from './types.ts';

export const topicNames: Record<Topic, Copy> = {
	probability: ['확률', 'Probability'],
	inference: ['통계적 추론', 'Statistical Inference'],
	ml: ['머신러닝', 'Machine Learning'],
	bio: ['생물정보학', 'Bioinformatics']
};

export const modeNames: Record<Mode, Copy> = {
	speed: ['속도', 'Speed'],
	accuracy: ['정확도', 'Accuracy'],
	depth: ['깊이', 'Depth']
};

export const statuses: Record<Outcome | 'active' | 'new', Copy> = {
	passed: ['정답', 'Solved'],
	revealed: ['답안 열람', 'Solution viewed'],
	timeout: ['시간 초과', 'Time expired'],
	active: ['진행 중', 'In progress'],
	new: ['미시도', 'Untried']
};

export const actionErrors = {
	unavailable: ['이 세션을 찾을 수 없습니다.', 'This session is unavailable.'],
	invalid: ['각 칸에 수를 입력하세요.', 'Enter a number in every field.'],
	hints: ['힌트를 두 단계까지 확인하세요.', 'Open both hints to unlock the solution.']
} satisfies Record<string, Copy>;
