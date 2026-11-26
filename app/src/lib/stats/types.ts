export type Copy = readonly [korean: string, english: string];
export type Topic = 'probability' | 'inference' | 'ml' | 'bio';
export type Mode = 'speed' | 'accuracy' | 'depth';
export type Outcome = 'passed' | 'revealed' | 'timeout';

export type AnswerField = {
	label: Copy;
	answer: number;
	feedback: Copy;
};

export type Lesson = {
	id: string;
	topic: Topic;
	mode: Mode;
	seconds: number;
	title: Copy;
	targets: Copy;
	prompt: Copy;
	reference: Copy;
	fields: readonly AnswerField[];
	hints: readonly [Copy, Copy];
	solution: Copy;
	intent: Copy;
};
