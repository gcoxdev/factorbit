export type Coordinate = readonly [row: number, column: number];
export type Matrix = number[][];

export interface Puzzle {
  factorA: bigint;
  factorB: bigint;
  product: bigint;
  productBits: string;
  matrix: Matrix;
  solutions: readonly [Matrix, Matrix];
  splitSolution: Matrix;
}

export interface RangeSettings {
  factorAMinimum: bigint;
  factorAMaximum: bigint;
  factorBMinimum: bigint;
  factorBMaximum: bigint;
}

export const DEFAULT_RANGE: RangeSettings = {
  factorAMinimum: 3n,
  factorAMaximum: 20n,
  factorBMinimum: 3n,
  factorBMaximum: 20n
};

export function toBinary(value: bigint): string {
  return (value < 0n ? 0n : value).toString(2);
}

function modularPower(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let factor = base % modulus;
  let remaining = exponent;
  while (remaining > 0n) {
    if (remaining & 1n) result = result * factor % modulus;
    factor = factor * factor % modulus;
    remaining >>= 1n;
  }
  return result;
}

const SMALL_PRIMES = [
  2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n
] as const;
const DETERMINISTIC_64_BIT_BASES = [
  2n, 325n, 9_375n, 28_178n, 450_775n, 9_780_504n, 1_795_265_022n
] as const;

export function isPrime(value: bigint): boolean {
  if (value < 2n) return false;
  for (const prime of SMALL_PRIMES) {
    if (value === prime) return true;
    if (value % prime === 0n) return false;
  }

  let oddPart = value - 1n;
  let powerOfTwo = 0;
  while ((oddPart & 1n) === 0n) {
    oddPart >>= 1n;
    powerOfTwo += 1;
  }

  const bases = value < 18_446_744_073_709_551_616n
    ? DETERMINISTIC_64_BIT_BASES
    : [...DETERMINISTIC_64_BIT_BASES, ...SMALL_PRIMES];
  return bases.every((candidate) => {
    const base = candidate % value;
    if (base === 0n) return true;
    let witness = modularPower(base, oddPart, value);
    if (witness === 1n || witness === value - 1n) return true;
    for (let round = 1; round < powerOfTwo; round += 1) {
      witness = witness * witness % value;
      if (witness === value - 1n) return true;
    }
    return false;
  });
}

function firstPrimeFrom(start: bigint, maximum: bigint): bigint | null {
  if (start <= 2n && maximum >= 2n) return 2n;
  let candidate = start <= 3n ? 3n : start | 1n;
  while (candidate <= maximum) {
    if (isPrime(candidate)) return candidate;
    candidate += 2n;
  }
  return null;
}

function firstPrimeBackward(start: bigint, minimum: bigint): bigint | null {
  let candidate = start < 2n ? 1n : start;
  if (candidate === 2n) return minimum <= 2n ? 2n : null;
  if ((candidate & 1n) === 0n) candidate -= 1n;
  while (candidate >= minimum && candidate >= 3n) {
    if (isPrime(candidate)) return candidate;
    candidate -= 2n;
  }
  return minimum <= 2n && start >= 2n ? 2n : null;
}

export function firstPrimeBetween(minimum: bigint, maximum: bigint): bigint | null {
  if (maximum < 2n || maximum < minimum) return null;
  return firstPrimeFrom(minimum < 2n ? 2n : minimum, maximum);
}

export function primesBetween(minimum: bigint, maximum: bigint): bigint[] {
  const primes: bigint[] = [];
  if (maximum < minimum) return primes;
  let candidate = firstPrimeBetween(minimum, maximum);
  while (candidate !== null) {
    primes.push(candidate);
    candidate = firstPrimeFrom(candidate + 1n, maximum);
  }
  return primes;
}

function randomBigIntBetween(
  minimum: bigint,
  maximum: bigint,
  random: () => number
): bigint {
  const span = maximum - minimum + 1n;
  const unit = Math.min(1 - Number.EPSILON, Math.max(0, random()));
  const sample = BigInt(Math.floor(unit * Number.MAX_SAFE_INTEGER));
  return minimum + sample * span / BigInt(Number.MAX_SAFE_INTEGER);
}

export function randomPrimeBetween(
  minimum: bigint,
  maximum: bigint,
  random: () => number = Math.random
): bigint {
  const first = firstPrimeBetween(minimum, maximum);
  if (first === null) throw new Error('Range contains no prime numbers.');
  const unit = Math.min(1 - Number.EPSILON, Math.max(0, random()));
  const start = randomBigIntBetween(minimum, maximum, () => unit);
  return unit < 0.5
    ? firstPrimeFrom(start, maximum) ??
        firstPrimeFrom(minimum, start - 1n) ??
        first
    : firstPrimeBackward(start, minimum) ??
        firstPrimeBackward(maximum, start + 1n) ??
        first;
}

export function startingMatrix(productBits: string): Matrix {
  return Array.from({ length: productBits.length }, (_, row) =>
    Array.from(productBits, (bit) => (row === 0 && bit === '1' ? 1 : 0))
  );
}

export function solutionMatrix(factorRows: bigint, factorColumns: bigint, width: number): Matrix {
  const rowBits = toBinary(factorRows).padStart(width, '0');
  const columnBits = Array.from(toBinary(factorColumns).padStart(width, '0'), Number);
  const zeroRow = Array(width).fill(0) as number[];

  return Array.from(rowBits)
    .reverse()
    .map((bit) => (bit === '1' ? [...columnBits] : [...zeroRow]));
}

