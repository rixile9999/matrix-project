export type Locale = 'en' | 'ko';

export function parseLocale(value: string | undefined): Locale {
	return value === 'ko' ? 'ko' : 'en';
}

const labels: Record<string, string> = {
	'기본 문법': 'Basic syntax', '컬렉션': 'Collections', 'fold·누적': 'Folds', '패턴 매칭': 'Pattern matching',
	'문자열': 'Strings', '재귀': 'Recursion', '지연 평가': 'Lazy evaluation', '타입·ADT': 'Types and ADTs',
	'함수': 'Functions', '컴파일러 변환': 'Compiler transformations', '기본': 'Basic', '응용': 'Applied', '복합': 'Advanced',
	'개념': 'Concept', '알아보기': 'Recognition', '풀이 과정': 'Steps', '핵심 한 줄': 'Key line',
	'순서 배열': 'Put in order', '값 추적': 'Trace a value', '버그 줄 찾기': 'Find the bug', '접근법 고르기': 'Choose an approach',
	'모름': 'Forgot', '흔들림': 'Shaky', '기억남': 'Recalled',
	'문제': 'Problem', '내 코드': 'Your code', '채점 결과': 'Test results', '모범답안': 'Model answer',
	'해설': 'Notes', '출제 취지': 'Learning objective', '카드 질문': 'Card question', '정답 포인트': 'Key points',
	'정답 코드': 'Answer code', '풀이 유형': 'Solution pattern',
	'스피드': 'Speed', '표준': 'Standard', '깊이': 'Depth',
	'쉬운 문제를 빠르게': 'Easy problems at speed', '내 레이팅 근처': 'Near your rating',
	'레이팅보다 어려운 문제를 길게': 'More time for harder problems'
};

export function englishLabel(source: string): string {
	return Object.hasOwn(labels, source) ? labels[source] : source;
}
