import {
	parse, isConstantNode, isFunctionNode, isOperatorNode, isParenthesisNode, isSymbolNode,
	type MathNode
} from 'mathjs/number';

const operators = new Set(['add', 'subtract', 'unaryPlus', 'unaryMinus', 'multiply', 'divide', 'pow']);
const functions = new Set(['sqrt', 'abs', 'log', 'exp', 'mean', 'std', 'min', 'max']);
const maxDepth = 16;

// Check each subexpression before evaluating its parent so undefined intermediate
// results cannot disappear inside a larger calculation (for example, 1/(1/0)).
function evaluateScalar(node: MathNode, depth: number): number {
	if (depth > maxDepth) return NaN;
	if (isConstantNode(node)) return typeof node.value === 'number' && Number.isFinite(node.value) ? node.value : NaN;
	if (isParenthesisNode(node)) return evaluateScalar(node.content, depth + 1);
	if (isOperatorNode(node)) {
		if (node.implicit || !operators.has(node.fn)) return NaN;
	} else if (isFunctionNode(node)) {
		if (!isSymbolNode(node.fn) || !functions.has(node.fn.name)) return NaN;
		if (node.fn.name === 'std' && node.args.length < 2) return NaN;
	} else {
		return NaN;
	}
	if (!node.args.every((arg) => Number.isFinite(evaluateScalar(arg, depth + 1)))) return NaN;
	const result = node.evaluate();
	return Number.isFinite(result) ? result : NaN;
}

export function calculate(expression: string): number {
	if (expression.length > 160) return NaN;
	const input = expression.trim().replaceAll('−', '-').replaceAll('×', '*').replaceAll('÷', '/');
	// Percentage literals keep their ordinary probability meaning inside larger formulas.
	const source = input.replace(/((?:\d*\.\d+|\d+\.?\d*)(?:e[+-]?\d+)?)\s*%/gi, '($1 / 100)');
	if (!/^[\dEe.,+*/^() \t-]+$/.test(source.replace(/\b(?:sqrt|abs|log|exp|mean|std|min|max)\b/g, ''))) return NaN;
	try {
		return evaluateScalar(parse(source), 0);
	} catch {
		return NaN;
	}
}