export function collapseToFirstRow(matrix: Matrix): Matrix {
  const size = matrix.length;
  const collapsed = Array.from({ length: size }, () => Array(size).fill(0) as number[]);

  matrix.forEach((row, rowIndex) => {
    if (row.length !== size) throw new Error('Solution matrix must be square.');
    row.forEach((count, columnIndex) => {
      if (!count) return;
      const targetColumn = originIndex([rowIndex, columnIndex]);
      if (targetColumn < 0 || targetColumn >= size) {
        throw new Error('Signals below the value diagonal cannot collapse to the first row.');
      }
      collapsed[0][targetColumn] += count;
    });
  });

  return collapsed;
}

export function createPuzzle(factorA: bigint, factorB: bigint): Puzzle {
  const product = factorA * factorB;
  const productBits = toBinary(product);
  const solutionA = solutionMatrix(factorA, factorB, productBits.length);
  const solutionB = solutionMatrix(factorB, factorA, productBits.length);
  return {
    factorA,
    factorB,
    product,
    productBits,
    matrix: startingMatrix(productBits),
    solutions: [solutionA, solutionB],
    splitSolution: collapseToFirstRow(solutionA)
  };
}

export function randomPuzzle(
  range: RangeSettings = DEFAULT_RANGE,
  random: () => number = Math.random
): Puzzle {
  let factorA: bigint;
  let factorB: bigint;
  try {
    factorA = randomPrimeBetween(range.factorAMinimum, range.factorAMaximum, random);
  } catch {
    throw new Error('Factor A range contains no prime numbers.');
  }
  try {
    factorB = randomPrimeBetween(range.factorBMinimum, range.factorBMaximum, random);
  } catch {
    throw new Error('Factor B range contains no prime numbers.');
  }
  return createPuzzle(factorA, factorB);
}

export function cloneMatrix(matrix: Matrix): Matrix {
  return matrix.map((row) => [...row]);
}

export function sameMatrix(left: Matrix, right: Matrix): boolean {
  return left.every((row, rowIndex) =>
    row.every((value, columnIndex) => value === right[rowIndex]?.[columnIndex])
  );
}

export function isSolved(matrix: Matrix, solutions: Puzzle['solutions']): boolean {
  return solutions.some((solution) => sameMatrix(matrix, solution));
}

export function originIndex([row, column]: Coordinate): number {
  return column - row;
}

export function diagonalCells(size: number, coordinate: Coordinate): Coordinate[] {
  const diagonal = originIndex(coordinate);
  if (diagonal < 0) return [];
  return Array.from({ length: size - diagonal }, (_, row) => [row, row + diagonal] as const);
}

export function isSameCoordinate(left: Coordinate, right: Coordinate): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

export function canSplit(matrix: Matrix, coordinate: Coordinate): boolean {
  const nextOrigin = originIndex(coordinate) + 1;
  if (nextOrigin >= matrix.length) return false;
  let emptyCells = 0;
  for (let row = 0; row < matrix.length - nextOrigin; row += 1) {
    if (matrix[row][row + nextOrigin] === 0) emptyCells += 1;
    if (emptyCells === 2) return true;
  }
  return false;
}

export function canJoin(matrix: Matrix, coordinate: Coordinate): boolean {
  const [row, column] = coordinate;
  return originIndex(coordinate) > 0 && matrix[row][column] >= 2;
}

export function moveToken(matrix: Matrix, from: Coordinate, to: Coordinate): Matrix {
  if (originIndex(from) !== originIndex(to)) throw new Error('Tokens can only move on their diagonal.');
  if (matrix[from[0]]?.[from[1]] < 1) throw new Error('The source cell is empty.');
  const next = cloneMatrix(matrix);
  next[from[0]][from[1]] -= 1;
  next[to[0]][to[1]] += 1;
  return next;
}

export function splitToken(matrix: Matrix, coordinate: Coordinate): Matrix {
  if (!canSplit(matrix, coordinate)) throw new Error('This signal cannot be split here.');
  const next = cloneMatrix(matrix);
  const nextOrigin = originIndex(coordinate) + 1;
  next[coordinate[0]][coordinate[1]] -= 1;
  next[0][nextOrigin] += 2;
  return next;
}

export function joinTokens(matrix: Matrix, coordinate: Coordinate): Matrix {
  if (!canJoin(matrix, coordinate)) throw new Error('Two signals are required to join.');
  const next = cloneMatrix(matrix);
  const previousOrigin = originIndex(coordinate) - 1;
  next[coordinate[0]][coordinate[1]] -= 2;
  next[0][previousOrigin] += 1;
  return next;
}

export function representedValue(matrix: Matrix): bigint {
  const width = matrix.length;
  let total = 0n;
  for (let rowIndex = 0; rowIndex < width; rowIndex += 1) {
    const row = matrix[rowIndex];
    for (let columnIndex = rowIndex; columnIndex < row.length; columnIndex += 1) {
      const count = row[columnIndex];
      if (count === 0) continue;
      const exponent = width - 1 - columnIndex + rowIndex;
      total += BigInt(count) * (1n << BigInt(exponent));
    }
  }
  return total;
}

export function cellValue(size: number, coordinate: Coordinate): bigint {
  return 1n << BigInt(size - 1 - originIndex(coordinate));
}
