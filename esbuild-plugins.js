// Plugins de esbuild para serverless-esbuild.
// @anatine/esbuild-decorators ejecuta tsc por archivo cuando detecta decoradores
// para emitir el metadata (`design:paramtypes`) que NestJS necesita para DI.
const { esbuildDecorators } = require('@anatine/esbuild-decorators');

module.exports = [
  esbuildDecorators({
    tsconfig: './tsconfig.json',
    cwd: process.cwd(),
  }),
];
