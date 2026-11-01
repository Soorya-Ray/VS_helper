module.exports = [
  { id: 'py-add', language: 'python', fileName: 'add.py', prefix: '# Return the sum of two numbers.\ndef add(a, b):\n    ', suffix: '', patterns: ['return', 'a', 'b'] },
  { id: 'py-squares', language: 'python', fileName: 'squares.py', prefix: '# Return the square of each number.\ndef squares(numbers):\n    ', suffix: '', patterns: ['return', 'for'] },
  { id: 'py-even', language: 'python', fileName: 'even.py', prefix: '# Return only even numbers.\ndef even(numbers):\n    ', suffix: '', patterns: ['return', '%'] },
  { id: 'py-unique', language: 'python', fileName: 'unique.py', prefix: '# Return distinct values in original order.\ndef unique(values):\n    ', suffix: '', patterns: ['return', 'values'] },
  { id: 'js-add', language: 'javascript', fileName: 'add.js', prefix: '// Return the sum.\nfunction add(a, b) {\n    ', suffix: '\n}', patterns: ['return', '+'] },
  { id: 'js-even', language: 'javascript', fileName: 'even.js', prefix: '// Return even numbers.\nfunction even(numbers) {\n    ', suffix: '\n}', patterns: ['filter', '%'] },
  { id: 'js-fetch', language: 'javascript', fileName: 'fetch.js', prefix: '// Fetch a URL and return parsed JSON.\nasync function getJson(url) {\n    ', suffix: '\n}', patterns: ['fetch', 'json'] },
  { id: 'js-object', language: 'javascript', fileName: 'object.js', prefix: 'const calculator = {\n  // Return the product of a and b.\n  multiply(a, b) {\n    ', suffix: '\n  }\n};', patterns: ['return', '*'] },
  { id: 'ts-clamp', language: 'typescript', fileName: 'clamp.ts', prefix: '// Clamp value to min and max.\nfunction clamp(value: number, min: number, max: number): number {\n    ', suffix: '\n}', patterns: ['Math.min', 'Math.max'] },
  { id: 'ts-first', language: 'typescript', fileName: 'first.ts', prefix: '// Return first array element or undefined.\nfunction first<T>(items: T[]): T | undefined {\n    ', suffix: '\n}', patterns: ['return', '[0]'] },
  { id: 'ts-guard', language: 'typescript', fileName: 'guard.ts', prefix: '// Check if value is a string.\nfunction isString(value: unknown): value is string {\n    ', suffix: '\n}', patterns: ['typeof', 'string'] },
  { id: 'ts-record', language: 'typescript', fileName: 'record.ts', prefix: '// Read key from record, falling back to zero.\nfunction read(record: Record<string, number>, key: string): number {\n    ', suffix: '\n}', patterns: ['record[key]', '0'] }
];
