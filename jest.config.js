module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/__tests__/**/*.test.ts"],
  modulePathIgnorePatterns: ["<rootDir>/cdktf.out"],
  moduleFileExtensions: ["js", "ts", "json"],
  moduleNameMapper: {
    "^(cdktn|constructs)$": "<rootDir>/node_modules/$1",
  },
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: { isolatedModules: true } }],
  },
  setupFilesAfterEnv: ["<rootDir>/setup.js"],
};
