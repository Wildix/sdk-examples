module.exports = {
    root: true,
    extends: [
        '../../node_modules/@wildix/eslint-config-style-guide',
        '../../node_modules/@wildix/eslint-config-style-guide/typescript',
        '../../node_modules/@wildix/eslint-config-style-guide/imports',
        '../../node_modules/@wildix/eslint-config-style-guide/prettier'
    ],
    parserOptions: {
        project: true,
        tsconfigRootDir: __dirname
    },
}
