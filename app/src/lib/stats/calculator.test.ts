import { expect, it } from 'vitest';
import { calculate } from './calculator.ts';

it.each([
	['−2.5e-1', -0.25], ['-1 / +4', -0.25], ['87.5 %', 0.875],
	['1 - (1/2)^3', 0.875], ['sqrt(9) / (3 + 1)', 0.75],
	['mean(1, 2, 6)', 3], ['std(1, 2, 3)', 1], ['log(8,2)', 3], ['exp(0)', 1],
	['abs(-5) + min(0,2) - max(1,3)', 2], ['100 + 5%', 100.05], ['3 × (8 ÷ 2)', 12], ['-2^2', -4], ['2^3^2', 512], ['1 + 2 * 3', 7]
] as const)('evaluates %s', (input, expected) => expect(calculate(input)).toBe(expected));

it.each([
	'', 'sqrt(-1)', '1/0', '1/(1/0)', '1e999', '0x2', 'sqrt(1', 'sqrt(4,2)', 'pi',
	'[1,2]', 'a=2', '2(3)', '4!', 'std(3)', 'sin(0)', '2;3', '1 + #comment',
	'('.repeat(18) + '1' + ')'.repeat(18), '1'.repeat(161)
])('rejects invalid or unsupported input %j', (input) => expect(calculate(input)).toBeNaN());
