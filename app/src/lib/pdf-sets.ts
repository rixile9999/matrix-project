export const PDF_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
export const PDF_SOURCE_MAX_PAGES = 600;
export const PDF_SOURCE_MAX_CHARACTERS = 1_800_000;

export type BiText = { en: string; ko: string };

export type PdfConcept = {
	id: string;
	title: BiText;
	objective: BiText;
	prerequisites: string[];
	page: number;
};

export type PdfQuestionKind = 'recall' | 'apply' | 'integrate';

export type PdfGenerationProgress = {
	stage: 'extracting' | 'planning' | 'authoring';
	completed: number;
	total: number;
};

export type PdfQuestion = {
	prompt: BiText;
	choices: BiText[];
	correct: number;
	explanation: BiText;
	page: number;
	conceptId?: string;
	kind?: PdfQuestionKind;
	integratesConceptId?: string;
	intent?: BiText;
};

export type PdfSetContent = {
	title: BiText;
	questions: PdfQuestion[];
	concepts?: PdfConcept[];
	source?: { pages: number; textPages: number };
};
