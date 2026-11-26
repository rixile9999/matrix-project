export const load = ({ locals, depends }) => {
	depends('matrix:locale');
	return { accountName: locals.user?.name ?? null, locale: locals.locale };
};
