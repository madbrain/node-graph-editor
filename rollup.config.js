import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import serve from 'rollup-plugin-serve';
import conditional from 'rollup-plugin-conditional';
import livereload from 'rollup-plugin-livereload';
import copy from 'rollup-plugin-copy';
import pkg from './package.json';
import dts from "rollup-plugin-dts";

const isProduction = process.env.BUILD_TARGET === "PROD";

const outputs = [
	// browser-friendly UMD build
	{
		input: 'src/main.ts',
		output: {
			name: 'nodeGraphUi',
			file: pkg.browser,
			format: 'umd'
		},
		plugins: [
			resolve(),
			commonjs(),
			typescript(),
			conditional(!isProduction, () => [
				serve(),
				livereload({ verbose: true })
			])
		]
	}
];

if (isProduction) {
	outputs.push({
		input: 'src/main.ts',
		output: [
			{ file: pkg.main, format: 'cjs' },
			{ file: pkg.module, format: 'es' }
		],
		plugins: [
			typescript({ tsconfig: "./tsconfig.json" }),
			copy({
				targets: [
				  { src: 'src/graph-editor/editor.css', dest: 'dist' },
				  { src: 'src/image-kit/image-kit.css', dest: 'dist' },
				]
			  })
		]
	},
	{
		input: "./dist/dts/main.d.ts",
		output: [{ file: pkg.types, format: "es" }],
		plugins: [
			dts()
		],
	});
}

export default outputs;
