export const PDF_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
export const PDF_SOURCE_MAX_PAGES = 10;
export const PDF_PAGE_TEXT_LIMIT = 2_000;

export type BiText = { en: string; ko: string };

export type PdfQuestion = {
	prompt: BiText;
	choices: BiText[];
	correct: number;
	explanation: BiText;
	page: number;
};

export type PdfSetContent = {
	title: BiText;
	questions: PdfQuestion[];
};
